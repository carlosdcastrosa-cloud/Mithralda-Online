# CAS-2090 — Desafío con Semilla (Seeded Challenge Run)

**EVO / Gameplay Evolution · NO-gated · $0 arte · DARK-ship · reversible.**
Mecánica #31, 4º meta-modo de replay (tras NG+, Boss Rush, Pactos). Valor NUEVO = **reproducibilidad compartible**.

## 1. Tesis

Una **semilla** (código compartible `MITH-XXXX` o la fecha del día) siembra el `srand` **MAESTRO** ⇒ dos jugadores con
la misma semilla juegan el **MISMO run determinista** y comparan score. No es un sistema aislado: **COMPONE la stack**
existente reusando el gauntlet de Boss Rush como *ruleset fijo* + su scoring time-attack (`BOSS_RUSH.score*`, 0 RNG).

## 2. Arquitectura (composición, no sistema nuevo)

| Pieza | Reuso | Delta CAS-2090 |
|---|---|---|
| Ruleset / contenido | `BOSS_RUSH.sequence` (gauntlet finito, mismo spawn/tick/rest) | — (reuso íntegro) |
| Timer + score | `bossRushScoreComplete` fórmula → duplicada en `seededScoreComplete` (0 RNG) | records por-código |
| Recap overlay | escena `bossRushRecap` + `ui.bossRushRects` | banner "⚑ Semilla: CODE" |
| Entrada | seam menú `pendingBossRush` → mirror `pendingSeededChallenge` | tecla **menú** `KeyC` (NO hotkey de play) |
| Records | store aislado (mirror `mithralda.bossrush.v1`) | `mithralda.seededchallenge.v1` = `{v:1,records:{[code]:{score,timeMs}}}` |

### Seam de determinismo (el corazón)
- `seededHash(str)` — FNV-1a **puro/estable** → uint32. Mismo string ⇒ misma semilla en cualquier motor JS.
- `startSeededChallenge()` — **ÚNICO** sitio que llama `seed(seededHash(code))` sobre el stream maestro. Sólo se
  alcanza vía la entrada de menú (`pendingSeededChallenge`) o el retry del recap.
- El **run entero** (spawns, drops, combate srand-driven) pasa a ser función pura de `(code, inputs)` — la propiedad
  de determinismo que el sim ya garantiza (sim.js:13). Dos jugadores con el mismo código + mismos inputs = run byte-id.
- La fecha del día se deriva en la **capa UI** (`game.js`, `new Date()`), NUNCA en el sim (rompería el determinismo).
  `G.seededDailyCode = codePrefix + YYYYMMDD`.

### Invariante OFF = byte-id (probado)
Toda rama nueva está gateada por `G.seededChallengeMode` (false en TODO run normal **y** en Boss Rush normal) o por
`SEEDED_CHALLENGE.enabled`. Con `enabled:false`: la entrada de menú no se dibuja ⇒ `pendingSeededChallenge` nunca se
arma ⇒ `startSeededChallenge` nunca corre ⇒ el master srand **NUNCA** se resiembra ⇒ fingerprint byte-idéntico a HEAD.
El store aislado nunca se escribe (`seededChallengeDirty` nunca se arma) — mirror del invariante bloodstain/hints.

## 3. Archivos tocados (7)
- `sim/config.js` — knob `SEEDED_CHALLENGE {enabled:false, key:"KeyC", codePrefix:"MITH-"}`.
- `sim/sim.js` — G state (mode/pending/dirty/code/records) · consume seam · `startSeededChallenge`/`seededScoreComplete`/
  `seededHash`/`seededDailyCode`/`serializeSeededChallenge`/`loadSeededChallenge` · rama seeded en `gauntletComplete` ·
  `retry/exitBossRushRecap` + death/resume clears · dev hooks `sc*`.
- `persist.js` — store `mithralda.seededchallenge.v1` (read/save/boot + flush tick + unload).
- `game.js` — `bootSeededChallenge()` + deriva `G.seededDailyCode` (capa UI).
- `render/render.js` — HUD indicador "⚑ DESAFÍO · CODE" + recap banner + botón de menú (gated).
- `input.js` — entrada de menú `KeyC`/tap (gated) + limpieza de pending en las otras entradas.

## 4. Verificación
- **Node harness** `tools/cas2090-seeded-challenge.mjs` — PASS×2: AC0 knob DARK · AC1 misma semilla = mismo stream RNG
  (32 draws byte-id; códigos distintos difieren) · AC2 reseed puro · AC3 score determinista == oráculo · AC4 run
  completo determinista (recap byte-id) · AC5 records aislados por semilla (+ no-batido preserva) · AC6 store shape +
  round-trip + coerción.
- **OFF byte-id (probado):** `variantSrandProbe` master-srand fingerprint **idéntico** con edits vs HEAD (git-stash diff).
- **Boss Rush unregresado:** `cas2047-timeattack.mjs` AC8 determinismo PASS (AC0 `default false` es assert stale
  pre-CAS-2055, no regresión — `timeAttack` está LIVE).

## 5. Decisiones de alcance (CTO)
- **Entrada = menú, semilla del día.** Lección directa CAS-2085: cero hotkeys de *play* nuevos (SUMMON.key colisionó).
  `KeyC` es tecla de **escena menú** (mirror `BOSS_RUSH.key`/`ARENA.key`) ⇒ categóricamente sin colisión de combate.
  La semilla del día (todos los que juegan ese día = mismo run) es el primitivo compartible del slice.
- **Fast-follow (no en este slice):** UI de pegar/elegir código arbitrario + ubicar la entrada dentro del panel
  SETTINGS_MENU. El dev bridge (`scStart(code)`) ya prueba códigos arbitrarios ⇒ el determinismo compartible es total;
  sólo falta la superficie de *input de texto* en canvas, que es UI pesada y de mayor riesgo — se difiere.

## 6. Cadena de entrega
Build (este) → Deploy(dark, CTO) → QA(OBSERVABLE, PASS×2) → Gate CEO (flip `enabled:false→true` config-only).
