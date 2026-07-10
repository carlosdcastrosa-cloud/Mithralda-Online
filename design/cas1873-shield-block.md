# CAS-1873 — Escudo / Bloqueo con Guardia (Shield Block) · Pilar 12 (defensivo faltante)

**Umbrella:** CAS-1873 (CTO). Live baseline build `e8fd044817ac` / 799 files (tras CAS-1867 Mancha de Sangre, 11º pilar).
**Cadena estándar CTO-umbrella:** Build (GE) → Deploy (CTO) → QA (PASS×2 desktop+mobile) → Gate CEO. Umbrella cierra por `children_completed`.

Este es el **12º pilar** y el que faltaba en el eje DEFENSIVO: mantener BLOQUEO (hold) levanta la guardia en un arco
frontal que **mitiga** (no niega) el melee frontal a cambio de ESTAMINA; agotar la estamina en un bloqueo dispara
**ruptura de guardia** reutilizando el STAGGERED existente. Distinto de la Parada (CAS-1785, timing/counter): esto es
**sostenido, trade de recurso**.

---

## Seam (verificado leyendo el código, NO asumido)

Todos los ganchos ya existen; el pilar es aditivo y hard-gated tras `SHIELD_BLOCK.enabled`.

| Pieza | Ubicación real | Uso |
|---|---|---|
| Daño al héroe | `damageHero(dmg,ang,infl,src)` sim.js:4099 | `src` presente SÓLO en golpes de CONTACTO (melee); proyectiles pasan `null` (igual que Parry). ⇒ **melee-only GRATIS**. |
| Estado STAGGERED del héroe | `h.stun` (tick sim.js:3386 `if(h.stun>0) h.stun-=dt`) | Ya gatea swing/heavy/cast/roll (sim.js:2012/2053/2708). **Guard-break = set `h.stun`** — CERO estado nuevo, mismo estado que usa CAS-1826. |
| Estamina | `STAMINA` knob + `h.stam` (init `STAMINA.max`, newHero sim.js:314) + `h._stamRegenPauseT` | Consumo directo del pool existente de CAS-1841 (NO duplicar). |
| Arco frontal | `angDiff` (import math.js sim.js:18), `h.facing` | Espejo frontal de la matemática de arco de BACKSTAB (`rearArcDeg`). |
| Held-key | `keys` Set input.js:38, patrón `aimActive` (held) input.js:35 | Bloqueo es HOLD, no edge; se lee estado sostenido. |
| Botón táctil móvil | `tb.flask` render.js:3646 (present sólo si `FLASK.enabled`) | Mirror: `tb.block` present sólo si `SHIELD_BLOCK.enabled` ⇒ OFF byte-id. |

### Decisión de tecla (CTO — documentada aquí por contrato del issue)
- **Las 26 letras están OCUPADAS** (KeyK=codex, KeyY=titles, KeyL=pacts cerraron el alfabeto; KeyB=customize CAS-1659).
  KeyF=pickup, KeyU=flask, KeyH=parry, KeyN=heavy, Tab=lock.
- **Right-click = aim/cast** (`aimActive`→`castSpell(0)`, input.js:297) ⇒ colisiona.
- **Elegido: `ShiftLeft`** (HOLD). Libre en todo el repo (grep `Shift` = 0 hits), semántica natural de "brace/guardia",
  held-state trivial vía `keys` Set, y `preventDefault` sólo cuando `enabled` ⇒ OFF byte-id. Retunable por knob (CEO).
- **Móvil:** botón HUD **hold** `tb.block` (mirror del ⚕ Estus). Mantener pulsado = guardia arriba.

---

## Knob (config.js, tras `FLASK`)

```js
// CAS-1873: ESCUDO / BLOQUEO CON GUARDIA (Shield Block, 12º pilar · el DEFENSIVO faltante). Mantener el bloqueo
// (hold ShiftLeft / botón táctil) levanta la guardia en un ARCO FRONTAL. Un golpe MELEE entrante por el frente se
// MITIGA (no niega) y consume ESTAMINA (CAS-1841) proporcional al daño absorbido; agotar la estamina en un bloqueo
// dispara RUPTURA DE GUARDIA = el mismo `h.stun` STAGGERED de CAS-1826 (ventana punible). NO da i-frames, NO niega
// ranged (src=null lo salta, igual que Parry), melee+frontal-only. Distinto de Parada (CAS-1785, timing counter):
// sostenido, trade de recurso. Estado TRANSITORIO (`h.blocking`, mirror stam; guard-break reusa `h.stun` que YA
// existe y YA está fuera del allowlist de serializeSave) ⇒ save.v1 byte-id y SIN clave nueva. 100% input/geometría/
// aritmética ⇒ CERO draws, NO existe `blockRng` ⇒ srand ON==OFF incluso con el bloqueo/ruptura disparando de verdad.
// Guardia dibujada con canvas primitives (arco/tinte, $0 arte). HARD-GATED: enabled:false ⇒ input inerte, sin
// h.blocking, rama de damageHero muerta, sin arco/botón ⇒ byte-idéntico a HEAD; sin pulsar ⇒ idéntico a hoy con la
// feature ON. Los NÚMEROS + `key` = decisión FEEL/BALANCE del CEO (retune = knob barato, mirror dash/estamina/estus).
export const SHIELD_BLOCK = {
  enabled:true,
  key:"ShiftLeft",   // HOLD para levantar la guardia (desktop); móvil = botón HUD hold (mirror tb.flask)
  frontArcDeg:150,   // cono frontal que cubre la guardia (espejo frontal de BACKSTAB.rearArcDeg sobre h.facing)
  mitigate:0.65,     // fracción del daño MELEE frontal ABSORBIDA (0.65 ⇒ pasa el 35%); mitigación, NO negación
  stamPerDmg:0.6,    // estamina (CAS-1841) consumida por punto de daño absorbido
  breakStunS:0.9,    // ruptura de guardia ⇒ h.stun segundos (REUSA el STAGGERED de CAS-1826)
  moveMul:0.55,      // velocidad de strafe con la guardia arriba (gateado; OFF/no-bloqueando ⇒ sin efecto)
};
```

---

## Cambios por archivo (GE los verifica; NO asumir N blobs — Deploy lee `git show --stat`)

1. **sim/config.js** — el knob `SHIELD_BLOCK` de arriba + añadirlo a los imports de sim/input/render (mirror LOCK_ON:
   el 1er build de CAS-1848 lanzó `LOCK_ON is not defined` por olvidar un import — no repetir).

2. **sim/sim.js**
   - **Fijar `h.blocking` cada fixed-frame** (junto al tick de facing ~3419 / tras tick de stun 3386):
     ```js
     h.blocking = SHIELD_BLOCK.enabled && io.blockHeld && !h.dead && !h.rolling && h.stun<=0 && (!STAMINA.enabled || h.stam>0);
     ```
     (Estamina 0 ⇒ la guardia NO sube, requisito del issue.)
   - **(opcional, feel) strafe lento**: donde se aplica `mv`→velocidad, `if(h.blocking) speed*=SHIELD_BLOCK.moveMul;`
     Gateado por `h.blocking` ⇒ OFF/no-bloqueando byte-id. Secundario; el core es la mitigación.
   - **Rama de bloqueo en `damageHero`**, DESPUÉS de parry + `if(h.iframe>0)` + dodge-talent (para que una esquiva/roll
     siga negando GRATIS y no malgaste estamina), ANTES de `const def=equippedDef(h)`:
     ```js
     if(SHIELD_BLOCK.enabled && h.blocking && src && src.hp>0 && !src.dead){
       const toAtk=Math.atan2(src.y-h.y, src.x-h.x);          // dir héroe→atacante (mirror parry ra)
       if(Math.abs(angDiff(toAtk, h.facing)) < SHIELD_BLOCK.frontArcDeg*Math.PI/360){
         const absorbed=dmg*SHIELD_BLOCK.mitigate;
         const cost=STAMINA.enabled ? Math.round(absorbed*SHIELD_BLOCK.stamPerDmg) : 0;
         if(STAMINA.enabled && h.stam < cost){                // RUPTURA DE GUARDIA
           h.stun=Math.max(h.stun||0, SHIELD_BLOCK.breakStunS); h.stam=0; h.blocking=false;
           addFx("spark",h.x,h.y); floater(h.x,h.y-38,STR.guardBreak,"#ff9a4a"); shakeAdd(8); audio.sfx.hurt();
           // NO se reduce dmg ⇒ el golpe entra COMPLETO; cae al flujo normal de armadura/hp/estado.
         } else {                                             // BLOQUEO OK
           if(STAMINA.enabled){ h.stam=Math.max(0,h.stam-cost); h._stamRegenPauseT=STAMINA.regenDelay; }
           dmg=Math.max(1, dmg-absorbed);                     // mitiga; NO niega. Sin i-frames.
           addFx("dodgering",h.x,h.y,{life:0.22}); floater(h.x,h.y-34,STR.block,"#bfe3ff"); shakeAdd(4); audio.sfx.roll();
           // cae al flujo normal con dmg reducido (armadura/hp/estado/reflect siguen igual).
         }
       }
     }
     ```
     Notas: **sin i-frames** (spec); un golpe bloqueado **sigue** pudiendo infligir estado (sólo la esquiva i-frame lo
     evita, consistente con CAS-118); `ang`/`toAtk` son puros ⇒ CERO RNG; ranged (`src==null`) ni entra a la rama.

3. **render/render.js** — cuando `h.blocking`, dibujar un **arco/tinte de guardia frontal** (canvas primitive, $0 arte:
   sector de `frontArcDeg` centrado en `h.facing`, tono `#bfe3ff`). Añadir botón táctil hold `tb.block` (mirror `tb.flask`,
   present sólo si `SHIELD_BLOCK.enabled`). Sin assets nuevos.

4. **input.js** — trackear `key` como HELD vía `keys` Set; exponer `io.blockHeld` getter (mirror `aimActive`); en
   móvil, el botón `tb.block` fija held mientras se mantiene el toque. `preventDefault` sólo si `SHIELD_BLOCK.enabled &&
   e.code===SHIELD_BLOCK.key` (mirror LOCK_ON, OFF byte-id).

5. **strings.js** — `STR.block` ("¡Bloqueo!") y `STR.guardBreak` ("¡Guardia rota!"). (Byte-id OFF: añadir claves nuevas
   no cambia el sim; si preocupa el diff de strings, gatear igual que el resto — no es necesario, son claves nuevas.)

6. **hud.js / game.js** — sólo si el arco/botón necesita feed; probablemente NO. Deploy confirma el set real.

---

## Guardrails (idénticos a los 11 pilares previos — NO negociables)

1. **1 knob** `SHIELD_BLOCK.enabled`. **AC1**: enabled:false ⇒ build byte-idéntico (input inerte, `h.blocking` nunca se
   fija, rama de `damageHero` muerta, sin arco/botón/preventDefault).
2. **RNG-neutral STRONG**. **AC2**: sin `blockRng`, 0 draws; srand ON==OFF con bloqueo Y ruptura disparando de verdad.
3. **$0 arte**: guardia = arco/tinte canvas; botón = primitiva (mirror ⚕).
4. **Save aislado / transitorio**. **AC7**: `h.blocking` transitorio (mirror `stam`), guard-break reusa `h.stun` (ya
   existe, ya fuera del allowlist) ⇒ **sin `mithralda.shieldblock.v1`**, save.v1 byte-idéntico y sin clave nueva.
5. **Melee-only, frontal-only, sin i-frames** (verificado: `src` melee-only + arco frontal + no toca `h.iframe`).

---

## Acceptance Criteria (harness `tools/cas1873-shield-block.mjs`, PASS×2)

- **AC1 — OFF byte-id**: con `SHIELD_BLOCK.enabled=false`, build byte-idéntico al de HEAD (los blobs tocados con id).
- **AC2 — RNG-neutral STRONG**: srand ON==OFF sobre 48-draw con `blockFired`/`guardBreakFired` REALES (0 draws propios,
  NO existe `blockRng`).
- **AC3 — Mitigación frontal + coste**: golpe MELEE frontal con `h.blocking` ⇒ daño = `dmg*(1-mitigate)` EXACTO y
  `h.stam` baja `round(absorbed*stamPerDmg)` EXACTO.
- **AC4 — Frontal-only**: mismo golpe por atrás/costado (fuera del arco) ⇒ daño COMPLETO, sin coste.
- **AC5 — Melee-only / sin i-frames**: golpe ranged (`src=null`) con guardia arriba ⇒ NO mitigado; `h.iframe` no sube.
- **AC6 — Ruptura de guardia**: bloqueo cuyo coste > `h.stam` ⇒ `h.stun>0` (mismo STAGGERED de CAS-1826), golpe entra
  completo, `h.stam→0`.
- **AC7 — save.v1 byte-id**: serializeSave con guardia arriba/rota == sin ella; sin clave `shieldblock`.
- **REG**: los 11 pilares previos (Telegrafía/Esquiva/Parada/Habilidades/Poise/Combos/Backstab/Estamina/Lock-On/Estus/
  Bloodstain) srand ON==OFF.
- **Live QA** (`tools/cas1873-shield-block-live-qa.mjs`, mirror cas1867): PASS×2 desktop+mobile, md5 live==HEAD en TODOS
  los blobs tocados, `ShiftLeft`/botón `tb.block` REAL levanta guardia. Hero name sin "block"/"shield" para no
  falso-matchear el probe de save (mirror "GraveQA"/"EstusQA").

---

## DoD
Cadena 4/4 done · live `version.json` nuevo build · QA PASS×2 desktop+mobile · md5 live==HEAD · guardrails verificados
(OFF byte-id, srand ON==OFF, save.v1 byte-id). **12/12 pilares Souls-like vivos.**
