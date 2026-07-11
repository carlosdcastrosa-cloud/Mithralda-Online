# CAS-2151 — DEFLECT / Reflejo de Proyectil (mecánica #39)

**Verbo OFENSIVO universal anti-ranged.** DARK build (`DEFLECT.enabled:false`). Origen: recomendación #1 del Audit v5 (CAS-2150, GO, 0 sev). Baseline live `2b2cfd0d2313/799`.

## 0. Gate de secuencia — CONFIRMACIÓN DE NO-SOLAPE (paso obligatorio del issue)

El Audit v5 (CAS-2150) publicó el mapa de las **38 mecánicas vivas** (`STACK COHESIVE: YES`, 0 hallazgos > sev-4). Auditado el verbo Reflejo/Deflect contra el kit de respuestas a ataques — **NO se solapa** con ninguna mecánica live:

| Mecánica live | Eje / disparador | ¿Solapa con Reflejo #39? |
|---|---|---|
| **Parada con Tempo / Parry (CAS-210/1785)** | timing: anula un golpe **melee** entrante + arma riposte | **No — es su COMPLEMENTO exacto.** El parry es **melee-only por construcción**: en `damageHero` la rama de parry exige `src` (el atacante de contacto) y **los proyectiles pasan `src=null`** (`sim.js:5527` "the parry is melee-only") ⇒ el parry NUNCA toca un proyectil. Deflect captura JUSTO lo que el parry ignora (el proyectil), reusando su MISMA ventana/tempo (`h.parryT`). Un objeto = ventana única contextual: parry si hay melee, deflect si hay proyectil. |
| **Esquiva / Rodada (DODGE, i-frames)** | i-frames de rodada niegan CUALQUIER golpe (incl. proyectil) | **No.** DODGE es **defensa pura, 0 ofensa**: te mueve y niega el daño, pero el proyectil se pierde. Deflect lo **convierte en TU ofensa** (invierte dueño + lo devuelve al tirador). Ejes distintos (evasión vs contra-ataque). |
| **Bloqueo con escudo (SHIELD_BLOCK)** | mantener guardia: reduce chip **melee** frontal por estamina | **No.** Melee-only (mismo `src!=null`), sólo **reduce** daño; jamás refleja al tirador ni toca ranged. |
| **Coraza de Espinas / Vigía (reflect)** | boon/set: refleja %daño TAKEN al atacante **melee** | **No.** Reactivo pasivo sobre daño de CONTACTO ya recibido (`src` melee); no es un input tempo-gated ni actúa sobre el proyectil en vuelo. |
| **Guard/Dodge Counter #33/#34 · Riposte #36 · Charged #37 · GuardBreak #38** | defensa→ofensa melee / ejecución / anti-turtle | **No.** Todos operan sobre golpes/estados **melee** o el swing propio. Ninguno responde a un **proyectil en vuelo**. |

**Nicho genuinamente ausente:** hoy la ÚNICA respuesta a un proyectil enemigo es **RODAR** (defensa pura). Ranged/casters —que pelean a distancia contra otros ranged/bosses de ráfaga— no tienen una respuesta **ofensiva**. Deflect la aporta y es **universal** (toda clase con ventana de parry puede desviar). **Sin solape ⇒ construir.**

## 1. La mecánica (1 línea)

Ventana tempo-gated (**reusa la de PARRY**, `h.parryT>0`) que, al coincidir con un **proyectil enemigo entrante** (`G.projectiles` con `enemy:true`) dentro del radio de captura, **invierte su dueño a hero-owned + revierte la velocidad hacia el tirador** con daño **capeado** — en vez de sólo negarlo.

## 2. Restricciones duras (idénticas a #33–#38) — cumplidas

- **$0 arte:** reusa el sistema de proyectiles vivo (runes/bolts/spears/frostnova/ráfagas radiales de jefe), la ventana/tempo de PARRY, `hitEnemy`, y el **propio sprite del proyectil** (flip de dueño) + `spark`/`dodgering`. Sin assets nuevos.
- **Config/lógica-only**, knob `DEFLECT.enabled` default **false, DARK-by-default**.
- **RNG-neutral STRONG:** geometría/aritmética pura, **0 draws**, NO existe `deflectRng`. srand ON==OFF byte-id (32-draw fingerprint, `deflectSrandFp`) — AC7.
- **Save-neutral:** sólo muta campos del **proyectil** (`G.projectiles` NUNCA se serializa) + consume `h.parryT` (ya transitorio) ⇒ `serializeSave()` byte-id ON/OFF, **sin clave** `_deflect*`/`deflect*` — AC6.
- **OFF-path byte-id:** `enabled:false` ⇒ la rama de deflect es muerta, el proyectil cae al check de daño normal ⇒ comportamiento idéntico a HEAD; el cap `pdmg===p.dmg` numéricamente idéntico ⇒ **0-regresión de las 38 mec vivas** (cohesion audit v5 sigue PASS) — AC4.
- **Reversible** en 1 línea (`enabled:true→false`).
- **Cap anti-degenerado:** daño reflejado capeado a `dmgFracCap`×maxHp del objetivo (≤15%, mirror del cap de Riposte #36) + tempo-gate estrecho (ventana de parry) + coste de estamina (`staminaCost 12`) + `oncePerWindow` (consume `h.parryT` ⇒ **una ráfaga radial de jefe NO se refleja entera con una pulsación**). No crea one-shot ni trivializa bosses de ráfaga — AC2/AC3.

## 3. Tecla / colisión — Gate [Q] (ruta PREFERIDA del issue)

**Cero tecla nueva, cero colisión.** Deflect **reusa el input/timing de PARRY** como ventana contextual unificada: el jugador pulsa la parada (`PARRY.key`, `KeyH` en desktop) y la ventana `h.parryT` sirve a AMBOS — parry si un melee entra en ventana (`damageHero`, `src!=null`), deflect si un proyectil enemigo entra en el radio de captura (`updateProjectiles`, `src=null`). No toca `input.js`, `REBINDS` ni `settings.binds` ⇒ el layout de controles y el snapshot de settings son byte-id. El Códice de Combate gana la entrada **"Reflejo de proyectil"** bajo *Defensa*, `keyOf: PARRY.key`, gated `DEFLECT.enabled` (descubrible in-game al flip).

**Paridad móvil:** deflect NO añade input propio — cabalga el mismo disparador de parry. (El parry hoy es desktop-keyed; si el CEO quiere exponerlo en móvil, es una decisión de *parry* separada al flip, no de deflect.) La **lógica** del reflejo es idéntica a cualquier viewport y se prueba dirigiendo el loop real a resolución móvil en la QA observable.

## 4. Seams (3 blobs — mirror Riposte #36)

| Seam | Archivo | Qué |
|---|---|---|
| A knob | `sim/config.js` | `DEFLECT{enabled:false,captureRadiusPx:34,dmgFracCap:0.15,speedMul:1.15,staminaCost:12,oncePerWindow:true,requiresParryWindow:true}` + entrada del Códice bajo *Defensa* |
| B verbo | `sim/sim.js` | `deflectProjectile(p)` — consume `h.parryT`, gasta estamina, `p.enemy=false` (flip dueño), revierte `p.vx/p.vy`×`speedMul`, marca `p._deflected`, i-frame breve + VFX reusado; intercept en `updateProjectiles` (rama `p.enemy`, antes del hit-check) gated `DEFLECT.enabled && h.parryT>0 && dist<captureRadius` |
| C cap | `sim/sim.js` | en el impacto hero-owned, `pdmg = p._deflected ? min(p.dmg, dmgFracCap×e.maxHp) : p.dmg` propagado a hit/aoe/chain (OFF ⇒ `pdmg===p.dmg` ⇒ byte-id) |
| string | `strings.js` | `STR.deflect="¡REFLEJO!"` (floater del desvío, $0 arte) |
| dev | `sim/sim.js` | `dev.deflectProbe` (driva el loop real) + `dev.deflectSrandFp` (fingerprint 0-RNG) para la QA observable |

## 5. Números observables (knob)

`captureRadiusPx 34` (> hit-radius 18, legible pero estrecho) · `dmgFracCap 0.15` (≤15% maxHp objetivo) · `speedMul 1.15` (alcanza al tirador) · `staminaCost 12` · `oncePerWindow true` (1 desvío/ventana) · reflejo con `dmg 40`/target 500 ⇒ shooterHpLoss 40, heroHpLoss 0 · con `dmg 400/9999`/target 300 ⇒ reflectedRaw capeado a 45 (no escala) · OFF ⇒ el proyectil pega al héroe (heroHpLoss>0), ventana intacta.

## 6. QA / DoD

Harness DOM-free `tools/cas2151-deflect-live-qa.mjs` — DRIVE el loop real vía dev probes. **PASS×2 + determinism:**
AC0 META · AC1 FLIP+REVERSE (invierte dueño, revierte velocidad, daña al tirador, héroe 0, ventana consumida, estamina 12) · AC2 CAP (daño reflejado ≤`dmgFracCap`×maxHp, no escala con dmg gigante) · AC3 ONCE-PER-WINDOW (consume `parryT`) · AC4 OFF byte-id (pega al héroe como HEAD, ventana intacta) · AC5 WINDOW-GATED (sin ventana ⇒ no desvía) · AC6 SAVE byte-id (sin clave deflect) · AC7 0-RNG STRONG (srand ON==OFF 32 draws) · AC8 NO-REGRESSION (proyectil normal + riposte intactos) · AC9 DETERMINISM. Cohesion audit v5 (38-mec) sigue PASS.

**Cadena:** Build DARK (este commit) → **self-Deploy DARK (GE)** → **QA OBSERVABLE desk+móvil PASS×2 (QA b5c10283)** → **Gate CEO** (verify byte live==QA-proven, flip 1 línea `enabled:false→true`, deploy overlay, cache-bust). Entonces #39 VIVA.
