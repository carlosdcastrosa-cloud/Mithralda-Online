# CAS-1947 — EVO Pilar 22: Jefe Firma multi-fase (SIGNATURE_BOSS)

**Umbrella:** [CAS-1947](/CAS/issues/CAS-1947) · **Autor:** CTO · **Fecha:** 2026-07-10
**Cadena:** Build → Deploy → QA (PASS×2 live, md5 live==HEAD) → **Gate CEO** (GO/NO-GO). Umbrella cierra por `children_completed`.
**Live base:** `9b369bb51869`/799 (HEAD `127514f`). URL: https://carlosdcastrosa-cloud.github.io/Mithralda-Online/

## Objetivo (1 frase)
Tras **21 pilares** de combate Souls-like, el mayor lever de DIVERSIÓN NO es un pilar nuevo sino un **PAYOFF**: un
**Jefe Firma multi-fase**, capstone de la zona endgame (Caldera), que **obliga a EJERCER el kit completo** — dodge
i-frame / parry / backstab tras telegraph, poise-break que premia combo/finisher, y status buildup AL HÉROE (frost/bleed)
capeado sin one-shot. Es **contenido que valida la cohesión de los 21 sistemas**, no maquinaria nueva. **100% BORROW**,
$0 arte (tinte/glyph/flash/escala procedural), 1 knob, OFF byte-idéntico.

## Por qué este seam (100% BORROW — todo lo que necesita ya existe y está VIVO)
El juego YA tiene un jefe capstone de la Caldera con moveset telegrafiado (`calderatyrant` "Corazón de Magma"), un
canal de `special` multi-golpe (`slam` radial, convención dragón CAS-317), el motor de **STATUS_BUILDUP** (Pilar 21,
paridad héroe↔enemigo), un **loot branch de jefe** con Esencia+rareza, una **barra de vida de jefe** en el HUD, y la
**zona endgame gated** (Caldera / ZONE5). SIGNATURE_BOSS es una **capa de comportamiento gated sobre ESE jefe**: no
crea un enemigo nuevo, no toca trash ni otros jefes, no abre zona. Reconvierte al capstone existente en un combate de
**dos fases** con ventana de transición vulnerable y feed de estado al héroe.

### Seams REALES (verificados, file:line sobre HEAD `127514f`)
- **Plantilla del jefe (base):** `sim/config.js:405-409` `ETPL.calderatyrant` (`boss:true`, `richAnim`, `bossLabel:"CORAZÓN DE MAGMA"`,
  `special:{name:"Erupción de la Caldera", every:3, windup:1.0, slam:{count:14, spd:180, dmg:24, life:1.2}}`). **REUSA este sprite/template** — NO PixelLab.
- **Spawn + flag jefe:** `sim/sim.js:793` (`e.isBoss`), `sim/sim.js:1649` `spawn`. `poiseCeil()` ya lee `e.isBoss` (`sim.js:1662`).
- **Moveset / telegraph / special:** `sim/sim.js:4030-4120` (ejecución de `special`/slam/proyectiles), `sim/sim.js:3871-3882`
  (render del telegraph: marca/línea/burst), `armAbility()` `sim.js:4217-4255` (ENEMY_ABILITIES CAS-1819/1820).
- **hitEnemy / poise / backstab / killEnemy + loot:** `sim.js:2131` `hitEnemy` (poise accum `2178-2194`, backstab `2242-2244`),
  `sim.js:2345-2424` `killEnemy` (rama jefe loot+Esencia+xp `2382-2390`; unique/set/rune rolls en streams dedicados).
- **STATUS_BUILDUP (Pilar 21) — feed al héroe:** `addBuildup` `sim.js:3003-3012`, `procBuildup` `sim.js:3016-3033`,
  `tickBuildup` `sim.js:3037-3040`, `statusOrBuildup` `sim.js:3045-3048`; **`damageHero` choke** `sim.js:4486-4559`
  (aplica `infl`+bleed buildup `4566-4567`). El jefe alimenta `h.bld` por ESTE mismo helper ⇒ paridad ya cableada.
- **i-frames / dodge / parry / poise:** `doRoll()` `sim.js:3531-3553` (iframeMs `config.js:1059-1064`), parry `sim.js:4492`
  (`PARRY` `config.js:1027-1034`), i-frame check `sim.js:4507`, POISE `config.js:1095-1106`, BACKSTAB `config.js:1142`.
- **Barra de vida de jefe (HUD):** `render/render.js:1372-1390` (barra 64px para `isBoss` + `bossLabel`), helper `bar()`
  `render.js:1800`. **REUSA este patrón** para el indicador de fase (glyph/segmento), NO arte nuevo.
- **Zona endgame / gate:** `ZONE5` (Caldera) `config.js:920`, `ZONE_TIER` `config.js:609-641`, `CALDERA_POWER_REQ`
  `config.js:649-658`, `HUNTS.caldera.boss` lee `calderatyrant` verbatim, `BONFIRE` `config.js:1233-1249`. **NO nueva zona.**
- **RNG streams:** factory `sim/rng.js:14-20`; streams dedicados existentes `sim.js:50-116` (legRng/setRng/arenaRng/…).
  Si SIGNATURE_BOSS necesita variación ⇒ **stream propio `bossRng`** (patrón idéntico); con feature ON, base srand 0-draw.
- **SAVE allowlist:** `serializeSave()` `sim.js:1446-1516` (allowlist explícito), `loadSave()` `1521-1600`. `ent.bld` YA es
  transitorio fuera del allowlist. Fase/timers del jefe = transitorios de run. El ÚNICO candidato persistente = flag de
  **primer kill** (append-only, gated) — ver §Save.

## Diseño de las dos fases (números = FEEL/CEO, tunables sin rebuild)
- **Fase 1 (baseline):** el moveset actual del `calderatyrant` — golpe telegrafiado + Erupción cada 3er golpe. Idéntico
  al capstone de hoy salvo que es el jefe firma (glyph de fase 1 en la barra). Enseña los tells.
- **Transición (@ `phase2HpPct` ≤50% HP):** el jefe entra en una **ventana breve de vulnerabilidad** (`transitionWindowMs`,
  telegrafiada por flash/tinte procedural + stun corto del jefe) — **recompensa burst** (héroe pega con `transitionVulnMul`
  o el jefe queda poise-broken abierto a finisher). Cruce de fase **una sola vez** (`e._sbPhase` transitorio, no rebota).
- **Fase 2 (moveset ampliado, más agresivo):** `special.every` menor (más frecuente), `windup` **igual o mayor** para
  mantener telegrafiado (NO más rápido de reaccionar; agresivo = más volumen, no ilegible), `slam.count`/`dmg` mayores,
  umbral de **poise mayor** (aguanta más, premia poise-break sostenido), y **la Erupción monta `infl` de estado** que
  alimenta `h.bld` (frost/bleed) por `damageHero` ⇒ CAPEADO, sin one-shot.

## Ejerce el kit bidireccional (la razón de ser del pilar)
- **Ataques pesados TELEGRAFIADOS** ⇒ el tell (`special.windup` + línea/marca `render 3871-3882`) recompensa **dodge
  i-frame** (`doRoll`), **parry** (ventana `sim.js:4492`), y **backstab** tras esquivar (arco rear `hitEnemy 2242-2244`).
- **Ventana de POISE-BREAK** ⇒ acumular poise damage (combo/heavy/weapon-art) cruza el umbral del jefe (`POISE`
  `config.js:1095`) ⇒ stagger ⇒ ventana de **finisher/burst** (premia el combo del kit).
- **APLICA status buildup al héroe** ⇒ Fase 2 `infl` frost/bleed vía `damageHero` → `addBuildup(h,…)` (Pilar 21),
  **capeado** (`ailmentsToHero.cap`) y **respetando i-frames/dodge** (dodge evita el `infl`, `damageHero` ya lo salta).
- **Recompensa al matar** ⇒ rama jefe `killEnemy 2382-2390`: **Esencia bonus** + **drop garantizado de rareza alta**
  (reusa loot/rarity existente; NO nueva tabla). Gate por zona endgame (Caldera) — reusa BONFIRE/portal, no zona nueva.

## Knob (1 config `SIGNATURE_BOSS`, config-tunable sin rebuild)
```js
export const SIGNATURE_BOSS = {
  enabled: true,
  boss: "calderatyrant",       // REUSA la plantilla capstone de la Caldera (Corazón de Magma). NO sprite nuevo.
  zone: "caldera",             // gate endgame — reusa HUNTS.caldera.boss / ZONE5. NO nueva zona.
  phase2HpPct: 0.5,            // transiciona a Fase 2 al cruzar ≤50% HP (una sola vez)
  transitionWindowMs: 1500,    // ventana breve de vulnerabilidad tras la transición (recompensa burst)
  transitionVulnMul: 1.5,      // el héroe pega ×esto durante la ventana (o poise-break abierto a finisher)
  poiseBreakStunMs: 1200,      // duración del stagger del jefe al cruzar su umbral de poise (ventana finisher)
  phases: {
    // Fase 1 = espejo del special actual (baseline; el jefe de hoy). glyph fase 1 en la barra.
    p1: { specialEvery:3, windup:1.0, slamCount:14, slamDmg:24, poiseMul:1.0 },
    // Fase 2 = moveset ampliado, MÁS agresivo (más volumen, sigue telegrafiado), monta infl de estado.
    p2: { specialEvery:2, windup:1.0, slamCount:18, slamDmg:26, poiseMul:1.4,
          slamInfl:{ type:"frost", amt:0.4, dur:1.8 } },   // reconvertido a buildup por STATUS_BUILDUP
  },
  ailmentsToHero: { buildPerHit:18, cap:70 },  // CAPEADO: bld al héroe nunca one-shot; respeta i-frames/dodge/parry
  rewards: { essenceBonus:200, guaranteedRarity:"rare" },  // Esencia extra + drop garantizado rareza alta (reusa loot)
};
```

## Seam plan (100% BORROW — dónde toca)
`sim/config.js` — el knob `SIGNATURE_BOSS` (bloque nuevo, NO toca `ETPL`/`STATUS`/`STATUS_BUILDUP`).

`sim/sim.js`:
1. **Marcar el jefe firma en spawn** — cuando `SIGNATURE_BOSS.enabled` y el jefe spawneado es `boss==="calderatyrant"`
   en `zone==="caldera"` (`spawn`/`HUNTS.caldera.boss`), setear transitorios `e._sbPhase=1`, `e._sbTransT=0`,
   `e._sbGlyph`. Sin `enabled` ⇒ el jefe es el `calderatyrant` de HEAD, byte-idéntico.
2. **Transición de fase** en el update del jefe: si `e._sbPhase===1 && e.hp <= e.maxHp*phase2HpPct` ⇒ set `_sbPhase=2`,
   abrir `_sbTransT=transitionWindowMs` (stun corto + flash procedural), aplicar params `phases.p2` al `special`
   efectivo del jefe (append sobre `e.special`, no muta `ETPL`). Una sola vez (guard `_sbPhase===1`).
3. **Ventana de vulnerabilidad** en `hitEnemy` (`sim.js:2131`): si `e._sbTransT>0` ⇒ `dmg *= transitionVulnMul` (o el
   jefe está poise-broken). Decae `_sbTransT` en el tick. Reusa el flujo de dmg/poise existente (no bypass).
4. **Special por fase**: en la ejecución de `special` (`sim.js:4030-4120`) leer los params de `phases[p]` (every/windup/
   slam*) del jefe firma en vez de `ETPL.special`. Fase 2 monta `slamInfl` en los proyectiles del slam.
5. **Feed al héroe (paridad, CAPEADO)**: los proyectiles/golpe del jefe firma con `slamInfl` llegan a `damageHero`
   (`sim.js:4486-4559`) que YA enruta `infl`→`addBuildup(h,…)` (Pilar 21). Añadir el **cap** `ailmentsToHero.cap` sobre
   `h.bld[type]` (nunca one-shot; `damageHero` ya respeta i-frames/dodge/parry). `buildPerHit` sustituye el `1` del feed.
6. **Poise-break window**: reusa POISE/stagger existente; `poiseMul` de fase escala el umbral del jefe; al romperse abre
   `poiseBreakStunMs` (reusa el stagger channel — no maquinaria nueva).
7. **Recompensa** en `killEnemy` rama jefe (`sim.js:2382-2390`): si el muerto es el jefe firma ⇒ `+essenceBonus` y forzar
   **un drop garantizado de `guaranteedRarity`** por el path de loot existente (reusa la tabla/rarity; NO nueva tabla).
8. **RNG**: comportamiento determinista/telegrafiado. Si hace falta variación (p.ej. ángulo de slam en fase 2) ⇒ stream
   dedicado `bossRng` (patrón `sim.js:50-116`); con ON, **base srand 0-draw** ⇒ srand ON==OFF.
9. **Probe/debug hooks** (dev-only, patrón `__hooks`): leer `e._sbPhase`, forzar HP a umbral, leer `h.bld`, leer loot.

`render/render.js` — **$0 arte**: (a) **indicador de fase** en la barra de jefe existente (`render.js:1372-1390`) — glyph/
segmento por `e._sbPhase` (primitivas, patrón `bar()` `render.js:1800`); (b) **flash/tinte/escala** procedural del sprite
en la transición (reusa `addFx`/`floater`/tinte de status ya dibujados). Sin sprites/audio nuevos. El Build reporta el set
EXACTO de blobs vía `git show --stat` (esperado config+sim, +render si la barra/flash lo justifica; +input/hud NO — pasivo).

## Save (transitorio + único candidato persistente)
- **Todo el estado de fase/timers = transitorio de run** (`_sb*` en la entidad, mirror `bld`/`dots`) ⇒ **fuera del
  allowlist** (`serializeSave` `sim.js:1446-1516`) ⇒ `save.v1` byte-idéntico.
- **Primer kill** (si el diseño quiere recordarlo, p.ej. para el drop garantizado una-vez o un flag de trial-cleared):
  **append-only, gated**. Con `enabled:false` NO se escribe la clave ⇒ save byte-id OFF. Preferencia por defecto:
  **byte-id total** (drop garantizado cada kill del jefe firma; sin persistencia) salvo que el CEO pida "una vez".
  Si persiste ⇒ clave nueva append-only (NO reescribir `save.v1`, NO tocar claves existentes). Documentar en el Build.

## Requisitos de calidad (NO negociables — idénticos a pilares 1-21)
1. **1 knob `SIGNATURE_BOSS`** con `enabled` (OFF ⇒ **byte-idéntico a HEAD**: el jefe de la Caldera es el `calderatyrant`
   de hoy, sin fases, sin ventana, sin feed al héroe, sin glyph) + params tunables sin rebuild.
2. **RNG-neutral STRONG**: comportamiento determinista/telegrafiado; 0 draws en el stream base con feature ON. Si hay
   variación ⇒ `bossRng` dedicado; **srand ON==OFF 48-draw**; OFF byte-id (save + srand).
3. **Save-aislado**: fase/timers transitorios; si persiste el primer kill ⇒ stream/clave append-only; OFF byte-id.
4. **$0 arte**: sólo tinte/glyph/flash/escala procedural + `addFx`/`floater`/`bar()` vivos. **NO PixelLab.**
5. **No one-shot al héroe**: el feed de estado está CAPEADO (`ailmentsToHero.cap`); respeta i-frames/poise/parry/dodge
   existentes (el jefe pasa por `damageHero`/`applyStatus` como cualquier enemigo, sin bypass).
6. **Compone sin regresión**: reusa `special`/slam/STATUS_BUILDUP/killEnemy loot/boss-bar/ZONE5; 21 pilares vivos; el
   jefe ejerce dodge/parry/backstab/poise-break/estamina/estado sin romper ninguno.
7. **Móvil**: barra de jefe + glyph de fase + flash visibles en touch; sin nuevo control (el combate usa el kit existente).
8. **0 regresión**: OFF ⇒ Caldera y su capstone byte-idénticos a HEAD; 60fps core-loop; touch intacto.

## Aceptación (harness `tools/cas1947-signature-boss.mjs`, PASS×2 byte-id, sobre sim REAL)
- **AC0 OFF**: `enabled:false` ⇒ serialize + combate del `calderatyrant` byte-id a HEAD (sin `_sb*`, sin fases, sin feed,
  sin glyph). Un golpe del jefe con OFF produce el MISMO `h.dots`/`bld` que HEAD.
- **AC1 Fase 1 baseline**: ON, HP>50% ⇒ moveset == capstone de hoy (Erupción cada 3, telegrafiada); glyph fase 1.
- **AC2 Transición**: bajar HP a ≤`phase2HpPct` ⇒ `_sbPhase` 1→2 **una sola vez** (no rebota), abre `transitionWindowMs`
  con flash/stun; durante la ventana el héroe pega ×`transitionVulnMul` (burst recompensado).
- **AC3 Fase 2 moveset ampliado**: `special.every`/`slamCount`/`slamDmg`/`poiseMul` de `phases.p2` activos; sigue
  telegrafiado (windup ≥ fase 1). La Erupción de fase 2 monta `slamInfl`.
- **AC4 Telegraph recompensa el kit**: dodge i-frame (`doRoll`) evita el slam+infl; parry en la ventana; backstab tras
  esquivar aplica `BACKSTAB.mult`. Todos por los seams existentes (no bypass).
- **AC5 Poise-break**: acumular poise damage cruza el umbral (escalado `poiseMul`) ⇒ stagger `poiseBreakStunMs` ⇒
  ventana de finisher; premia combo/heavy/weapon-art.
- **AC6 Status al héroe CAPEADO**: fase 2 `slamInfl` frost/bleed alimenta `h.bld` por `damageHero` (Pilar 21), **capeado
  a `cap`**, **nunca one-shot**; dodge/i-frame evita el `infl`.
- **AC7 Drop garantizado**: matar al jefe firma ⇒ `+essenceBonus` Esencia y **≥1 drop de `guaranteedRarity`** (reusa loot).
- **AC8 RNG**: srand ON==OFF 48-draw; procs/slams reales; si hay `bossRng`, base stream 0-draw; determinism PASS.
- **AC9 SAVE**: `save.v1` byte-id sin claves `_sb*`; si persiste primer-kill ⇒ clave append-only y OFF sin ella.
- **AC10 REG**: 21 pilares vivos + core-loop 60fps + touch intactos; Caldera OFF byte-id.

## Deploy (conteo de blobs)
Contar blobs reales vía `git show --stat` del Build (NO asumir 3). Mínimo esperado: **config + sim**; **+render** si el
Build dibuja el glyph de fase / flash en `render.js`. md5 served==HEAD por CADA blob tocado. Overlay 0-leak.

## Notas de ejecución / GOTCHAS heredados
- **REG zona-sensible**: probes que matan al jefe contaminan loot RNG condicional a zona ⇒ héroe prístino / restaurar
  estado entre probes (patrón CAS-1898/1904/1911/1917/1924/1929/1935). Bonfire/EquipLoad/Arch/Arts/Buffs/Buildup al final.
- **OFF byte-id crítico**: cada seam DEBE caer al comportamiento `calderatyrant` de HEAD con `enabled:false`. AC0 lo
  verifica (golpe del jefe OFF == HEAD; save byte-id; sin `_sb*`).
- **No doble-transición / no rebote**: guard `_sbPhase===1` para el cruce; la ventana de vuln decae por timer, no por HP.
- **Muerte durante ventana**: si el burst mata al jefe en la ventana ⇒ enrutar a `killEnemy` normal (drop garantizado).
- **Cap del feed al héroe**: clamp `h.bld[type]` a `ailmentsToHero.cap` DESPUÉS del `addBuildup` — nunca one-shot.
- **QA live**: harness espejo de `tools/cas1931-status-buildup-live-qa.mjs` (`tools/cas1947-signature-boss-live-qa.mjs`);
  hooks `_sb*`/`bld*` vía `import()` misma URL; md5 live==HEAD de TODOS los blobs; OFF byte-id; srand ON==OFF; save-neutral;
  PASS×2 desktop+mobile. **DoD OBSERVABLE**: screenshot del jefe en fase 1 y fase 2 (glyph distinto) + drop en el loop real.
