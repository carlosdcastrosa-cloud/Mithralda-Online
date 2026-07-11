# CAS-2105 — Contragolpe de Guardia / Guard Counter (mecánica #33)

**Estado:** DARK ship (`GUARD_COUNTER.enabled=false`). Gate CEO = flip config-only, reversible.
**Umbrella:** CAS-2105. **Build:** CAS-2106 (commit `1341b6e`). **Cadena:** Deploy→QA→Gate.

> Este documento describe la implementación **realmente commiteada** (`1341b6e`), no la propuesta. Ver §7 (Nota de diseño) sobre la interpretación *light-based* vs la propuesta *heavy-based* del ticket — decisión abierta al Gate CEO.

## 1. Qué es (verbo nuevo, 0 mec dominada)

Hoy `SHIELD_BLOCK` (CAS-1873) es puramente **pasivo**: absorbes daño melee frontal a cambio de estamina y esperas. **Guard Counter** convierte un **bloqueo exitoso** (sin romper la guardia) en **ofensiva**: abre una ventana breve (`windowS`) en la que el **siguiente swing** del héroe se transforma en un **contragolpe** — daño ×`dmgMul` y **gran daño de poise** ×`poiseMul` (empuja hacia romper stance) — a cambio de estamina extra (`staminaCost`). Recompensa el bloqueo **activo** y da al escudo una **identidad ofensiva** dentro del bucle read-punish.

### Distinción de las 32 mecánicas vivas (no solapa ninguna)
- **≠ PACTS** (difficulty-mod): no toca dificultad ni recompensa.
- **≠ ENCOUNTER_VARIANTS** (variante de enemigo): es un verbo del héroe.
- **≠ ARENA_HAZARDS** (terreno): no es un eje espacial ambiental.
- **≠ PARRY** (CAS-1785, deflect perfecto→riposte de ejecución con timing estricto): guard counter es **block→punish**, **más indulgente** (cualquier bloqueo exitoso lo arma, sin ventana de timing en la parada), **cuesta estamina**, y **escala del swing** (compone × arch × art × twoHand). No es una animación de ejecución.

## 2. Constraints DUROS (playbook EVO) — cumplidos

- **$0 arte**: reusa la animación de swing existente + `addFx("spellburst")` + `floater("¡CONTRAGOLPE!")` (primitivas canvas ya vivas). Cero sprites nuevos.
- **RNG-neutral STRONG**: 100% input/timing. NO existe `guardCounterRng`, CERO draws en cualquier rama ⇒ `srand` ON==OFF byte-idéntico incluso disparando (probado en harness con script srand de 48 draws alrededor de un bloqueo+contragolpe reales).
- **Additive-only**: con `enabled:false`, `SHIELD_BLOCK` y el ataque se comportan EXACTO como hoy (probado: `dmg` 36==36, save byte-id). OFF==baseline. Reversible = knob flip.
- **Compone**: `TWO_HAND` (escudo envainado ⇒ la rama de bloqueo sale temprano ⇒ nunca abre la ventana), `WEAPON_ARCHETYPES`/`WEAPON_ARTS`/`TWO_HAND` (el `dmgMul` es el ÚLTIMO factor del sink ⇒ compone multiplicativamente sin pisar), sistema de `POISE` (el `poiseMul` escala `POISE.gain` en el mismo sink que `TWO_HAND`).
- **Paridad**: **hero-only v1** (asimetría aceptada y documentada; sin enemy guard-counter todavía).

## 3. Knob (`sim/config.js:1252`, TUNABLE — el CEO retunea sin rebuild)

```js
export const GUARD_COUNTER = {
  enabled: false,       // SHIP DARK. El CEO flipea false→true en el Gate (config-only 1 línea, reversible).
  windowS: 0.6,         // ventana de contragolpe (s) tras un bloqueo exitoso (no-break)
  dmgMul: 1.8,          // daño del contragolpe vs ataque normal
  poiseMul: 2.5,        // daño de POISE del contragolpe (ALTO ⇒ eje de stagger/rotura)
  staminaCost: 10,      // estamina gastada en el contragolpe (reusa STAMINA; 0 = gratis)
};
```

**Números = decisión FEEL/BALANCE del CEO.** Anti-degenerado: `staminaCost` gastado por contragolpe (no spammeable); la ventana se **consume** en el primer swing (h.guardCounterT=0) ⇒ **un** contragolpe por bloqueo; `dmgMul` 1.8 sobre el swing base (que no one-shotea); `poiseMul` 2.5 empuja el valor hacia romper stance (el payoff canónico), no farmear daño.

## 4. Seams (implementación commiteada, `1341b6e`)

| Seam | Fichero:línea | Qué hace |
|---|---|---|
| Field transitorio | `sim/sim.js:411` | `guardCounterT:0` (mirror `blocking`/`parryT`: fuera del allowlist de `serializeSave` ⇒ save.v1 byte-id, sin clave nueva; arranca en 0 tras boot/load) |
| Decay | `sim/sim.js:2459` `tickGuardCounter(h,dt)` | decae `guardCounterT` por `dt`; gated `GUARD_COUNTER.enabled` ⇒ OFF nunca corre (byte-id). Llamado en el update `:4543` |
| Arm en bloqueo | `sim/sim.js:5385` (rama "BLOQUEO OK") | `if(GUARD_COUNTER.enabled) h.guardCounterT=GUARD_COUNTER.windowS`. Sólo en el `else` OK (la **ruptura NO arma** — te rompieron = sin premio). Ranged (`src=null`) ni entra a la rama de bloqueo; dos-manos sale temprano ⇒ ninguno arma |
| Consumo (dmg + stamina) | `sim/sim.js:2746-2752` (`applyHeroMelee`) | `gc = enabled && guardCounterT>0 && !heavy`. `dmg × (gc?dmgMul:1)` (último factor del sink). Si `gc`: `guardCounterT=0` (consume), gasta `staminaCost`, `addFx("spellburst")+floater` |
| Escala poise | `sim/sim.js:2842` (poise sink) | `if(enabled && opt.guardCounter) add *= poiseMul` (compone × twoHand × arch × art) |

### Por qué OFF == HEAD byte-idéntico
- `enabled:false` ⇒ `gc` siempre false ⇒ el swing multiplica ×1 + `opt.guardCounter=false` ⇒ poise ×1; la rama de bloqueo no escribe `guardCounterT` (queda 0); `tickGuardCounter` retorna en la 1ª línea. Cero draws (sin RNG en ninguna rama). Probado: harness AC OFF (`dmg` 36==36, forzar `guardCounterT>0` INERTE) + AC RNG-STRONG (script 48-draw ON==OFF byte-id).

## 5. Balance / anti-degenerado (para el Gate CEO)
- **No spam**: `staminaCost` 10 por contragolpe + ventana consumida en 1 swing ⇒ **un** contragolpe por bloqueo exitoso.
- **No one-shot**: `dmgMul` 1.8 sobre el swing base modesto (que no one-shotea).
- **Requiere setup**: sólo dispara TRAS un bloqueo exitoso dentro de `windowS` ⇒ reactivo, no un botón libre.
- **Payoff = break, no daño**: `poiseMul` 2.5 empuja el valor hacia romper stance (bucle read-punish).
- **Asimetría hero-only** documentada; retune 100% config.

## 6. Verificación (Build DoD)
- Harness `tools/cas2107-guard-counter.mjs` (DOM-free, importa `sim/sim.js` directo, ejercita los seams REALES vía `dev.guardCounter*`): **PASS×2** — AC ventana / AC dmg (×1.8, consume, staminaCost) / AC poise (12→30) / AC OFF (byte-id) / AC SAVE (save.v1 byte-id, sin clave) / AC RNG-STRONG (0 draws, ON==OFF) + REG 12 mecánicas previas ON==OFF.
- `node --check sim/config.js sim/sim.js` limpio. Blobs tocados: `sim/config.js` (+25), `sim/sim.js` (+136).

## 7. Nota de diseño — *light-based* vs *heavy-based* (decisión abierta al Gate CEO)
El ticket **propone** que el ataque **heavy** se transforme en contragolpe (con `windupMul`/`perfect`/`requiresShield`). La implementación commiteada lo aplica al **swing normal (light)**, con la razón GE de que el heavy ya tiene su propia tecla dedicada y el contragolpe en el botón de ataque primario es **más accesible y legible** (block→punish inmediato). El resultado cumple TODOS los constraints duros (block→punish, poise alto, coste stamina, $0 arte, RNG-neutral, additive). **Ambas variantes son DARK/tunables**; si el CEO prefiere la variante *heavy* + *perfect window* del spec, es un ajuste de código acotado (re-rutear el gate y añadir `perfect`/`windupMul`/`requiresShield`) que se hace antes del flip. Se surface explícitamente al Gate para decisión.

## 8. Cadena
Build **CAS-2106** (commit `1341b6e`, este doc + harness) → **Deploy DARK** (GE) → **QA OBSERVABLE DARK** (QA `b5c10283`, PASS×2 desktop+móvil) → **Gate CEO** (`e77e7f98`, blockedBy QA; verifica live + flip + decide §7). Todos `parentId=CAS-2105`.
