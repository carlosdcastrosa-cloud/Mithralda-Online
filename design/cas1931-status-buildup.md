# CAS-1931 — EVO Pilar 21: Acumulación de Estados (STATUS_BUILDUP: Sangrado / Veneno / Escarcha)

**Umbrella:** [CAS-1931](/CAS/issues/CAS-1931) · **Autor:** CTO · **Fecha:** 2026-07-10
**Cadena:** Build → Deploy → QA (PASS×2 live, md5 live==HEAD) → Gate CEO. Umbrella cierra por `children_completed`.
**Live base:** `7d47bd4f163f`/799 (HEAD `23ccaeb`). URL: https://carlosdcastrosa-cloud.github.io/Mithralda-Online/

## Objetivo (1 frase)
Con los 20 pilares melee vivos, el salto de profundidad es un sistema Souls-like de **acumulación de estado**:
barras OCULTAS de *buildup* por tipo que **PROCEAN un efecto en ráfaga al llenarse** y **DECAEN** si no se sostiene la
presión — recompensa castigar sostenido, castiga picotear — **componiendo** con casi todo lo shipeado (WEAPON_BUFFS
frost/ember, THROWABLES firebomb-burn, WEAPON_AFFIXES, ENEMY_ABILITIES). **100% BORROW** sobre la máquina de status YA
viva (`applyStatus`/`tickDots`/`STATUS` CAS-118), **sin arte, sin save nuevo, sin RNG nuevo**, 1 knob.

## Por qué este seam (100% BORROW — la máquina de status ya existe)
La casa YA tiene un motor de estados data-driven (`sim.js:2953 applyStatus` + `sim.js:2972 tickDots` + `config.js:550
STATUS`) compartido por **héroe y enemigos** (paridad ya cableada). Hoy cada golpe elemental aplica el status **al
instante**. El buildup **reconvierte ese instante en acumulación**: cada golpe SUMA a un medidor oculto; al cruzar el
umbral ⇒ **PROC** (aplica la versión fuerte reusando el MISMO `applyStatus`/DoT/slow) + reset del medidor. El medidor
DECAE con el tiempo. Es una **capa temporal delante de `applyStatus`**, no un status nuevo en el motor.

- **Medidor oculto por tipo**: nuevo transitorio `ent.bld = {bleed:0,poison:0,frost:0}` en héroe (`createHero`
  `sim.js:353`, junto a `dots:null`) y enemigo (`spawn` `sim.js:1649`, junto a `dots:null`). **Nunca serializado**
  (los enemigos no persisten; el héroe `bld` es transitorio como `dots`/`slowT` — fuera del allowlist de save).
- **Decae**: `tickBuildup(ent,dt)` resta `decayPerSec*dt` a cada medidor (clamp a 0), llamado justo al lado de
  `tickDots` (`sim.js:3705` héroe, `sim.js:3859` enemigos). 0 RNG.
- **Proc reusa el motor vivo** (compone, no reemplaza): al llenarse se llama `applyStatus`/burst con el MISMO status —
  no bypassa poise/i-frames, no abre stream.

## Diseño de los 3 estados (números = FEEL/CEO, tunables sin rebuild)
- **Sangrado (bleed)** — HEADLINE observable. Fed por **todo golpe físico melee** (siempre-on ⇒ el jugador ve el
  medidor subir golpeando y la ráfaga al llenarse, DoD OBSERVABLE). Proc = **ráfaga = % de HP máx del objetivo**
  (`e.maxHp` enemigo / `heroMaxHp(h)` héroe). Jefes (`e.isBoss`): umbral mayor + `procPctHp` menor (resistencia).
- **Veneno (poison)** — Fed por fuentes elementales de fuego/veneno reconvertidas (afijo Ardiente `burn`, boon Sangre
  de Brasa, WEAPON_BUFFS.ember, THROWABLES firebomb, afijo/talento poison — vía `elementMap`). Proc = **DoT `poison`
  fuerte durante N s** (reusa `applyStatus(ent,"poison",…)`, mismo motor que hoy).
- **Escarcha (frost)** — Fed por WEAPON_BUFFS.frost (reconvertido del `slow` instantáneo) + ataques de hielo enemigos.
  Proc = **`slow` fuerte + drena estamina** (reusa `applyStatus(ent,"slow",…)` YA existente + `spendStam`/drain para
  el héroe; enemigos sólo slow). Contra/de élites móviles.

## Paridad justa (el héroe también RECIBE buildup)
Choke enemigo→héroe = `damageHero` `sim.js:4496` (`if(infl&&infl.type) applyStatus(h,infl.type,infl)`) — único punto
por el que el héroe sufre status. La rama de buildup se inserta AHÍ (mapea `infl.type` vía `elementMap`) + el golpe
físico melee enemigo alimenta el `bleed` del héroe. Mismo helper `addBuildup`, misma tabla, mismos procs. Simétrico.

## Fuente de verdad del feed (elementMap — 1 tabla en el knob, FEEL/CEO-tunable)
Cada fuente on-hit existente enruta a un medidor. **Reconversión gated**: `if(STATUS_BUILDUP.enabled){ addBuildup(...) }
else { applyStatus(...) tal cual HEAD }` ⇒ **OFF byte-idéntico** (los golpes elementales aplican status instantáneo
exactamente como hoy). `bleed` es tipo NUEVO (no existe en `STATUS`) ⇒ sólo se alimenta por físico melee, no rompe HEAD.
```
elementMap: { burn:"poison", slow:"frost", frost:"frost", poison:"poison" }   // physical melee ⇒ bleed (explícito en el sink)
```

## Knob (1 config `STATUS_BUILDUP`, config-tunable sin rebuild)
```js
export const STATUS_BUILDUP = {
  enabled: true,
  decayPerSec: 14,          // el buildup drena esto/s si no se sostiene (castiga picotear; recompensa presión)
  bossBuildMul: 0.55,       // jefes/élites (e.isBoss) acumulan MÁS lento (mul sobre lo añadido) ⇒ umbral efectivo mayor
  elementMap: { burn:"poison", slow:"frost", frost:"frost", poison:"poison" },
  // Números = FEEL/CEO, tunables sin rebuild.
  types: {
    // Sangrado: fed por físico melee; proc = ráfaga % HP máx. HEADLINE observable en loop.
    bleed:  { threshold:100, build:16, procPctHp:0.14, bossProcPctHp:0.06, tint:"#d11e2e" },
    // Veneno: fed por fuego/veneno reconvertido; proc = DoT poison fuerte N s (reusa STATUS.poison).
    poison: { threshold:100, build:22, procDot:{dmg:7,dur:5.0},           tint:"#7bd14a" },
    // Escarcha: fed por frost buff + hielo enemigo; proc = slow fuerte + drena estamina.
    frost:  { threshold:100, build:26, procSlow:{amt:0.45,dur:2.2}, procStamDrain:22, tint:"#7fd3ff" },
  },
};
```

## Seam plan (100% BORROW — dónde toca)
`sim/config.js` — el knob `STATUS_BUILDUP` (nuevo bloque, no toca `STATUS`).

`sim/sim.js`:
1. **Estado transitorio**: `bld:null` en `createHero` (`sim.js:353`, junto a `dots:null`) y en `spawn` (`sim.js:1649`).
   Perezoso: `ent.bld` se crea (`{bleed:0,poison:0,frost:0}`) en el primer `addBuildup` ⇒ 0 alloc sin buildup (mirror
   `dots=null`). Reset en respawn/enterPlay donde ya se limpia `dots=null` (`sim.js:6651,6731,6763,6855` + `enterPlay`).
2. **`addBuildup(ent, btype, srcAmt, isHero)` helper gated** — `if(!STATUS_BUILDUP.enabled) return false;` sube
   `ent.bld[btype]` en `type.build*(ent.isBoss?bossBuildMul:1)`; si `>= threshold*(isBoss?…)` ⇒ **PROC** (reset a 0 +
   `procBuildup(ent,btype,isHero)`) y devuelve true. Determinista, 0 draws.
3. **`procBuildup(ent, btype, isHero)`** — bleed ⇒ `ent.hp -= round(maxHp*procPctHp)` (ráfaga defence-bypass, mirror
   tick DoT; jefe usa `bossProcPctHp`) + floater; poison ⇒ `applyStatus(ent,"poison",procDot)`; frost ⇒
   `applyStatus(ent,"slow",procSlow)` + (héroe) `h.stam=max(0,h.stam-procStamDrain)`. VFX $0: `floater`/`addFx` tinte.
   Muerte por ráfaga bleed ⇒ enrutar al path real (`killEnemy`/`heroDie`) como hace `tickDots`.
4. **`tickBuildup(ent,dt)`** — decae cada medidor `-= decayPerSec*dt` (clamp 0); si todo 0 ⇒ `ent.bld=null`. Llamado
   junto a `tickDots` (héroe `sim.js:3705`, enemigos `sim.js:3859`). Sin buildup ⇒ no-op (mirror `tickDots` early-out).
5. **Feed hero→enemy (reconversión gated)**: en el bloque de status on-hit de `hitEnemy`
   (`sim.js:2247` burn/poison boons, `2259` WEAPON_BUFFS ember/frost, `2319` afijo) — envolver cada `applyStatus(e,…)`
   elemental en `if(STATUS_BUILDUP.enabled){ addBuildup(e, elementMap[type]||"poison", 1, false) } else { applyStatus(e,…) }`.
   **Físico melee ⇒ bleed**: en `hitEnemy` con `opt&&opt.melee`, `if(STATUS_BUILDUP.enabled) addBuildup(e,"bleed",1,false)`
   (siempre-on, headline). Cuidado: cada sitio conserva su comportamiento OFF byte-id.
6. **Feed enemy→hero (paridad)**: en `damageHero` `sim.js:4496` — envolver `applyStatus(h,infl.type,infl)` igual
   (`STATUS_BUILDUP.enabled ⇒ addBuildup(h, elementMap[infl.type]||…, 1, true)` cuando `infl.type` está mapeado; físico
   melee enemigo ⇒ `addBuildup(h,"bleed",1,true)`).
7. **Probe/debug hooks** (dev-only, patrón `__hooks`): leer `ent.bld`, forzar buildup, leer procs.

`render/render.js` — **$0 arte**: mini-barra/glyph de buildup sobre la entidad cuando `ent.bld[t]>0` (primitivas +
`type.tint`, patrón de los tintes/anillos de status ya dibujados) + flash de PROC (reusa `addFx`/`floater`). Sin sprites.
Sólo si el conteo de blobs lo justifica; si el feedback vive en `floater`/`addFx` (sim), render puede NO tocarse.

## Requisitos de calidad (NO negociables — idénticos a pilares 1-20)
1. **1 knob `STATUS_BUILDUP`** con `enabled` (OFF ⇒ byte-idéntico a HEAD: reconversión cae a `applyStatus` instantáneo
   original, `bleed` inerte, 0 medidor, 0 tick, 0 proc, 0 HUD) + params por tipo tunables sin rebuild.
2. **RNG-neutral STRONG**: buildup 100% determinista (suma/resta aritmética), **0 draws** (sin `buildupRng`). srand
   ON==OFF 48-draw; `buildupProc` observable pero **0-draw**. Sin tocar streams existentes.
3. **Save-neutral**: `ent.bld` transitorio (mirror `dots`/`slowT`), **fuera del allowlist de save**; `save.v1` byte-id
   sin clave `bld*`/`buildup*`. (NO crecer `save.v1`.)
4. **$0 arte**: barras/glyphs procedurales + `floater`/`addFx`/tinte de status vivos. Sin sprites/audio nuevos.
5. **Compone sin regresión**: reusa `applyStatus`/`tickDots`/`STATUS`; procs no bypassan poise/i-frames; baseline ×1
   (threshold alto / feed off) ⇒ 0 regresión; 20 pilares vivos.
6. **Paridad**: el héroe recibe buildup de enemigos por el MISMO helper/tabla (`damageHero` choke).
7. **Móvil**: feedback visible en HUD/entidad touch (barra/glyph); sin nuevo control (buildup es pasivo on-hit).
8. **0 regresión**: OFF ⇒ combate byte-id; frost/ember/burn/poison instantáneos exactamente como HEAD cuando OFF.

## Aceptación (harness `tools/cas1931-status-buildup.mjs`, PASS×2 byte-id)
- **AC0 OFF**: `enabled:false` ⇒ serialize + combate byte-id a HEAD. Golpes elementales aplican status **instantáneo**
  como hoy (reconversión cae al `applyStatus` original); `bleed` no existe; sin `bld`/tick/proc/HUD.
- **AC1 baseline**: ON pero medidor por debajo del umbral ⇒ ningún proc; feel 20 pilares conservado; sin ráfaga.
- **AC2 bleed**: N golpes físicos melee llenan `bld.bleed` ⇒ al cruzar `threshold` PROC ráfaga = `round(maxHp*procPctHp)`
  de HP (defence-bypass) + reset a 0; jefe (`isBoss`) usa `bossProcPctHp` + acumula ×`bossBuildMul` (umbral efectivo
  mayor); muerte por ráfaga enruta a `killEnemy`.
- **AC3 poison**: fuente `burn`/`poison` (afijo/ember/firebomb) reconvertida ⇒ alimenta `bld.poison`; al llenarse
  ⇒ `applyStatus(e,"poison",procDot)` fuerte (DoT N s, mismo motor); sin proc no aplica veneno instantáneo (reconvertido).
- **AC4 frost**: WEAPON_BUFFS.frost reconvertido ⇒ alimenta `bld.frost`; al llenarse ⇒ `applyStatus(e,"slow",procSlow)`
  fuerte + (héroe) drena `stam` en `procStamDrain`; enemigos sólo slow.
- **AC5 decae**: sin sostener, `bld[t]` baja `decayPerSec/s` a 0 (`tickBuildup`); picotear no procea (umbral no se cruza).
- **AC6 paridad héroe**: enemigo con `infl` elemental / físico melee ⇒ `damageHero` alimenta `h.bld`; al llenarse el
  héroe SUFRE el proc (ráfaga bleed % `heroMaxHp` / poison DoT / frost slow+drena stam). Simétrico.
- **AC7 compone**: buildup convive con WEAPON_BUFFS/THROWABLES/AFFIXES/FRENZY/poise/i-frames sin bypass ni regresión;
  los `dmgMul` melee siguen aplicando; el proc pasa por `applyStatus`/`ent.hp` como cualquier status.
- **AC8 RNG**: srand ON==OFF 48-draw; `buildupProc`/`buildupFed` reales **0-draw** (sin `buildupRng`); determinism PASS.
- **AC9 SAVE**: `save.v1` byte-id sin clave `bld*`/`buildup*` (todo transitorio; enemigos no persisten).
- **AC10 REG**: 20 pilares vivos + core-loop 60fps + touch intactos.

## Deploy (conteo de blobs)
Contar blobs reales vía `git show --stat` del Build. Mínimo esperado: **config + sim** (2 blobs, si el feedback vive en
`floater`/`addFx` que YA están en sim). Si el Build añade barra de buildup en `render.js` ⇒ **3 blobs** (config+sim+render).
El Build reporta el set EXACTO; Deploy cuenta desde `git show --stat`, NO mirror. md5 served==HEAD por blob.

## Notas de ejecución / GOTCHAS heredados
- **REG zona-sensible**: probes que matan enemigos (buildup + golpe) contaminan loot RNG condicional a zona ⇒ correr con
  **héroe prístino del pueblo** ANTES de la regresión Bonfire (que reubica al héroe). Patrón CAS-1898/1904/1911/1917/1924/1929
  (`armTown` antes de cada srand; Bonfire/EquipLoad/Two-Hand/Arch/Arts/Buffs al final).
- **OFF byte-id crítico**: cada sitio de reconversión DEBE caer al `applyStatus` original cuando `enabled:false`. El
  harness AC0 verifica que un golpe elemental con OFF produce el MISMO `ent.dots`/`slowT` que HEAD (no buildup).
- **Muerte por proc**: la ráfaga bleed puede matar ⇒ enrutar a `killEnemy`/`heroDie` como `tickDots` (no dejar hp<=0
  colgado). GOTCHA: no doble-matar.
- **Limpiar buildup tras probe** (mirror CAS-1924/1929): dejar `bld` sucio o `stam` drenada entre probes contamina REG
  posteriores con el MISMO héroe ⇒ limpiar `h.bld=null` + restaurar `stam` al final de cada probe antes de la regresión.
- **QA live**: harness espejo de `tools/cas1926-weapon-buffs-live-qa.mjs` (`tools/cas1931-status-buildup-live-qa.mjs`);
  hooks `bld*`/`buildup*` vía `import()` misma URL; md5 live==HEAD de TODOS los blobs; OFF byte-id; srand ON==OFF;
  save-neutral; PASS×2 desktop+mobile. **DoD OBSERVABLE**: screenshot/estado del PROC en loop real, no sólo md5.
