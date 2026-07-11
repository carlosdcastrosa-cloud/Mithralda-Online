# CAS-1988 — EVO: Modo Boss Rush / Gauntlet (Cosecha del kit de 23 pilares)

**Owner:** CTO · **Estilo:** cosecha ($0 arte, reuso motor) · **Live base:** `c960c813843d`/799
**Precedente scaffolding:** ARENA DE OLEADAS (CAS-1664, `sim.js:745–914`, `config.js:832`, `persist.js:30/93`).

---

## 1. Qué es (design)

Un **modo finito, opt-in, de jefes encadenados**. El jugador entra desde el menú, pelea una
**secuencia ordenada de los jefes que YA existen** (dragón, tirano del pantano, golem del abismo,
Corazón de Magma…) espalda-con-espalda, con una **hoguera/refill entre rondas**, y termina la
gauntlet (o muere). Récord persistente = **mejor ronda alcanzada**. Recompensa de Esencia escalada
por ronda. El punto de diseño (CEO): **OBLIGA a usar todo el kit** — parry, backstab, poise, estus,
resinas, arrojadizos, artes de arma, summon — porque los refills entre rondas están para gastarse.

**Boss Rush ≠ Arena.** Arena = supervivencia infinita, trash aleatorio + jefe cada 5ª ola, score = ola.
Boss Rush = **roster ordenado FINITO, 100% jefes, sin trash**, checkpoint hoguera entre rondas,
récord = ronda. Reusa el *scaffolding* de Arena (RNG dedicado, gate de modo, store aislado, loop de
tick), pero es un **controlador PARALELO e independiente** — no toca una sola línea del código de Arena.

**Lente Blast radius / YAGNI:** modo nuevo aislado tras `G.bossRushMode` + `BOSS_RUSH.enabled`.
Con `enabled:false` el modo es **inalcanzable** (menú no muestra la entrada, teclas inertes, tick
nunca corre) ⇒ el core loop, Arena y el ciclo APEX de zonas son **byte-idénticos a HEAD**.

---

## 2. Arquitectura — 5 blobs, RNG-neutral STRONG, save aislado

### Knob (config.js, tras SUMMON en :1648)
```js
// CAS-1988 — MODO BOSS RUSH / GAUNTLET. $0 arte, 100% reuso. 1 knob HARD-GATED.
// enabled:false ⇒ modo inalcanzable ⇒ byte-idéntico a HEAD (Arena/core/APEX intactos).
// Todo draw viene de bossRushRng dedicado (NUNCA srand). Récord en store propio mithralda.bossrush.v1.
export const BOSS_RUSH = {
  enabled: false,                 // GATE CEO decide el flip live (mirror SUMMON CAS-1979→1980)
  key: "KeyB",                    // entrada por teclado en menú (mirror KeyA=Arena input.js:93); KeyB libre
  // Secuencia ORDENADA de jefes (claves de HUNTS[zone].boss). Escalada → finale = Corazón de Magma.
  // EXCLUYE 'frost' (boss final:true ⇒ dispararía pantalla de victoria) y 'trial' (world-boss opcional).
  sequence: ["caves", "swamp", "abyss", "caldera"],   // 4 rondas TUNABLE (CTO)
  hpStep: 0.10, dmgStep: 0.06,    // escala por índice de ronda r (0-based): mul = 1 + r*step
  restSeconds: 4,                 // respiro/hoguera entre rondas (mirror ARENA.restSeconds)
  healFrac: 1.0,                  // hoguera = cura COMPLETA entre rondas (checkpoint real; TUNABLE)
  refillOnRest: true,             // recarga TODO el kit consumible en el respiro (estus/arrojadizos/buffs/summon)
  essPerRound: 40, essStepRound: 12,  // Esencia garantizada por ronda limpiada = essPerRound + r*essStepRound (0 RNG)
  clearBonusEss: 250,             // bonus por COMPLETAR toda la gauntlet (0 RNG)
  recordEssBase: 15,              // milestone ronda-récord: ceil(recordEssBase * ronda) 1-vez/run (0 RNG)
};
```

### Store aislado (persist.js — mirror KEY_ARENA :30/93)
```js
const KEY_BOSSRUSH = "mithralda.bossrush.v1";
export function bootBossRush(){ loadBossRush(readBossRush()); G.bossRushDirty=false; }
// readBossRush/writeBossRush = wrappers try/catch como readArena; flush en el mismo unload de :202.
```
`serializeBossRush()` → `{ v:1, bestRound }` (aditivo; ausente ⇒ 0). Nunca toca `save.v1`.
Leer el store NO afecta la byte-identidad de `save.v1` (llave distinta) ⇒ RNG-neutral se mantiene.

### RNG dedicado
`bossRushRng` (mirror `arenaRng`, `sim/rng.js`). El roster es una **secuencia fija** (0 draws para
elegir jefe); `bossRushRng` sólo se usa para el spawn-pos (ángulo/distancia), igual que Arena. Con
`enabled:false` no se instancia ningún draw ⇒ stream srand intacto.

---

## 3. SEAMs (todos gated por `BOSS_RUSH.enabled` / `G.bossRushMode`)

Controlador **paralelo** a Arena — NO reutiliza `tickArena`/`spawnWave` (secuenciación distinta), pero
sí puede reusar helpers puros (`arenaSpawnPos` patrón, `spawnEnemy`, refill fns). Estado en `G.bossRush`
(mirror `G.arena`).

| # | Seam | Archivo:línea (ancla) | Acción |
|---|------|----------------------|--------|
| S1 | Entrada createHero | `sim.js:743` (tras `if(G.pendingArena)…`) | `if(G.pendingBossRush){ G.pendingBossRush=false; G.bossRushMode=true; startBossRush(); }` |
| S2 | `startBossRush()` | nuevo, mirror `startArena()` :848 | limpia campo, `BR.round=0`, snapshot `recordBaseline`, `spawnRound(0)`, `G.scene="play"` |
| S3 | `spawnRound(r)` | nuevo, mirror `arenaSpawnBoss()` :791 | clear remanentes; jefe = `HUNTS[BOSS_RUSH.sequence[r]].boss` escalado por `1+r*step`; tag `e.bossRush=true`, `e.isBoss=true` (NO champion ⇒ rama loot de jefe, NUNCA onChampionKill/victory) |
| S4 | `onRoundCleared()` | nuevo, mirror `onWaveCleared()` :860 | banca Esencia (arith 0-RNG); si `r === sequence.length-1` ⇒ `gauntletComplete()`; si no ⇒ **hoguera**: `healFrac`+`refillOnRest`(estus/arrojadizos/buffs/summon), telegraph próximo jefe, entra REST |
| S5 | `tickBossRush(dt)` | nuevo, mirror `tickArena()` :892 | REST countdown → `spawnRound(++round)`; si no, detecta 0 vivos `bossRush` → `onRoundCleared()` |
| S6 | update() hook | `sim.js:3968` (junto a `tickArena`) | `if(G.bossRushMode) tickBossRush(dt);` |
| S7 | muerte | `sim.js:3285` (junto a `arenaOnDeath`) | `if(G.bossRushMode) bossRushOnDeath();` → persiste `bestRound` si supera récord |
| S8 | reset run | `sim.js:1600` (junto a `G.arenaMode=false`) | `G.bossRushMode=false; G.pendingBossRush=false;` en run reanudado |
| S9 | supresión zona | `sim.js:3851/3857/3861` | añadir `!G.bossRushMode` a las guardas de ambush/curse/zone-events (igual que Arena) para no contaminar la gauntlet |
| S10 | menú (render) | `render.js:3847` (tras entrada Arena) | 3ª entrada canvas "Modo Boss Rush" + región `menuBossRushHit`; muestra `bestRound` |
| S11 | menú (input) | `input.js:93` + `input.js:316` | `KeyB` y click en región → `G.pendingBossRush=true; startGame()` |
| S12 | HUD overlay | `render.js:297` + `:3817` | overlay "Ronda r/N + mejor" (mirror `renderArenaOverlay`) mientras `G.bossRushMode` |
| S13 | boot store | `game.js:116` (junto a `bootArena`) + `persist.js` | `persist.bootBossRush()` |

### Riesgo de composición #1 — SIGNATURE_BOSS en la ronda caldera
La ronda final spawnea `calderatyrant` con `e.zone="caldera"`. **Verificar** si el gating de
`SIGNATURE_BOSS` (enabled:true live) se dispara en Boss Rush y **cómo compone**:
- Deseable: la pelea de firma (2 fases + vuln window) COMO finale de la gauntlet = payoff perfecto.
- Riesgo: doble disparo de recompensa (SIGNATURE_BOSS.rewards + Boss Rush clearBonus) o del gating de
  zona. **AC del Build:** o (a) la ronda caldera hereda las fases de firma limpiamente sin doble-reward,
  o (b) el Build documenta que las fases NO se disparan en Boss Rush y por qué. Decisión del GE, documentada.

### Riesgo de composición #2 — killEnemy loot branch
`spawnRound` DEBE taggear el jefe como `e.isBoss=true` + `e.bossRush=true` y **NO** `e.champion`
(cuyo `onChampionKill` necesita una hunt-zone y podría gatillar clear/victory). Mirror EXACTO de
`arenaSpawnBoss` :803 (`e.isBoss=true; e.arena=true`) sustituyendo `arena→bossRush`.

---

## 4. Fin de gauntlet
`gauntletComplete()`: banca `clearBonusEss`, marca `bestRound=sequence.length` si supera récord,
toast de victoria del modo, y **vuelve al menú** (`G.scene="menu"` o pantalla recap del modo) —
**NUNCA** la pantalla `victory` del mundo (esa es sólo para `final:true`). Reusa el recap/HUD existente.

---

## 5. RNG-neutral / byte-identidad (AC crítico)
- `enabled:false` ⇒ menú no muestra entrada, `KeyB` inerte, `tickBossRush` nunca llamado, 0 draws
  `bossRushRng`, 0 draws srand ⇒ **build byte-idéntico a HEAD** salvo el código muerto (mismo patrón
  SUMMON/ARENA: funciones existen, jamás se ejecutan).
- Store `mithralda.bossrush.v1` aislado ⇒ `save.v1` byte-idéntico.
- Con `enabled:true` + modo ACTIVO, todo draw sale de `bossRushRng`; el srand del adventure normal
  jamás se toca (el modo es una sesión separada) ⇒ un run de aventura sigue byte-idéntico.

## 6. Deploy — 5 blobs
`config.js` + `sim.js` + `render.js` + `input.js` + **`persist.js`** (store nuevo). El set REAL lo
determina `git diff --stat <pre-build> HEAD`. Herramienta `tools/cas1988-deploy.mjs` = clon de
`cas1954-deploy.mjs` con `OVERLAY` extendido a los 5 (persist.js es root-served, no `sim/`).

## 7. Definition of Done
- **Build:** los 13 seams cableados, harness `tools/cas1988-bossrush.mjs` PASS×2 byte-id cubriendo
  AC0–ACn (ver abajo), `node --check` de los 5 blobs, riesgo #1 documentado.
- **Deploy:** overlay live, `md5 served==HEAD` por-blob, `version.json` flip, 0-leak.
- **QA:** PASS×2 OBSERVABLE en loop `update()` real (arma `enabled=true` en runtime como SUMMON QA):
  entra modo → jefe ronda 0 vive+pelea → muere → hoguera cura+refill → ronda 1 spawnea el SIGUIENTE
  jefe de la secuencia → récord persiste → completar gauntlet vuelve al menú (no victory de mundo).
  Compone con los 23 pilares sin regresión; `enabled:false` byte-id vs HEAD.
- **Gate CEO:** GO/no-go del flip `enabled:false→true`.

### Acceptance criteria (para el harness)
- **AC0** knob presente, `enabled:false` default, `sequence` no vacía, sin `frost`/`trial`.
- **AC1 [RNG-STRONG]** `enabled:false` ⇒ 0 draws srand + save.v1 byte-id vs HEAD (2 corridas diff-idéntico).
- **AC2** entrada: `pendingBossRush` ⇒ `bossRushMode=true` + ronda 0 spawnea `sequence[0]` boss.
- **AC3** secuencia ORDENADA: al limpiar ronda r, ronda r+1 spawnea `sequence[r+1]` (no aleatorio).
- **AC4** hoguera entre rondas: HP sube por `healFrac` + cargas (estus/arrojadizos/buffs/summon) a tope.
- **AC5** escala: HP/dmg del jefe de ronda r = base × `1+r*step` (readout determinista).
- **AC6** recompensa: Esencia por ronda = `essPerRound + r*essStepRound` (arith, 0 RNG); clearBonus al completar.
- **AC7** récord: `bestRound` persiste en store propio; milestone 1-vez/run; `save.v1` intacto.
- **AC8** fin: completar `sequence` ⇒ vuelve al menú, NUNCA `G.scene="victory"` del mundo.
- **AC9** aislamiento: ambush/curse/zone-events suprimidos en `bossRushMode` (mirror Arena).
- **AC10** composición: el jefe conserva su AI (special/enrage/carapace); riesgo #1 (SIGNATURE_BOSS) resuelto+documentado.
- **AC11** determinismo: RNG ON==OFF a bonus 0; desktop==mobile.

## 8. Cadena
Build (GE, todo) → Deploy (CTO, blocked) → QA (blocked) → Gate CEO (blocked). Umbrella = CAS-1988.
