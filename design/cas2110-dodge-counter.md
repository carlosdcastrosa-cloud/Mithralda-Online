# CAS-2110 — Contraataque de Esquiva / Perfect Dodge Counter (mecánica #34)

**Estado:** DARK ship (`DODGE_COUNTER.enabled=false`). Gate CEO CAS-2111 = flip config-only, reversible.
**Umbrella:** CAS-2110 (Build+Deploy+QA los conduce el Game Engineer). **Cadena:** Build DARK → Deploy DARK (gh-pages) → QA observable PASS×2 → `done` ⇒ despierta al CEO en el Gate CAS-2111.

> Este documento describe la implementación **realmente commiteada**, no la propuesta. Mirror de CAS-2105 (Guard Counter, #33).

## 1. Por qué (cohesión) — cierra el gap #2 del audit CAS-2085

El **Guard Counter (#33, CAS-2105)** premia **bloquear** pero **requiere escudo** ⇒ las clases ranged/sin-escudo (p.ej. mage) **no tienen conversión defensa→ofensiva**. Esta mecánica da esa conversión vía el verbo **esquiva** (universal, todas las clases): una **esquiva perfecta** (los i-frames de un **rodar activo** solapan un ataque que **HABRÍA conectado**) abre una ventana breve donde el **siguiente swing LIGHT** pega reforzado — daño ×`dmgMul` + poise ×`poiseMul`. Paridad con el escudo **sin romper su identidad**: números **por debajo** del Guard Counter (la esquiva es más accesible).

### Distinción de las 33 mecánicas vivas (no solapa ninguna)
- **≠ PARRY** (CAS-1785, deflect con timing → riposte de ejecución): el dodge-counter parte del verbo **esquiva/rodar**, no de una parada; no exige input de parada.
- **≠ Perfect Dodge / Riposte** (CAS-210): el `riposte` base arma un **crit garantizado** en el siguiente hit (eje daño-crit). El dodge-counter añade, **encima y ortogonal**, un eje **poise/stagger** (×`poiseMul`) + un `dmgMul` propio + coste de estamina, mirror exacto del Guard Counter. Componen (ver §5).
- **≠ GUARD_COUNTER** (#33, block→punish, requiere escudo): mismo patrón defensa→ofensiva pero por el eje **esquiva** (universal) en vez de **bloqueo** (escudo). Mutuamente excluyentes por construcción (§5, AC3).

## 2. Constraints DUROS (playbook EVO) — cumplidos

- **$0 arte / render sin tocar**: reusa la animación de swing existente + `addFx("spellburst")` + `floater("¡CONTRA-ESQUIVA!")` (primitivas canvas ya vivas en sim.js). `render/render.js` **UNTOUCHED**. Cero sprites nuevos. Overlay = **2 blobs** (`sim/config.js` + `sim/sim.js`).
- **RNG-neutral ESTRICTO**: 100% input/timing/aritmética. NO existe `dodgeCounterRng`, CERO draws en cualquier rama ⇒ `srand` ON==OFF byte-idéntico incluso disparando (probado: script srand de 48 draws alrededor de una esquiva-abre + swing-consume reales).
- **Additive-only / OFF==baseline**: con `enabled:false`, la esquiva y el ataque se comportan EXACTO como hoy (probado: `dmg` 36==36 forzando `dodgeCounterT>0` es INERTE; save byte-id). Reversible = knob flip 1 línea.
- **Compone** con `WEAPON_ARCHETYPES`/`WEAPON_ARTS`/`TWO_HAND`/`WEAPON_BUFFS` (el `dmgMul` es el ÚLTIMO factor del mismo sink que Guard Counter ⇒ multiplica sin pisar) y con `POISE` (`poiseMul` escala `POISE.gain` en el mismo sink que TWO_HAND/Guard Counter).
- **Save-neutral**: `h.dodgeCounterT` + `h._rollAge` son transitorios (mirror `h.guardCounterT`/`h.parryT`, fuera del allowlist de `serializeSave`) ⇒ `save.v1` byte-id ON/OFF y SIN clave nueva.
- **Paridad**: **hero-only v1** (asimetría aceptada y documentada; sin enemy dodge-counter).

## 3. Knob (`sim/config.js`, TUNABLE — el CEO retunea sin rebuild)

```js
export const DODGE_COUNTER = {
  enabled: false,        // SHIP DARK — el CEO flipea false→true en el Gate CAS-2111 (config-only 1 línea, reversible).
  windowS: 0.5,          // ventana de contragolpe tras una esquiva perfecta
  dmgMul: 1.5,           // < guard counter (1.8): la esquiva es más accesible
  poiseMul: 2.0,         // < guard counter (2.5)
  staminaCost: 6,        // < guard counter (10)
  perfectWindowMs: 160,  // timing: sólo cuenta como perfecta si el rodar arrancó hace ≤ este umbral
  requiresShield: false, // UNIVERSAL — paridad ranged/sin-escudo
};
```

## 4. Seams (todos gated `DODGE_COUNTER.enabled`, 2 blobs)

1. **Apertura — `perfectDodge()`** (`sim/sim.js`): esta función YA se llama SÓLO cuando los i-frames de un **rodar activo** (`h.iframe>0 && h.rolling`) niegan un golpe REAL entrante en `damageHero`. Añadimos: si el rodar arrancó hace ≤ `perfectWindowMs` (`h._rollAge`, timer ascendente reseteado al iniciar el rodar y ticado por `dt` en la actualización del rodar) ⇒ `h.dodgeCounterT = windowS`. Un rodar **viejo** (i-frame residual) o un i-frame de **merced** (sin `rolling`) NO abren.
2. **Consumo — `applyHeroMelee`**: `dc = DODGE_COUNTER.enabled && h.dodgeCounterT>0 && !heavy && !gc`. Un swing LIGHT en ventana ⇒ dmg ×`dmgMul` (último factor del sink), `opt.dodgeCounter` ⇒ `hitEnemy` escala `POISE.gain` ×`poiseMul`, gasta `staminaCost` y cierra la ventana (`h.dodgeCounterT=0`).
3. **Tick — `tickDodgeCounter`**: decae `dodgeCounterT` por `dt` (mirror `tickGuardCounter`).

## 5. Composición con GUARD_COUNTER (AC3) — nunca colisionan

- **Mismo evento**: en `damageHero`, la rama de i-frames/esquiva (que llama a `perfectDodge` y hace `return false`) corre **ANTES** de la rama de `SHIELD_BLOCK`. Una esquiva **niega** el hit ⇒ el bloqueo nunca corre ⇒ el guard-counter **nunca se abre** por ese golpe. (Probado: `dodgeOpened=true`, `guardStayedClosed=true`.)
- **Mismo swing**: `dc` está gated en `!gc` ⇒ si ambas ventanas están abiertas, **sólo** aplica el guard-mul (precedencia del escudo) y la ventana de esquiva **no** se consume ⇒ nunca multiplican los dos ⇒ daño acotado. (Probado: `ratioBoth=1.8==guardMul`.)

## 6. Verificación (harness `tools/cas2110-dodge-counter.mjs`, DOM-free, PASS×2)

Ejercita los `dev.dodgeCounter*` hooks que corren los seams REALES (`damageHero`→`perfectDodge`/`applyHeroMelee`/`hitEnemy`):
- **AC ventana**: esquiva perfecta ABRE (`dodgeCounterT=0.5`); rodar viejo / merced NO; UNIVERSAL clase ranged (mage) ABRE.
- **AC dmg**: `×1.5` + consume + gasta 6 estamina.
- **AC poise**: `light 12 → 24` (×2.0).
- **AC compose**: mismo evento sólo dodge abre; mismo swing sólo guard-mul.
- **AC OFF**: no abre + forzar `dodgeCounterT>0` INERTE (dmg 36==36).
- **AC SAVE**: transitorio, byte-id, sin clave.
- **AC RNG-STRONG**: 48-draw srand ON==OFF byte-idéntico disparando real.
- **REG**: 13 mecánicas previas (Frenzy…Guard-Counter) siguen srand ON==OFF (0 regresión).

## 7. Cadena / registro

Build DARK (este commit) → Deploy DARK gh-pages (`tools/cas2110-dodge-counter-deploy.mjs`, 2-blob overlay) → QA observable PASS×2 → `done` ⇒ Gate CEO CAS-2111 (flip config-only + verify live). Cada paso registra: commit, build id served, md5 config+sim.
