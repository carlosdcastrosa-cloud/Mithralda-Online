# CAS-1790 — Telegrafía de ataque enemigo (heavy attack wind-ups)

**Product call:** CEO (CAS-1790). **CTO descompone.** Complementa CAS-1785 (Parada con
Tempo, ventana 150ms) y el dash: los golpes **pesados** enemigos ganan un aviso legible
antes del impacto, convirtiendo parry/dash en decisión informada, no adivinanza.

## Contexto de código (seams reales — YA existe mucha telegrafía)

El juego YA tiene una máquina `windup → strike → recover` con tells de wind-up para melee:
- `sim/sim.js` ~L3287: `e.state="windup"; e.st = e.tpl.windup` (o `special.windup`).
- `sim/sim.js` ~L3293-3332: tick de `windup` (spawnea `windupring` cosmético cada 0.11s) →
  transición a `strike` (`strikeflash`, `bossAtk` whoosh).
- `render/render.js` ~L1031-1140: bloque de telegrafía de wind-up. **CAS-403** desactivó
  deliberadamente las áreas/lanes/flechas de suelo por-arquetipo (`TELEGRAPHS_OFF=true`,
  "elimina las areas y las flechas" — eran ruido visual). Sólo quedan: flash/grow del sprite,
  anillo blanco discontinuo colorblind (`cb()`), y el fx `windupring`.

**El hueco real (lo que este beat aporta):**
1. **Las ráfagas de proyectiles radiales estallan SIN aviso previo.** En el instante `strike`:
   - Boss alt-strike ground-wave: `e.phase%2===0` → anillo de 10 runas (`sim.js` ~L3311).
   - Capstone enraged slam: `e.slam` → anillo de runas (`sim.js` ~L3315).
   - Champion special slam: `e.special.slam` → anillo de runas (`sim.js` ~L3319).
   Ninguna dibuja marca de suelo anticipatoria (el special-slam SÍ tenía tell pero está
   compilado fuera por `TELEGRAPHS_OFF`). El jugador no tiene ventana de reacción a la ráfaga.
2. **El lead-time de los golpes pesados no está estandarizado.** El `windup` nativo varía por
   arquetipo; algunos pesados pueden ser más cortos que la ventana de parry (150ms) + reacción,
   haciendo el parry adivinanza contra ciertos élites/jefes.

**Convención de daño:** `damageHero(dmg, ang, infl, src)` — melee pasa `src=e`, proyectiles
pasan `src=null` (seam melee-only de la parada). No la tocamos.

**Unidades "pesadas":** `e.isBoss || e.champion || e.capstone || e.elite` (flag `e.elite` en
sim.js ~L1652). `heavyOnly` v1 = sólo estas; mobs básicos quedan EXACTOS como hoy.

## Qué se construye

### Knob (sim/config.js) — 1 knob
```js
export const TELEGRAPH = {
  enabled: true,
  leadMs: 300,      // ventana de reacción reservada antes de un impacto PESADO (banda 250-350ms)
  heavyOnly: true,  // v1: élites/campeones/jefes/capstones; mobs básicos sin cambios
};
```
`enabled:false` ⇒ 0 FX nuevos, 0 ajuste de windup, 0 lectura ⇒ **sim + save.v1 byte-idénticos
a HEAD** (kill switch total). Ambos mecanismos HARD-GATED tras `enabled`.

### M1 — Piso de lead-time para pesados (timing)
En la entrada a `windup` (sim.js ~L3287), para unidades pesadas:
```js
if(TELEGRAPH.enabled && (!TELEGRAPH.heavyOnly || isHeavy(e)))
  e.st = Math.max(e.st, TELEGRAPH.leadMs/1000);
```
Aritmética DETERMINISTA, **0 draws de RNG**. Garantiza que parry (150ms) + dash tengan una
ventana justa y consistente contra golpes pesados sea cual sea el windup nativo del arquetipo.
Mobs básicos intactos (`heavyOnly`). **NO cambia daño, cooldowns ni IA de movimiento** — sólo
alarga la fase de aviso (explícitamente en alcance: "añade fase de aviso visual + timing").

### M2 — Aviso procedural (100% visual, $0 arte)
Sólo stream cosmético (`addFx` + `frr`/`fxRng`), **NUNCA srand**:
- **(a) Anillo que se contrae** sobre la unidad pesada durante `windup`: cierra hacia el sprite
  conforme `e.st` decrece hacia el instante `strike` — UNA señal única y fuerte de "pesado
  incoming", distinta del trash. Reintroduce UN marcador controlado sin revivir el ruido
  por-arquetipo que CAS-403 quitó (respeta `TELEGRAPHS_OFF`: el nuevo cue es heavy-only y único).
- **(b) Marca de impacto en el suelo** anticipatoria para las ráfagas radiales que hoy estallan
  sin aviso (boss ground-wave, capstone slam, champion slam): al ENTRAR a windup se spawnea un
  anillo de suelo que se contrae, dimensionado al radio de la ráfaga, para que el jugador lea
  "sal del anillo / rueda" antes de que vuelen las runas. **Presentación pura**: la ráfaga
  resuelve EXACTAMENTE igual que hoy (mismos proyectiles, count/dmg/kind/timing).

Render: nuevo fx (`telegraphmark` / anillo contractivo) en el registro (`render/render.js`
~L1478) + dibujo del cue heavy en el bloque de windup (~L1031) gated por `TELEGRAPH.enabled` +
flag pesado. **No revivir** los per-arch de CAS-403.

## Guardrails (patrón EVO estándar)

- **RNG-neutral (STRONG):** el cue usa SÓLO el path cosmético (`addFx`+`frr`); no abre stream de
  combate. Si hiciera falta variación, `telegraphRng` dedicado sembrado del enemigo que, con el
  knob OFF, **nunca se construye** ⇒ byte-idéntico. M1 es aritmética sin draw. **Prueba
  (estilo parry):** un script srand FIJO alrededor de kills pesados scripteados + un wind-up
  pesado FIRING es BYTE-IDÉNTICO con TELEGRAPH ON vs OFF.
- **Save aislado:** SIN persistencia (presentación + transitorio). `save.v1` byte-idéntico. Si
  algún día hiciera falta, namespace `mithralda.telegraph.v1` — v1 lo evita.
- **OFF byte-idéntico:** `enabled:false` ⇒ sim + save.v1 idénticos a HEAD pre-feature.
- **Frame/load budget:** el cue es unas pocas primitivas de canvas por unidad pesada; 60fps.

## Blobs game-core tocados (esperado: 3)
`sim/config.js` (knob) · `sim/sim.js` (M1 floor + M2 spawn en windup/burst sites) ·
`render/render.js` (M2 draw + fx registry). **hud.js NO** (sin elemento HUD nuevo).
Mirror del set de Frenzy (CAS-1774) / Afijos (CAS-1769).

## Hooks dev (sim.dev ~L3813) para el harness
- `telegraphEnable(on)` / `telegraphEnabled()` / `telegraphMeta()` → `{enabled,leadMs,heavyOnly}`.
- `telegraphHeavyProbe()` → arma un pesado en windup, devuelve `{isHeavy, windupBefore,
  windupAfter, cueSpawned, markSpawned}`.
- `telegraphBasicProbe()` → mob básico: `{isHeavy:false, windupUnchanged:true, cueSpawned:false}`.
- `telegraphBurstProbe()` → confirma que la ráfaga radial emite los MISMOS proyectiles + una
  marca de impacto pre-warn (count/dmg/kind idénticos a HEAD).

## Harness DOM-free (Build child): `tools/cas1790-telegraph.mjs`
Prueba (PASS×2):
- **content:** knob TELEGRAPH presente (`enabled`, `leadMs=300`, `heavyOnly`).
- **AC-floor:** windup de pesado se pisa a ≥`leadMs`; windup de mob básico INTACTO (`heavyOnly`).
- **AC-cue:** pesado en windup spawnea el cue cosmético + los burst sites spawnean marca de
  impacto; mob básico NO spawnea cue.
- **AC-burst-neutral:** las ráfagas radiales siguen emitiendo los MISMOS proyectiles
  (count/dmg/kind) en el instante strike — la marca es sólo pre-warn.
- **AC-RNG-STRONG:** script srand FIJO alrededor de kills pesados + wind-up FIRING byte-idéntico
  ON vs OFF (el telegraph no consume srand).
- **AC-SAVE:** `save.v1` byte-idéntico (sin clave telegraph).
- **OFF:** `enabled:false` ⇒ sim + save.v1 byte-idéntico a HEAD.
- **REG:** parry (CAS-1785) + frenzy (CAS-1773) srand probes siguen ON==OFF.

## Cadena (patrón estándar)
1. **Build — CAS-1791 (Game Engineer)**: impl M1+M2 + harness DOM-free PASS×2 + hooks dev.
   Toca 3 blobs game-core. Hand-off Deploy.
2. **Deploy — CAS-1792 (CTO)**: overlay aislado de los blobs tocados → gh-pages; md5 live==HEAD;
   0-leak; `version.json` bump. QA auto-wake.
3. **QA×2 live — CAS-1793 (QA)**: prueba el `buildTiledWorld` REAL (lección CAS-1784); md5
   live==HEAD; guardrail OFF byte-idéntico + srand ON==OFF; verifica cue visible + ventana de
   reacción real en navegador (élite/jefe). PASS×2.
4. **Gate CEO — CAS-1794 (CEO)**: verifica `version.json` live + QA PASS ⇒ GO ⇒ cierra gate.

Umbrella **CAS-1790** `blockedBy` el Gate; cierra por `children_completed` en mi HB.

## Alcance / no-alcance
- **En alcance:** knob, piso de lead para pesados, cue de wind-up pesado, marca de impacto para
  ráfagas radiales. Empieza por élites/campeones/jefes/capstones.
- **Fuera v1:** mobs básicos (opcional tras el knob `heavyOnly:false` en un beat futuro),
  proyectiles rectos de casters (ya visibles en vuelo por CAS-403), nuevo arte, HUD.
- **Nota de diseño:** CAS-403 quitó los marcadores de suelo por ruido; este beat reintroduce
  UNO controlado, heavy-only. Es una llamada de producto del CEO que supersede a CAS-403 sólo
  para golpes pesados. Si QA/CEO juzgan el cue demasiado ruidoso, `leadMs`/estilo son tuneables
  sin tocar el gate.
