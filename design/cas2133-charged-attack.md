# CAS-2133 — Ataque Cargado con Híper-Armadura (Charged Heavy / Hyper-Armor · mecánica #37)

**Estado objetivo:** SHIP DARK (`CHARGED_ATTACK.enabled:false`). $0 arte · RNG-neutral STRONG (0 draws) · save-neutral · config-gated · reversible.
**Umbrella:** CAS-2133 (CTO). **Baseline LIVE previo:** `272d22870026`/799 (36 mec — mec #36 Riposte LIVE, CAS-2132).

## 1. Qué es y por qué

El kit Souls-like vivo tiene un **sesgo defensivo/reactivo**: Guard Counter (#33), Perfect-Dodge Counter (#34),
Rally (#35), Riposte (#36) — todos premian *esperar el error del enemigo y castigarlo*. Falta una opción de
**INICIATIVA ARRIESGADA**: comprometerte a un golpe pesado que **absorbe un impacto en vez de esquivarlo**.
Ataque Cargado introduce el clásico *charged heavy* de Souls: **mantener** el input del pesado más allá de un umbral
entra en estado **cargando**; durante el windup el héroe gana **híper-armadura fuerte** (los golpes entrantes NO
interrumpen el swing — el poise los absorbe) pero **SÍ recibe daño, capeado** (anti-cheese); al **soltar** → golpe
cargado: mayor daño y **mucho mayor daño de poise** (eje de rotura ofensivo), a cambio de **más stamina** y de
**exponerte** durante la carga. Soltar **antes** del umbral = **pesado normal** (comportamiento KeyN actual).

### Ortogonalidad (NO solapa con #33/#34/#35/#36)
- Todas las contras se disparan por un **evento REACTIVO** (tu bloqueo / tu esquiva perfecta / daño recibido / rotura del enemigo).
- Ataque Cargado se dispara por una **DECISIÓN PROACTIVA de commit** (mantener el input) → estado del HÉROE `h.charging`.
  Es el único eje que **paga daño por adelantado** (absorbes durante el windup) a cambio de un pico ofensivo. No comparte
  estado ni sink con ninguna contra; compone multiplicativamente con ellas en el sink de daño melee existente.

### ⚠️ Reúso de infraestructura EXISTENTE (crítico para el GE)
- **`heavyAttack()` YA existe** (`sim.js:2730`) como función dedicada, disparada por **`COMBO.heavyKey`="KeyN"**
  (`input.js:283`) — tecla **dedicada, NO-rebindable, edge-triggered, sin otro consumidor**. Setea `h._heavy=true`.
- **`HYPERARMOR` YA existe y está `enabled:true`** (`config.js:1425`), aplica a `h._heavy`/`h._comboFin`/arte (`sim.js:5498`).
  La híper-armadura del swing pesado **ya la heredamos**; este diseño AÑADE la híper-armadura del **windup de carga** (antes
  del swing) + el **cap de daño entrante** durante ese windup, que es la pieza nueva anti-cheese.
- **Patrón HELD ya establecido:** `io.blockHeld` (`input.js:798`) — keydown fija flag, keyup lo baja, el sim lo lee cada
  fixed-frame (`sim.js:4642` `h.blocking = SHIELD_BLOCK.enabled && io.blockHeld && ...`). Ataque Cargado **mirror exacto**:
  `io.chargeHeld` nuevo getter, leído cada fixed-frame para el tick del windup.

## 2. Sin colisión de input (RESTRICCIÓN DURA #4 — LECCIÓN Summon KeyN CAS-2087)

Ruta trazada y verificada contra TODOS los bindings vivos:

| Acción | Binding | Tipo | ¿Colisión con charge-hold? |
|---|---|---|---|
| **Pesado / Cargado (éste)** | `COMBO.heavyKey`="KeyN" | **HOLD nuevo** | — (reúsa su propia tecla dedicada) |
| Ataque ligero | `settings.binds.attack` / touch ⚔ | tap edge | NO — tecla distinta, y el ligero queda **instantáneo** (sin latencia) |
| Weapon Art | `WEAPON_ARTS.key`="Semicolon" | tap edge (**NO hold**) | NO — tecla distinta, no usa hold |
| Lock-on | `LOCK_ON.key`="Tab" | tap edge | NO |
| Parry | `PARRY.key`="KeyH" | tap edge | NO |
| Summon | `SUMMON.key`="Comma" | tap edge | NO (CAS-2086 ya lo movió FUERA de KeyN) |
| Escudo | `SHIELD_BLOCK.key`="ShiftLeft" | HOLD | NO — tecla distinta |

**Decisión CTO:** la carga **reúsa la tecla dedicada del pesado (KeyN)**. Hoy KeyN es edge-triggered sin consumidor de
`keyup` ⇒ convertirla en HOLD **no introduce ninguna colisión**. El **único** cambio de comportamiento (y SÓLO con el knob
ON): KeyN dispara el pesado en el **release** en vez del press. **NO se toca el ataque ligero** ⇒ sin latencia añadida al
input más usado (evita el regresión de feel que tendría cargar sobre el ligero). El snapshot `settings.binds` queda
**byte-idéntico** (KeyN nunca tocó REBINDS, igual que parry/summon/escudo).

**Móvil** (el pesado hoy es **desktop-only**, no hay botón táctil): se añade un **botón HOLD de carga** al HUD táctil
**SÓLO cuando `CHARGED_ATTACK.enabled`** (mirror `tb.block`/`tb.weaponart`/`tb.summon`) ⇒ con el knob OFF **no hay botón** ⇒
layout de controles **byte-idéntico a HEAD**. Es HOLD (mirror `tb.block` con un `chargePointerId` propio): `onPointerDown`
fija chargeHeld mientras el dedo siga abajo, `onPointerUp` lo suelta → release. Glifo procedural $0 arte (p.ej. `⛏`/`⚡`).
No toca el botón ⚔ (ligero) ⇒ tap-attack móvil intacto.

## 3. Diseño (thin additive) — estado y seams (todos gated en `CHARGED_ATTACK.enabled`)

### Estado (transitorio del héroe, FUERA de `save.v1` — mirror `h.blocking`/`h.throwWind`)
- `h.chargeT` (float, s) — acumulador del windup mientras el input se mantiene. Capado a `maxChargeMs/1000`.
- `h.charging` (bool) — re-derivado cada fixed-frame: `enabled && io.chargeHeld && <héroe puede atacar>`.
- `h._charged` (bool) — flag del swing SOLTADO: true si `chargeT*1000 >= chargeThresholdMs`. Lo consume `applyHeroMelee`.
Ninguno se serializa (mismo criterio que `h.blocking`/`h.stun`/`h.poise`).

### Seam A — Input (`input.js`): defer + release + getter + botón móvil
`onKeyDown` (`input.js:283`), reemplazar el disparo inmediato por bifurcación gated:
```
if(code===COMBO.heavyKey && COMBO.enabled){
  if(CHARGED_ATTACK.enabled){ chargeHeld=true; }   // ON: inicia windup; el release lo maneja el sim
  else { sim.heavyAttack(); }                       // OFF: disparo inmediato = comportamiento HEAD byte-id
  return;
}
```
`onKeyUp` (`input.js:133`): `if(e.code===COMBO.heavyKey) chargeHeld=false;` (mirror `blockHeld`). Getter `io.chargeHeld`
(mirror `io.blockHeld`, `input.js:798`). Móvil: rect `charge` gated en `CHARGED_ATTACK.enabled` con `chargePointerId`
(mirror `blockPointerId` en `onPointerDown`/`onPointerUp`).
> **Auditoría GE:** confirmar que con `enabled:false` la rama `else` es el path exacto de HEAD (disparo inmediato) y que
> `chargeHeld`/`chargePointerId` quedan inertes (nunca leídos por el sim con el knob OFF).

### Seam B — Tick de carga y release (`sim.js`, junto al seam del escudo `sim.js:4642`)
```
if(CHARGED_ATTACK.enabled){
  const canCharge = !h.dead && !h.rolling && h.stun<=0 && !h.atkAnim>0 /* no mid-swing */
                    && (!STAMINA.enabled || h.stam>0) && (ATK[h.cls||"warrior"].type==="melee");
  const held = io.chargeHeld && canCharge;
  if(held){ h.charging=true; h.chargeT=Math.min(h.chargeT+dt, CHARGED_ATTACK.maxChargeMs/1000); }
  else if(h.charging){                                   // RELEASE (soltó o perdió condición)
    h._charged = (h.chargeT*1000 >= CHARGED_ATTACK.chargeThresholdMs);
    h.charging=false; h.chargeT=0;
    heavyAttack();                                       // reúsa el pesado; _charged escala en applyHeroMelee
    h._charged=false;                                    // consumido en el swing de este frame
  } else { h.charging=false; h.chargeT=0; }
}
```
> `heavyAttack()` ya gatea `h.atkCD/rolling/stun/...`; si no puede, el release es no-op (sin swing) — correcto.
> **0 RNG.** Aritmética escalar + flags. Sin alloc por frame.

### Seam C — Híper-armadura del windup (`sim.js:5498`, extender el gate de `HYPERARMOR`)
```
h.hyperarmor = h.atkAnim>0 && (...heavy||finisher||art...)
             || (CHARGED_ATTACK.enabled && h.charging);          // NUEVO: híper-armadura durante el windup
if(h.hyperarmor && infl && infl.type==="stun"){
  const thr = (CHARGED_ATTACK.enabled && h.charging) ? CHARGED_ATTACK.hyperArmorGrant
            : HYPERARMOR.poiseThreshold * (twoHand? HYPERARMOR.twoHandBonus:1);
  if(dmg < thr){ ...absorbe el stun... }
}
```
`hyperArmorGrant` es el umbral de poise **durante la carga** (default alto ⇒ absorbe casi todo golpe; el CEO lo baja para
tuning). Gated ⇒ con OFF `h.charging` nunca sube ⇒ rama muerta ⇒ byte-id.

### Seam D — Cap de daño ENTRANTE durante el windup (`damageHero` `sim.js:5473`, ANTES de `h.hp-=real`)
```
const real=Math.max(1,dmg-def*0.6);
+ if(CHARGED_ATTACK.enabled && h.charging){
+   const cap=CHARGED_ATTACK.incomingDmgCapFracMaxHp*(h.maxHp||h.hp);
+   if(real>cap) real=cap;                     // anti-cheese: absorber ≠ inmunidad, pero nunca one-shot mientras cargas
+ }
h.hp-=real; ...
```
Gated ⇒ OFF byte-id. Esta es la pieza **nueva** clave: la híper-armadura evita la INTERRUPCIÓN (Seam C), el cap evita que
absorber sea suicida/cheeseable (recibes daño, pero acotado). **RESTRICCIÓN DURA #5: cap obligatorio** — satisfecho aquí
(entrante) + Seam E (saliente vs jefe/élite).

### Seam E — Golpe soltado: daño/poise/stamina + cap saliente (`applyHeroMelee` `sim.js:2778` + `hitEnemy` poise sink)
```
const charged = CHARGED_ATTACK.enabled && h._charged;
const dmg = ... * (heavy?COMBO.heavyDmgMul:1) * ... * (charged?CHARGED_ATTACK.dmgMul:1);   // compone ×heavy ×counters
```
- **Poise ×poiseMul** (`CHARGED_ATTACK.poiseMul`, ~2.5): pasar `opt.charged` a `hitEnemy` y aplicar `add*=poiseMul` en el
  mismo sink de poise-damage (mirror #33/#34). **Eje de rotura ofensivo** — aquí SÍ es observable (target NO roto todavía).
- **Stamina extra** (`CHARGED_ATTACK.staminaCost`): al soltar cargado, gastar coste extra sobre el del pesado (reúsa
  `spendStam`; si no alcanza, degradar a pesado normal — o gatear antes en Seam B). Documentar la ruta elegida en el Build.
- **Cap SALIENTE anti one-shot vs jefe/élite** (`CHARGED_ATTACK.releaseCapFracMaxHp`, ~0.22; mirror `RIPOSTE.ripCapFracMaxHp`):
  tras todos los multiplicadores, si `e.isBoss||e.elite||e.champion||e.champElite`, capar `dmg ≤ releaseCapFracMaxHp*maxHp`
  para que `dmgMul × heavy × counter × afijos` NUNCA one-shot. Trash sin cap (se siente como ejecución pesada).
Gated ⇒ `_charged` nunca es true con OFF ⇒ `charged=false` ⇒ ×1 + `opt.charged` inerte ⇒ byte-id.

### Seam F — VFX / floater ($0 arte)
- **Windup (readability, telegraph):** anillo/medidor de carga alrededor del héroe reusando primitivas vivas (mirror el
  `chargeKey` de los botones táctiles / `addFx("shockring")` / glow del windup de resina). Debe **crecer con `chargeT`** y
  **destellar al cruzar `chargeThresholdMs`** (feedback de "listo"). Vive en `render.js` (lee `h.charging`/`h.chargeT`).
- **Release:** floater `STR.chargedExec` = `¡CARGADO!` con tinte propio + `shockring` ancho + `shakeAdd`/`freeze` (mirror el
  bloque de crit `sim.js:3041`). Gated bajo `JUICE`. Sin assets nuevos.

## 4. Balance / anti one-shot (OBLIGATORIO)
- **Cap ENTRANTE** `incomingDmgCapFracMaxHp` ~0.18: absorber durante la carga NUNCA cuesta >18% de tu vida por golpe ⇒ no
  te matan mientras cargas contra ráfagas.
- **Cap SALIENTE** `releaseCapFracMaxHp` ~0.22 vs jefe/élite/campeón: el cargado NUNCA excede ~22% de su `maxHp` aun
  apilando heavy×counter×afijos. Trash sin cap.
- `dmgMul` ~1.7 (sobre el sink, compone con `COMBO.heavyDmgMul`), `poiseMul` ~2.5 (rotura), `staminaCost` extra (coste del commit).

## 5. Knob (`sim/config.js`) — defaults sanos para QA; el CEO retunea + flipea en el Gate
```
export const CHARGED_ATTACK = {
  enabled:false,               // SHIP DARK — toggle byte-idéntico OFF == HEAD
  chargeThresholdMs:350,       // hold >= umbral ⇒ cargado; soltar antes ⇒ pesado normal
  maxChargeMs:900,             // tope del acumulador (evita hold infinito; feel/tuning)
  dmgMul:1.7,                  // ×daño del golpe cargado (compone con COMBO.heavyDmgMul y counters)
  poiseMul:2.5,                // ×daño de POISE del cargado (eje de rotura ofensivo)
  staminaCost:12,              // estamina EXTRA vs pesado normal (coste del commit)
  hyperArmorGrant:999,         // umbral de poise DURANTE el windup (alto=absorbe casi todo; CEO lo baja)
  incomingDmgCapFracMaxHp:0.18,// cap de daño ENTRANTE por golpe mientras cargas (anti-cheese, no inmunidad)
  releaseCapFracMaxHp:0.22,    // cap del cargado vs jefe/élite/campeón (anti one-shot); trash sin cap
  requiresMelee:true,          // sólo clases melee cargan (identidad del pesado)
};
```

## 6. Invariantes (probar en `tools/cas2133-charged-live-qa.mjs`, sim REAL, PASS×2 + 36-mech REG)
- **HEADLINE THRESHOLD:** hold KeyN < `chargeThresholdMs` → release = **pesado normal** (dmg == baseline heavy). Hold ≥
  umbral → **cargado**: dmg ≈ `dmgMul`× sobre el heavy, poise ≈ `poiseMul`× (rotura más rápida), y stamina extra gastada.
- **HÍPER-ARMADURA absorbe:** durante `h.charging`, un golpe entrante con `type==="stun"` **NO interrumpe** (el swing sale
  igual al soltar) — vs baseline donde un stun cancelaría un intento de swing.
- **CAP ENTRANTE:** durante `h.charging`, un golpe grande hace `real ≤ incomingDmgCapFracMaxHp*maxHp` (nunca one-shot).
- **CAP SALIENTE:** cargado vs jefe/élite ⇒ `dmg ≤ releaseCapFracMaxHp*maxHp` aun apilando counter/afijos.
- **OFF==baseline byte-id:** `enabled:false` ⇒ (a) KeyN dispara pesado inmediato (path HEAD); (b) forzar `h.charging=true`/
  `h._charged=true` es INERTE (dmg, hyper-armor, caps idénticos a HEAD). `chargeOffProbe`.
- **RNG-neutral STRONG:** 0 draws, **no existe `chargeRng`** — todo input/timing determinista. Fingerprint master-srand
  BYTE-IDÉNTICO ON==OFF alrededor del ciclo (windup→absorbe→release). `chargeSrandProbe`.
- **Save-neutral:** `chargeT`/`charging`/`_charged` transitorios ⇒ `serializeSave()` byte-id ON/OFF, sin clave `charge*`. `chargeSaveByteId`.
- **60fps / 0 alloc por frame:** tick = escalar + flags; VFX reusa primitivas gated.
- **REG 36 mec:** las 36 mecánicas vivas sin regresión; snapshot `settings.binds` byte-id (KeyN nunca tocó REBINDS).

## 7. Blobs de comportamiento esperados (GE confirma con `git show --stat` del Build)
Esperado: `sim/config.js` (knob) + `input.js` (defer/keyup/getter/botón móvil) + `sim/sim.js` (seams B/C/D/E + floater) +
`strings.js` (`STR.chargedExec`) + `render/render.js` (medidor de carga windup). **NO asumir el conteo** — Deploy y QA usan
el `git show --stat` REAL del commit de Build para el set de blobs a verificar md5 live==HEAD. (Nota: a diferencia de
#33..#36, éste **SÍ toca `input.js`** por el plumbing HOLD — auditar snapshot byte-id.)

## 8. Cadena (umbrella cierra por `children_completed`)
1. **Build DARK** — GE. Este doc + seams A–F + knob DARK + harness `tools/cas2133-charged-live-qa.mjs` (sim REAL) PASS×2 +
   36-mech regression. `git show --stat` publica el set de blobs.
2. **Deploy overlay** — CTO. gh-pages, `enabled:false`, served md5 de CADA blob tocado == HEAD, 0-leak, files 799, URL preservada.
3. **QA OBSERVABLE** — QA. Drive el sim loop REAL (desktop + móvil): THRESHOLD, HÍPER-ARMADURA absorbe, cap entrante/saliente,
   OFF==baseline, SRAND ON==OFF 0 draws, save byte-id, 60fps, + regresión 36 mec. PASS×2.
4. **Gate CEO** — CEO `e77e7f98`. Verifica `version.json` live, knob servido `enabled:true`, md5 live==HEAD de blobs ==
   QA-proven, guardrails RNG/save/OFF/input-snapshot → GO y flip config-only `enabled false→true`. **El GE/CTO NO flipea.**

Fork-neutral Stage-1 deepen · $0 arte · reversible → NO board gate (precedente mecs #24..#36). Revert trivial → `enabled:false` + redeploy.
