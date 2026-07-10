# CAS-1826 — Sistema de Aturdimiento por Postura (Poise / Stagger)

**Owner:** CTO (decomposition + números) · **Chain:** Build → Deploy → QA → Gate CEO
**Product call (CEO):** payoff que une la cadena de combate (Telegrafía CAS-1790 · Parada CAS-1785 · Esquiva CAS-1814 · Habilidades CAS-1819). Barra de POSTURA oculta por enemigo; al romperse → ATURDIDO (ventana de burst). Cierra el loop "leer → reaccionar → castigar".

---

## Decisión de arquitectura: BORROW, no build (≈$0 código nuevo)

El mapeo del código confirma que casi toda la maquinaria ya vive:

| Necesidad | Maquinaria existente a REUSAR | Ref |
|---|---|---|
| Congelar IA del enemigo aturdido | **`e.stun` gate** — `if(e.stun>0){ e.stun-=dt; …; continue; }` congela IA, sólo deja correr knockback | sim.js:3274 |
| Daño aumentado en stagger | **Sink de multiplicadores deterministas** en `hitEnemy` (mirror FRENZY/PARRY: `dmg*=…`, **consume 0 srand**) | sim.js:~1943-1948 |
| Gating por tier | Patrón estándar `e.elite||e.champion||e.champElite||e.isBoss` (básicos = ninguno) | sim.js:1940 |
| Save byte-idéntico | Enemigos **nunca** serializados (`serializeSave` sólo héroe) → campos de postura transitorios, coste-save 0 | sim.js:1402-1472 |
| Pulso de postura en parry | Seam tras `h._parryRiposte=1;` en `damageHero` | sim.js:~3831 |
| Bonus por castigar telegrafía | `e.st>0` (lead de telegrafía activo) al golpear | sim.js:3210/3383 |
| VFX $0 | `addFx("spellburst",…,{col})` al romper + tinte/estrellas proc; sin arte nuevo | sim.js:1571 / render.js:1452+ |

**Clave:** STAGGER **es** un stun disparado por postura. Rompemos postura → seteamos `e.stun = staggerDur` (reusa el gate de IA 100%, **cero código nuevo de IA**) **y** `e.staggerT = staggerDur` (marca la ventana de daño-bonus + VFX). El único estado nuevo son 4 campos transitorios en el enemigo.

---

## Requisitos NO-NEGOCIABLES (patrón de la casa)

1. **$0 arte** — VFX proc reusando `spellburst` + tinte/estrellas. Sin PNG nuevos.
2. **RNG-neutral STRONG** — la postura es **100% determinista** (acumulación aritmética + umbral; sin draws). ⇒ **NO se crea `poiseRng`** (no hay nada que sembrar). QA verifica srand ON==OFF con stagger **disparando de verdad** (mirror lección CAS-1786/1822: probar la feature firing, no sólo el flag). Si un futuro cambio introdujera draws, entonces sí stream dedicado.
3. **Save aislado** — 4 campos nuevos son estado de run transitorio del enemigo (`G.enemies` nunca se serializa). Save byte-idéntico automático, ON u OFF. Nada nuevo en `mithralda.*`.
4. **1 solo knob** `POISE` con `enabled` + params. `enabled:false` ⇒ ningún campo se toca, ninguna rama corre ⇒ comportamiento **idéntico** (byte-id).
5. **Sin regresiones** parry/dodge/telegraph/abilities — los seams son aditivos (sumas de postura), no reescriben esas rutas.

---

## Estado nuevo del enemigo (transitorio, en spawnEnemy)

```
poise:0,          // postura acumulada actual
poiseMax:<tier>,  // techo (derivado del tier al spawnear)
staggerT:0,       // timer de la ventana de daño-bonus (>0 = aturdido)
staggerCD:0,      // cooldown de re-aturdimiento (evita lock infinito)
_poiseDecayT:0,   // tiempo desde el último golpe (para decaer)
```

`poiseMax` sólo se setea si `POISE.enabled && (elite||champion||champElite||isBoss || (POISE.basicMelee && es-melee-básico))`. Si no aplica ⇒ `poiseMax=0` ⇒ nunca acumula ⇒ enemigo intacto.

## Knob (config.js, junto a ENEMY_ABILITIES ~línea 1091)

```js
export const POISE = {
  enabled:true,
  basicMelee:false,        // v1: sólo élites/campeones/jefes; true incluye melee básicos
  gain:{ light:12, heavy:26, ultimate:40, parry:40, telegraphPunish:25 }, // postura por evento
  decayDelay:2.5,          // s sin golpear antes de empezar a decaer
  decayRate:18,            // postura/s de decaimiento
  reStaggerCD:6.0,         // s de cooldown tras un stagger antes de re-acumular
  elite:{  max:100, dur:1.6, bonusDmg:1.5 },   // élites/campeones
  boss:{   max:280, dur:1.0, bonusDmg:1.9 },   // jefe: más postura, aturdimiento corto, apertura MAYOR (clímax)
};
```

Selección de perfil: `e.isBoss ? POISE.boss : POISE.elite`. `poiseMax = profile.max`.

## Seams de implementación (Build)

**A. spawnEnemy** — inicializa los 5 campos; setea `poiseMax` sólo si aplica el gating.

**B. hitEnemy (sim.js ~1943, DENTRO del gating existente):**
- Ganancia: si `POISE.enabled && e.poiseMax>0 && e.staggerCD<=0 && e.staggerT<=0`:
  `e.poise += gain` donde gain = ultimate>heavy>light (deriva del flag de golpe pesado ya presente en `opt`, p.ej. `opt.heavy`/ultimate; si no hay flag, light). Bonus telegrafía: si `TELEGRAPH.enabled && e.st>0` suma `gain.telegraphPunish`.
  `e._poiseDecayT=0`.
- Umbral: si `e.poise >= e.poiseMax` ⇒ **romper**: `const p = e.isBoss?POISE.boss:POISE.elite; e.stun=Math.max(e.stun,p.dur); e.staggerT=p.dur; e.staggerCD=POISE.reStaggerCD; e.poise=0; addFx("spellburst",e.x,e.y-2,{col:"#ffe27a"}); floater(e.x,e.y-30,STR.stagger||"¡ATURDIDO!","#ffe27a");`
- Bonus daño (mirror FRENZY, **multiply determinista, 0 srand**): antes de `e.hp-=dmg`, `if(POISE.enabled && e.staggerT>0){ dmg*=(e.isBoss?POISE.boss:POISE.elite).bonusDmg; }`

**C. updateEnemies** — decremento de timers (junto al gate de stun):
`if(e.staggerT>0) e.staggerT-=dt; if(e.staggerCD>0) e.staggerCD-=dt;`
Decaimiento: `if(e.poise>0 && e.staggerT<=0){ e._poiseDecayT+=dt; if(e._poiseDecayT>POISE.decayDelay){ e.poise=Math.max(0,e.poise-POISE.decayRate*dt); } }`
El congelamiento de IA **ya lo hace** el gate `e.stun>0` — no se toca esa lógica.

**D. damageHero parry seam (sim.js ~3831, tras `h._parryRiposte=1;`):**
`if(POISE.enabled && src && src.poiseMax>0 && src.staggerCD<=0 && src.staggerT<=0){ src.poise=Math.min(src.poiseMax, (src.poise||0)+POISE.gain.parry); src._poiseDecayT=0; }` (sinergia directa CAS-1785).

**E. render/VFX** — tinte/estrellas mientras `e.staggerT>0`: reusa `spellburst` (ya coloreable) + un tinte proc sobre el sprite (mirror aura de hurtFlash). Sin arte nuevo. HUD opcional: pip-bar de postura sobre élites al recibir daño (proc, $0).

**F. strings.js** — `stagger:"¡ATURDIDO!"` (1 string, patrón STR).

## Archivos tocados (para deploy/QA md5)
`sim/config.js` (knob) · `sim/sim.js` (spawn/hit/update/parry) · `render/render.js` (tinte/estrellas + pip) · `strings.js` (1 string). GE confirma el set exacto en su handoff.

## Acceptance (para el harness de Build/QA)
- **AC1 OFF byte-id:** `POISE.enabled=false` ⇒ save.v1 idéntico + secuencia de golpes idéntica (outsideDiffs=0). Enemigos sin `poiseMax` intactos.
- **AC2 srand ON==OFF:** 48-draw idéntico con stagger **firing real** (postura llenándose y rompiendo). Confirma 0 draws en la ruta de postura.
- **AC3 acumula/rompe:** N golpes llenan `poise` → `staggerT>0` + `e.stun` seteado → IA congelada (no ataca/mueve) → `dmg*=bonusDmg` verificable.
- **AC4 decae:** sin golpear `decayDelay`s la postura baja a decayRate; no trivializa.
- **AC5 re-stagger CD:** tras un stagger no re-acumula hasta `reStaggerCD`; no hay lock infinito.
- **AC6 jefe:** `poiseMax` mayor, `dur` menor, `bonusDmg` mayor que élite.
- **AC7 sinergia:** parada exitosa suma `gain.parry`; castigar telegrafía suma `gain.telegraphPunish`.
- **AC8 no-persist:** save/reload no conserva postura (transitorio).
- **REG:** parry/dodge/telegraph/abilities harnesses siguen PASS.
