# CAS-2146 — Empujón / Patada Rompe-Guardia (mecánica #38)

**Verbo OFENSIVO anti-turtle.** DARK build (`GUARD_BREAK.enabled:false`). Baseline live `7847befbb4a7/799`.

## 0. Gate de secuencia — CONFIRMACIÓN DE NO-SOLAPE (paso obligatorio del issue)

Bloqueada a propósito por **CAS-2145 (Cohesion & Balance Audit v4)**, que publicó el mapa de las **37 mecánicas vivas**
(`STACK COHESIVE: YES`, 0 hallazgos > sev-4, `tools/cas2145-cohesion-audit.mjs`). Auditado el verbo Empujón/Guard-Break
contra el kit relevante — **NO se solapa** con ninguna mecánica live:

| Mecánica live | Eje / disparador | ¿Solapa con Empujón #38? |
|---|---|---|
| **Guard Counter #33** | DEFENSA DEL HÉROE: un BLOQUEO OK abre ventana → swing ligero ×1.8 (armado en `damageHero`) | **No.** #33 convierte la defensa PROPIA en daño; #38 es un botón que el héroe PULSA contra un enemigo que bloquea. Sujeto y disparador distintos. |
| **Perfect Dodge Counter #34** | DEFENSA DEL HÉROE: i-frames de rodada perfecta → ventana → swing ×1.5 | **No.** Disparado por la esquiva del héroe; #38 no depende de esquivar. |
| **Riposte #36** | ESTADO DEL ENEMIGO: target ya poise-roto (`staggerT>0 + _ripArm`) → 1er melee ejecuta ×2.2 | **No — COMPLEMENTA.** #36 es el PAGO sobre un enemigo YA roto; #38 es la ACCIÓN que CAUSA la rotura sobre un enemigo que turtlea, y **reusa la MISMA ventana/ejecución** (arma `_ripArm` en el chokepoint sim.js:2947). El issue lo pide explícitamente ("reusa la ventana/ejecución existente"). |
| **Parada con Tempo / Parry (CAS-210/1785)** | timing: anula el golpe entrante + buff de riposte | **No.** Reactivo por timing sobre un ataque entrante; #38 es proactivo por pulsación. |
| **Charged Attack #37** | ofensivo: hold pesado > umbral → golpe cargado ×dmg/××poise | **No.** #37 es un pesado universal contra CUALQUIER target; #38 es utilidad de daño BAJO específica contra ENEMIGOS QUE BLOQUEAN/TURTLEAN (casca el carapace escudado — hoy sólo lo rompen los procs de estado). |

**Nicho genuinamente ausente:** el kit defensivo (#33/#34/#36/Parry) no tiene la respuesta OFENSIVA proactiva al turtle; un
melee sin build de estado no puede romper proactivamente la guardia de un enemigo escudado. Empujón #38 la aporta. **Sin
solape ⇒ construir (no escalar al shortlist de fallback).**

## 1. La mecánica

El héroe pulsa una tecla dedicada → **patada de alcance corto** que:
- **Drena la postura** del objetivo: poise-damage ×`poiseMul` en el MISMO sink `POISE.gain` (compone con TWO_HAND/arquetipo/Arte/counters/charged).
- **Rompe la guardia** de un enemigo que turtlea: al cruzar `poiseMax` dispara el chokepoint de rotura EXISTENTE (`staggerT` + arma `_ripArm` de Riposte #36) ⇒ **abre la ventana de ejecución** para el siguiente golpe del jugador (la patada ARMA, NO se auto-ejecuta).
- **Anti-turtle real:** contra un enemigo ESCUDADO (carapace, daño-inmune) casca la guardia directamente (`e.shieldBroken` ⇒ `shatterCarapace`).
- **Utilidad, no burst:** daño directo BAJO (`dmg` 5 + onhit; << un swing normal). Coste de estamina propio + ventana de recuperación (no spammeable).

## 2. Restricciones duras (idénticas a #33–#37) — cumplidas

- **$0 arte:** reusa knockback/shove (`e.knock`) + anillo de dash (`addFx("dodgering")`) + floater `STR.shove` + el `¡ATURDIDO!` del poise-break. Sin assets nuevos.
- **Config/lógica-only**, knob `GUARD_BREAK.enabled` default **false, DARK-by-default**.
- **RNG-neutral STRONG:** 0 draws, NO existe `guardBreakRng` (geometría + aritmética). srand ON==OFF byte-id (16 draws) — AC7.
- **Save-neutral:** `h._gbCd` transitorio (mirror `h.artCD`, fuera del allowlist de `save.v1`) ⇒ `serializeSave()` byte-id ON/OFF, sin clave — AC6.
- **Reversible:** `enabled:false` ⇒ tecla inerte + `guardBreakKick()` rama muerta + poise sink ×1 + seam B idéntico ⇒ **byte-id HEAD** — AC5.
- **Paridad input desktop+móvil, sin colisión:** tecla dedicada `Period` (".") — code LIBRE (verificado en todo el repo + NO en `REBINDS`, trampa histórica Summon KeyN evitada); móvil = botón HUD tap `tb.guardbreak`. No-rebindable (nunca toca `settings.binds`).

## 3. Seams (5 blobs)

| Seam | Archivo | Qué |
|---|---|---|
| A knob | `sim/config.js` | `GUARD_BREAK{enabled:false,key:"Period",range:52,arcDeg:130,dmg:5,poiseMul:3.2,staminaCost:20,recoverMs:600,knock:1.7,cracksShield:true,requiresMelee:false}` + entrada del Códice de teclas |
| B verbo | `sim/sim.js` | `export function guardBreakKick()` — gate/deny/spendStam (mirror weaponArt), arco frontal, poise drain vía `hitEnemy{guardBreak:true}`, crack de escudado, empuje; `h._gbCd` decay en el tick del héroe |
| C poise | `sim/sim.js` | `if(GUARD_BREAK.enabled && opt.guardBreak) add*=GUARD_BREAK.poiseMul` en el sink de POISE.gain |
| D no-auto-ejecuta | `sim/sim.js` | Riposte seam B gateado con `!(opt.guardBreak)` ⇒ la patada ARMA `_ripArm` pero deja la ejecución para el follow-up |
| E input | `input.js` | keydown `Period` gated + botón HUD móvil `tb.guardbreak` (tap) |
| F string | `strings.js` | `STR.shove="¡EMPUJÓN!"` (distinto del `guardBreak` del HÉROE, CAS-1873) |
| render | `render/render.js` | dibujo del botón móvil (atenúa durante recuperación) |

## 4. QA / DoD

Harness DOM-free `tools/cas2146-guard-break-live-qa.mjs` — DRIVE el loop real vía dev probes. **PASS×2 + determinism:**
AC0 META · AC1 poise ×3.2 · AC2 HEADLINE (rompe en 3 patadas ⇒ `_ripArm` armado, follow-up ejecuta) · AC3 anti-turtle
(casca escudo, empuja) · AC4 coste 20 + recuperación + daño bajo (9 << 36) + deny in-window · AC5 OFF byte-id · AC6 save
byte-id · AC7 srand ON==OFF (16 draws) · AC8 0-regresión a #33/#34/#36/#37 · AC9 determinism. Cohesion audit v4 (37-mec)
sigue PASS.

**Cadena:** Build DARK (este commit) → **CAS-2147 Deploy DARK (CTO)** → **CAS-2148 QA OBSERVABLE desk+móvil (QA)** →
**CAS-2149 Gate CEO** (verify byte live==QA-proven, flip 1 línea `enabled:false→true`, deploy overlay, cache-bust).
Entonces #38 VIVA.
