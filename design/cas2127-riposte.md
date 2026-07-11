# CAS-2127 — Riposte / Ejecución Crítica por Aturdimiento (mecánica #36)

**Estado objetivo:** SHIP DARK (`RIPOSTE.enabled:false`). $0 arte · RNG-neutral STRONG · save-neutral · config-gated · reversible.
**Umbrella:** CAS-2127 (CTO). **Baseline LIVE previo:** `ac5304bfe54b`/799 (35 mec — Tibia nameplates render-only CAS-2124; sim md5 `336ee228`, config `9aeded55`, render `90eeaab5`).

## 1. Qué es y por qué

Todo el kit defensivo Souls-like ya vivo abre una **ventana de aturdimiento del enemigo** — parry, Guard Counter (#33),
Dodge Counter (#34), poise-break (#… `POISE`), frost-shatter de Status Buildup (#21) — pero el payoff hoy es sólo *"golpes
gratis"* (el bonus de daño plano de `POISE.bonusDmg` + el rematador `COMBO.staggerPunishMul`, ambos aplicados a **todo** el
resto de la ventana). **No existe una EJECUCIÓN dedicada.** Riposte introduce el crítico clásico de Souls: el **PRIMER**
golpe melee que conecta sobre un objetivo **roto** se convierte en un **Crítico de ejecución** (×dmg alto + tinte/flash
propio + poise extra + pequeño bonus de Esencia) y **CONSUME** el estado roto ⇒ **un solo crítico por rotura** (no crit
infinito encadenado). Convierte toda la inversión en poise/parry/status en un momento de payoff legible.

### Ortogonalidad (NO solapa con #33/#34)
- **Guard Counter (#33):** se dispara por TU **bloqueo** → `h.guardCounterT` (estado del HÉROE).
- **Dodge Counter (#34):** se dispara por TU **esquiva perfecta** → `h.dodgeCounterT` (estado del HÉROE).
- **Riposte (#36, éste):** se dispara por el **ESTADO DEL OBJETIVO** (`e.staggerT>0` + armado) — venga de donde venga la
  rotura. Si un Guard/Dodge Counter aterriza sobre un objetivo **ya roto**, el multiplicador Riposte **apila
  multiplicativamente** sobre ese golpe, pero **CAPEADO** (§3) para NO one-shot.

### ⚠️ Colisión de nombre (crítico para el GE)
Ya existe `h.riposte` (CAS-210, PARADA/perfect-dodge → crit forzado ×`CFG.riposteMult`, **armado por el HÉROE**, `sim.js`
~2921). Esa es una mecánica DISTINTA. **NO reusar `h.riposte` ni `CFG.riposteMult`.** El nuevo eje se llavea por el estado
del ENEMIGO. Usar nombres nuevos y disjuntos: knob `RIPOSTE`, flag transitorio de enemigo `e._ripArm`, flag local de golpe
`ripEx` (o similar). El floater/banner reusa el patrón de floaters pero con copy propio (`STR.riposteExec` = `¡CRÍTICO!`).

## 2. Diseño (thin additive)

### Estado (transitorio de enemigo, FUERA de cualquier serialize)
- `e._ripArm` (bool) — el objetivo tiene una **ejecución disponible** para su ventana de rotura actual. Se **arma** al abrir
  una ventana fresca de aturdimiento y se **consume** al primer golpe melee que rearme Riposte. Transitorio de run — NO se
  serializa (mirror `e.staggerT`/`e.poise`, que ya viven fuera del save).

### Seams (todos gated en `RIPOSTE.enabled`)

**A. Armar (rising-edge de la ventana de rotura).** El único sitio de PRODUCCIÓN que abre una ventana fresca es el
poise-break en `hitEnemy` (`sim.js:2902`):
```
e.stun=Math.max(e.stun||0,_dur); e.staggerT=_dur; e.staggerCD=POISE.reStaggerCD; e.poise=0;
+ if(RIPOSTE.enabled) e._ripArm=true;   // arma la ejecución para ESTA rotura
```
> **Auditoría GE (Build):** confirmar que **todos** los abridores de ventana fresca arman `e._ripArm`. Fuentes a auditar:
> (1) poise-break `sim.js:2902` [canónico, cubre combo-pesado, frost-shatter vía buildup→poise, y el SIGNATURE_BOSS
> `poiseBreakStunMs`]; (2) stun de **parry**; (3) stun directo de **Guard/Dodge Counter** si setean `e.staggerT`/`e.stun`
> sin pasar por 2902. Si alguna fuente setea `staggerT` por fuera de 2902, añadir el mismo `if(RIPOSTE.enabled)
> e._ripArm=true` allí. **Regla:** armar donde nace la ventana, NUNCA por-frame (evita rearmar mid-window).

**B. Ejecutar + consumir + capar (`hitEnemy`, junto al sink de multiplicadores de stagger `sim.js:2938-2960`).**
Colocar DESPUÉS de la resolución de crit (línea ~2924) y de los multiplicadores de stagger existentes (`POISE.bonusDmg`
2940, `COMBO.staggerPunishMul` 2946), de modo que Riposte **apile multiplicativamente** sobre ellos y sobre guard/dodge
counter (que ya escalaron `dmg` en `applyHeroMelee` antes de entrar a `hitEnemy`):
```
let ripEx=false;
if(RIPOSTE.enabled && e._ripArm && e.staggerT>0 && opt && opt.melee && !spirit){
  dmg *= RIPOSTE.dmgMul;                 // ejecución: ×dmgMul (0 draws)
  // CAP DURO anti one-shot: sólo jefes/élites/campeones. Trash sin cap (ejecución total).
  if(e.isBoss||e.elite||e.champion||e.champElite){
    const cap=RIPOSTE.ripCapFracMaxHp*(e.maxHp||e.hp);
    if(dmg>cap) dmg=cap;
  }
  e._ripArm=false;                        // CONSUME ⇒ un solo crítico por rotura
  ripEx=true;
}
```
- **Poise extra** (`RIPOSTE.poiseMul`): el objetivo ya está roto (acumulación de postura pausada mientras `staggerT>0`,
  gate 2877) ⇒ el poise extra es casi no-op en la práctica; se mantiene en el knob por **paridad** con #33/#34 y para tuning
  futuro. El GE lo aplica en el mismo sink de poise-damage (`add*=RIPOSTE.poiseMul` bajo `opt.riposteExec`) SÓLO si resulta
  observable; si no, documentar que queda inerte-por-diseño (target ya roto). No debe romper byte-id OFF.
- **Bonus de Esencia** (`RIPOSTE.essenceBonus`, pequeño): al ejecutar, `ensureMeta().essence += RIPOSTE.essenceBonus`
  (0 draws, mismo sink que kills). Recompensa de skill; no toca `save.v1` (banca a meta como cualquier Esencia). Gated ⇒
  OFF no lo suma ⇒ meta byte-id.

**C. VFX / floater ($0 arte, `hitEnemy` en el bloque de crit `sim.js:2995-3001`).** Cuando `ripEx`: emitir floater
`STR.riposteExec` (`¡CRÍTICO!`) con tinte dedicado (p.ej. naranja-ejecución `#ff9a3a`, distinto del crit rojo y del banner
riposte-parry dorado), + `shockring`/`debris` reusando las primitivas ya vivas + `shakeAdd`. Flash-gated bajo `JUICE`. Sin
assets nuevos. Gated ⇒ `enabled:false` ⇒ rama muerta ⇒ byte-id.

## 3. Balance / anti one-shot (OBLIGATORIO)

- `dmgMul` base **~2.2** (ajustable por knob).
- **Cap duro `ripCapFracMaxHp` ~0.25**: un Riposte contra jefe/élite/campeón NUNCA excede ~25% de su `maxHp`,
  garantizando NO one-shot **aun apilando** counter+riposte+afijos (el cap se aplica al `dmg` final de la rama, tras todos
  los multiplicadores). **Trash SIN cap** (o cap mayor) — se siente como ejecución.
- **Un solo crítico por rotura** (`e._ripArm` consumido) — no crit infinito encadenado sobre el mismo break.
- Bonus de Esencia pequeño — no rompe la economía meta.

## 4. Invariantes (a probar en `tools/cas2127-riposte-live-qa.mjs`, sim REAL, PASS×2 + 35-mech REG)

- **HEADLINE:** objetivo poise-broken (`_ripArm` armado) → 1er golpe melee = Riposte (dmg ≈ `dmgMul`× baseline, capado en
  jefe) → 2º golpe melee en la MISMA ventana = daño normal (`_ripArm` ya consumido, sólo bonus stagger residual).
- **CAP:** vs jefe/élite con `maxHp` alto, `dmg` del Riposte ≤ `ripCapFracMaxHp*maxHp` incluso apilando dodge/guard counter.
- **OFF==baseline byte-id:** `enabled:false` ⇒ (a) romper poise NO arma `_ripArm`; (b) forzar `e._ripArm=true` es INERTE en
  el golpe (dmg idéntico con/sin flag) ⇒ ramas de daño byte-idénticas a HEAD. `ripOffProbe`.
- **RNG-neutral STRONG:** 0 draws nuevos, **no existe `riposteRng`** — detección + aplicación DETERMINISTAS on-hit.
  Fingerprint master-srand BYTE-IDÉNTICO ON==OFF alrededor del ciclo real (break→ejecución→consumo). `ripSrandProbe`.
- **Save-neutral:** `e._ripArm` transitorio ⇒ `serializeSave()` byte-id ON/OFF, sin clave `rip*`. `ripSaveByteId`.
- **60fps / 0 alloc por frame:** la rama es aritmética escalar + un flag; el VFX reusa primitivas gated.

## 5. Knob (`sim/config.js`) — defaults sanos para QA; el CEO retunea + flipea en el Gate

```
export const RIPOSTE = {
  enabled:false,          // SHIP DARK — toggle byte-idéntico OFF == HEAD
  dmgMul:2.2,             // multiplicador de ejecución sobre el 1er golpe melee al objetivo roto
  poiseMul:1.5,           // poise-damage × (paridad #33/#34; casi no-op contra target ya roto)
  essenceBonus:2,         // Esencia pequeña por ejecución (recompensa de skill)
  ripCapFracMaxHp:0.25,   // cap duro: 1 Riposte ≤ 25% maxHp de jefe/élite/campeón (anti one-shot)
  requiresMelee:true,     // sólo golpes melee ejecutan (identidad de payoff ofensivo)
};
```

## 6. Blobs de comportamiento esperados (GE confirma con `git show --stat` del Build)

Esperado mínimo: `sim/config.js` (knob) + `sim/sim.js` (seams A/B/C) + `render/render.js` SÓLO si el VFX vive en render (el
plan lo mantiene en `sim.js` vía `addFx`/`floater` ⇒ probablemente **2 blobs**: config + sim). **No asumir 3** — el Deploy
y QA usan el `git show --stat` REAL del commit de Build para el set de blobs a verificar md5 live==HEAD.

## 7. Cadena (umbrella cierra por `children_completed`)

`blockedByIssueIds` NO settable por PATCH plano (HTTP 500) ⇒ la dependencia se documenta en la DESCRIPCIÓN de cada child.

1. **Build DARK** — GE. Este doc + seams A/B/C + knob DARK + harness `tools/cas2127-riposte-live-qa.mjs` (sim REAL) PASS×2 +
   35-mech regression. `git show --stat` publica el set de blobs.
2. **Deploy overlay** — CTO. gh-pages, `enabled:false`, served md5 de CADA blob tocado == HEAD, 0-leak, files preservados.
3. **QA OBSERVABLE** — QA. Drive el sim loop REAL (desktop + móvil): HEADLINE, CAP, OFF==baseline, SRAND ON==OFF, save
   byte-id, 60fps, + regresión 35 mec (0 regresión). PASS×2.
4. **Gate CEO** — CEO `e77e7f98`. Verifica `version.json` live, knob servido `enabled:true`, md5 live==HEAD de blobs de
   comportamiento == QA-proven, guardrails RNG/save/OFF → GO y flip config-only `enabled false→true`.

Fork-neutral Stage-1 deepen · $0 arte · reversible → NO board gate (precedente mecs #24..#35). Revert trivial → `enabled:false` + redeploy.
