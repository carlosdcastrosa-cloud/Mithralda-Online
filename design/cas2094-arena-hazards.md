# CAS-2094 — Peligros de Arena / Environmental Hazards (mecánica #32)

**Lane-1 Gameplay Evolution · DARK ship → Gate CEO → flip config-only** (mirror CAS-2043/2055/2075/2093)
Autor: Game Engineer · 2026-07-11

## 1. Objetivo y por qué es una mecánica NUEVA (0 dominada — lección audit CAS-2085)

El combate hoy es **100% enemy-centric**: leer al enemigo (telegrafía, parry, dodge, poise) es el único
eje. Esta mecánica añade una **segunda dimensión ortogonal — conciencia espacial del terreno**: durante
encuentros de **jefe/élite** aparecen **peligros de arena procedurales y TELEGRAFIADOS** (vent de magma,
suelo que colapsa, charco de veneno…) que **obligan a reposicionarse**. No se leen en el enemigo; se leen
en el suelo.

Por qué NO colisiona con mecánicas vivas:
- **NO es un pacto** (PACTS = risk/reward global por multiplicadores de stats; no tiene geometría espacial).
- **NO es una variante de enemigo** (ENCOUNTER_VARIANTS modula *stats de mob*; el hazard es terreno, sin mob).
- **NO es una habilidad de enemigo** (ENEMY_ABILITIES sale del propio mob y su telegrafía; el hazard es
  ambiental, agnóstico al mob, temático por **zona**).
- Eje de decisión propio: *dónde estoy parado*, no *qué está haciendo el enemigo*. Se COMPONE con dodge
  (i-frames del roll lo evitan), con status (reusa burn/poison), y con las peleas de jefe (presión posicional
  encima de la lectura del jefe) sin dominar ninguno — es **sal posicional**, no un segundo motor de daño.

## 2. Constraints DUROS (playbook EVO — cumplidos por construcción)

| Constraint | Cómo se cumple |
|---|---|
| **$0 arte** | Marcadores 100% procedurales: anillo pulsante de telegrafía (reusa estilo `telegraphmark` render.js:1728 / POI zone-event render.js:644) + relleno tintado durante la fase activa + glyph opcional (⚠) mirror del label de afijo render.js:1429. Cero sprites. |
| **RNG-neutral STRONG** | Selección/timing/posición draw SÓLO de un stream dedicado `arenaHazardRng` (mirror `enemyVariantRng` CAS-2071), sembrado por-spawn; NUNCA toca `srand` maestro. `enabled:false` ⇒ `maybeSpawnHazard` retorna en la 1ª línea ⇒ **0 draws en cualquier stream** ⇒ `G.hazards` vacío ⇒ `updateHazards` no-op ⇒ **byte-idéntico a HEAD**. Verificable: fingerprint del master srand ON==OFF==HEAD. |
| **Reusa daño/estado** | Daño al héroe vía `damageHero(cap, ang, null, null)` EXISTENTE (sim.js:5196) — `src=null` ⇒ ni espíritu/parry/escudo entran (esos exigen `src`), SÓLO i-frame/dodge evitan ⇒ el hazard es esquivable exclusivamente reposicionándose/rodando, coherente con "presión posicional". Status burn/poison/bleed/slow vía `applyStatus`/`statusOrBuildup` (CAS-1931 STATUS_BUILDUP) EXISTENTES. Sin path de daño nuevo, sin save nuevo, sin AI nueva. |
| **i-frames del roll** | `damageHero` ya sale temprano si `h.iframe>0` (sim.js:5228). El roll da i-frames ⇒ rodar a tiempo a través del hazard lo evade **gratis, sin código nuevo**. Es la HEADLINE observable. |
| **Cap anti-degenerado** | Daño por tick CAPEADO (`min(dmgFlat, hero.maxHp*dmgFracCap)`), `maxActive` hazards simultáneos, espaciado mínimo entre hazards y respecto al héroe (nunca spawnea encima), telegrafía ≥ `telegraphMs` amplia (siempre hay tiempo de salir). Matemática en §6 ⇒ **imposible one-shot, imposible loop degenerado**. |
| **CERO hotkeys nuevos** | El jugador sólo se mueve/rueda (teclas ya existentes). Ningún binding nuevo (lección Summon KeyN / KeyC scene-scoped). |
| **60fps desktop+móvil** | `G.hazards` es un array transitorio pequeño (≤ `maxActive`, ~2-3). Tick O(n_hazards) sin alloc por-frame (mirror `updateFields`). Render O(n_hazards) con primitivas de canvas ya usadas. Móvil jugable. |

## 3. Seams EXACTOS

### 3.1 Config — `sim/config.js`
Nuevo knob `ARENA_HAZARDS` (bloque nuevo, mirror del comentario-contrato de `ENCOUNTER_VARIANTS` config.js:1753):

```js
export const ARENA_HAZARDS = {
  enabled: false,                 // DARK ship; Gate CEO flippea live (config-only, reversible, mirror CAS-2043/2055/2075/2093)
  rngSeed: 0x0a2ea094,            // stream dedicado arenaHazardRng; NUNCA consume del master srand
  spawnGate: { bossOrElite:true },// SÓLO spawnea si hay jefe/élite/campeón/signature vivo en G.enemies
  cadenceMs: 3200,                // cada cuánto se intenta plantar un hazard mientras el gate se cumple
  maxActive: 2,                   // tope simultáneo (anti-saturación / anti-trap)
  telegraphMs: 950,              // ventana de aviso ANTES de que dañe (siempre esquivable con roll/reposición)
  activeMs: 1600,                 // ventana activa que daña
  fadeMs: 300,                    // desvanecido presentacional (0 daño)
  tickMs: 350,                    // clock de daño mientras el héroe está dentro y sin i-frames
  dmgFlat: 6,                     // daño base por tick (CAPEADO)
  dmgFracCap: 0.06,              // tope duro: daño/tick ≤ hero.maxHp*0.06 (nunca one-shot; §6)
  radius: 42,                     // radio del hazard (px); bounded
  minGapPx: 64,                   // separación mínima entre hazards y respecto al héroe al plantar
  markerLabel: true,             // glyph procedural ⚠ (mirror affix render.js:1429); false ⇒ sólo tint/anillo
  byZone: {                       // tipos temáticos por zona (uno del pool se elige por arenaHazardRng)
    caldera: ["magma"], abyss: ["magma","void"], caves: ["collapse"],
    ruins:   ["collapse"], swamp: ["poison"], forest: ["bramble"], frost: ["ice"],
  },
  types: {                        // cada tipo reusa un STATUS existente + un color de tint; SIN daño nuevo
    magma:    { status:"burn",   statusDmg:3, tint:"#ff6a2a", glyph:"♨" },
    poison:   { status:"poison", statusDmg:3, tint:"#8fd14a", glyph:"☣" },
    bramble:  { status:"bleed",  statusDmg:2, tint:"#c58a4a", glyph:"✷" },
    collapse: { status:null,     statusDmg:0, tint:"#8a8a96", glyph:"▩", brief:true }, // sólo daño físico capeado, ventana corta
    ice:      { status:"slow",   statusDmg:0, tint:"#8fd0ff", glyph:"❄" },
    void:     { status:null,     statusDmg:0, tint:"#b070e0", glyph:"◈" },
  },
};
```
Contrato del comentario (mirror ENCOUNTER_VARIANTS): documentar que `enabled:false` ⇒ 0 draws ⇒ byte-id;
que `arenaHazardRng` es un stream distinto de todos los de sim.js:42–128; que el flip es config-only reversible.

### 3.2 Estado transitorio — `sim/sim.js`
- `G.hazards: []` añadido a la decl de estado (sim.js:185, junto a `fields:[]`). **Transitorio, NUNCA serializado**
  (mirror `G.fields`: no aparece en save/load; ver persist.js).
- Limpiado en TODAS las rutas donde `G.fields.length=0` (sim.js:824, 951, 1095, 2007, 4565, 5785) + `resetZoneEvents`-adjacentes. Un helper `clearHazards()` para no olvidar ninguna.
- Timer de cadencia `G.hazardT` (contador ms) en el mismo bloque de estado; reset en beginRun.

### 3.3 Stream RNG dedicado — `sim/sim.js`
Mirror exacto de `enemyVariantRng` (sim.js:136):
```js
const arenaHazardRng = createRNG(0x0a2ea094); // stream dedicado; maybeSpawnHazard lo re-siembra por-spawn; NUNCA srand maestro
```
Sembrado por-spawn desde `(hazardSpawnCounter, Math.round(h.x), Math.round(h.y), zoneHash)` con la misma
mezcla que maybeVariant (sim.js:2302): `seed = (rngSeed ^ counter*0x9e3779b9 ^ hx*374761393 ^ hy*668265263)>>>0`.
`seed()` re-siembra sólo este stream. Gate + pick de tipo + jitter de posición draw de aquí.

### 3.4 Spawn — `maybeSpawnHazard(dt)` en `sim/sim.js`
Llamado desde `update(dtMs)` (sim.js:4360) SÓLO en `scene==="play"` (y arena/boss-rush si aplica), junto a `updateEnemies`/`updateFields`:
```
function maybeSpawnHazard(dt){
  if(!ARENA_HAZARDS.enabled) return;                       // 1ª línea ⇒ OFF = 0 draws, 0 hazards ⇒ byte-id HEAD
  const h=G.hero; if(!h||h.dead) return;
  if(!bossOrElitePresent()) { G.hazardT=0; return; }       // gate: sólo con jefe/élite/campeón/signature vivo
  G.hazardT+=dt*1000;
  if(G.hazardT < ARENA_HAZARDS.cadenceMs) return;
  G.hazardT=0;
  if(G.hazards.length >= ARENA_HAZARDS.maxActive) return;
  // sembrar arenaHazardRng por-spawn (counter+hero pos+zone), elegir tipo del pool byZone[zone],
  // elegir posición telegrafiada: cerca del héroe pero con offset ≥ minGapPx (NUNCA encima), dentro de bounds,
  // separada ≥ minGapPx de otros hazards. Push {x,y,r,type,phase:"telegraph",t:0, ...} a G.hazards.
}
```
`bossOrElitePresent()` = `G.enemies.some(e=>!e.dead && (e.isBoss||e.elite||e.champion||e.champElite||e._sbPhase))`.
Con el gate incumplido: `G.hazardT=0` y return ⇒ 0 draws (barato, sin RNG). Los draws SÓLO ocurren al plantar.

### 3.5 Tick — `updateHazards(dt)` en `sim/sim.js`
Mirror de `updateFields` (sim.js:3605). Máquina de estados por hazard:
- `telegraph` (dura `telegraphMs`): sin daño; sólo avanza el reloj de aviso.
- `active` (dura `activeMs`): cada `tickMs`, si `dist(h,hz) ≤ hz.r+heroSize`:
  ```
  const cap = Math.min(ARENA_HAZARDS.dmgFlat, Math.floor(h.maxHp*ARENA_HAZARDS.dmgFracCap));
  const ang = Math.atan2(h.y-hz.y, h.x-hz.x);
  const landed = damageHero(Math.max(1,cap), ang, null, null);   // i-frame/dodge del roll ya lo evade dentro de damageHero
  if(landed && hz.def.status) statusOrBuildup(h, hz.def.status, {dmg:hz.def.statusDmg}, true); // reusa CAS-1931/CAS-118
  ```
  (Build confirma la firma exacta de `statusOrBuildup`/`applyStatus` para el héroe; si `statusOrBuildup` es
  enemy-only, se usa `applyStatus(h, status, {dmg,dur})` directo — ambos son paths EXISTENTES.)
- `fade` (`fadeMs`): 0 daño, sólo presentación. Luego expira (filter, mirror `G.fields=G.fields.filter`).
Sin alloc por-frame; 0 draws (todo el RNG se gastó en el spawn). NUNCA daña durante `telegraph` (justicia de la ventana).

### 3.6 Render — `render/render.js`
Dibujar `G.hazards` en el pase de mundo y-sorted (junto a fields/POIs zone-event render.js:644), 100% procedural:
- `telegraph`: anillo pulsante + relleno translúcido creciente del `tint` (reusa el estilo de `telegraphmark`
  render.js:1728: `k=` fracción restante ⇒ el aviso se intensifica hacia el instante activo). Glyph ⚠/type.glyph
  centrado (mirror label afijo render.js:1429) si `markerLabel`.
- `active`: relleno tintado sólido-translúcido + borde; pulso rápido para leer "esto duele AHORA".
- `fade`: alpha decae a 0.
Presentación pura, sim.js intacto (mirror del contrato de los telegraph fx). `ctx.arc`/`fillRect`/alpha ya usados.

## 4. Composición con mecánicas vivas (0 dominada)
- **Dodge (roll i-frames)**: rodar a través del hazard activo lo evade (damageHero respeta `h.iframe`). El hazard
  *aumenta* el valor del dodge sin reemplazarlo — sigue habiendo que leer al jefe.
- **Status (STATUS_BUILDUP CAS-1931)**: magma/poison/bramble alimentan el medidor/aplican DoT del héroe por el
  path existente; no un canal nuevo. Cap bajo ⇒ es presión, no burst.
- **Peleas de jefe (SIGNATURE_BOSS / ARENA / élite)**: el hazard es *encima* de la pelea, no la reemplaza —
  gate `bossOrElitePresent` garantiza que sólo aparece cuando ya hay una lectura de jefe activa.
- **PACTS**: ortogonal; un pacto podría (futuro increment) escalar `cadenceMs`/`dmg`, pero NO en este build.

## 5. RNG-neutralidad (prueba)
`enabled:false` (DARK): `maybeSpawnHazard` retorna en la línea 1 ⇒ jamás siembra ni consume `arenaHazardRng`;
`G.hazards` permanece `[]` ⇒ `updateHazards` itera vacío ⇒ 0 efectos; render itera vacío. El master `srand`
recibe **exactamente 0 draws extra** ⇒ fingerprint del stream maestro **idéntico a HEAD** para cualquier semilla.
Incluso `enabled:true`, todo el azar del hazard sale de `arenaHazardRng` (stream propio) ⇒ `srand ON==OFF`.
Verificación QA: `variantSrandProbe`-style — comparar N draws del master srand con hazards ON vs OFF vs HEAD.

## 6. Cap anti-degenerado (matemática)
- Daño/tick ≤ `min(6, maxHp*0.06)`. Con `tickMs=350`, dps máximo parado dentro ≈ `6/0.35 ≈ 17/s`, ≤ `maxHp*0.17/s`.
- `telegraphMs=950` ⇒ SIEMPRE hay ~1s de aviso antes del 1er tick ⇒ un jugador reactivo nunca recibe daño; uno
  parado recibe daño *sostenible* (nunca one-shot: un solo tick ≤ 6% vida).
- `maxActive=2` + `minGapPx=64` (entre hazards y respecto al héroe) ⇒ imposible acorralar/trap ⇒ siempre hay
  espacio libre para reposicionarse ⇒ **0 loops degenerados** (exigencia audit CAS-2085).
- `collapse`/`ice`/`void` sin DoT (o slow suave) ⇒ variedad sin apilar canales de daño.
- Todos los valores son TUNABLES por el CEO en el flip; el diseño no introduce riesgo de balance ⇒ **no requiere
  escalar a CEO antes de construir** (el cap es estructural, no numérico).

## 7. Save/perf/deploy
- **Save-neutral**: `G.hazards`/`G.hazardT` transitorios; NO se serializan (no tocan `mithralda.save.v1` ni un store nuevo).
- **Perf**: ≤ `maxActive` hazards; tick/render O(n) sin alloc; 60fps desktop+móvil.
- **Deploy**: overlay gh-pages de los blobs que cambian bytes — previsiblemente `sim/config.js`, `sim/sim.js`,
  `render/render.js` (mirror CAS-2073/2081: 3 blobs). Confirmar con `git diff` en el Build. `input.js`/`strings.js`/
  `settings.js`/`persist.js` **sin tocar**. URL fija preservada.

## 8. Cadena de decomposición (hijos con parentId a CAS-2094)
1. **Build DARK** (GE) — implementa §3, knob `enabled:false`, harness `cas2094-arena-hazards.mjs` PASS×2 (AC byte-id OFF, spawn/gate/telegraph/damage/i-frame-evade con enabled forzado en dev, RNG-neutral fingerprint).
2. **Deploy** (CTO) — overlay 3-blob a gh-pages, served md5==HEAD, 0-leak, `enabled:false` byte-correcto, URL fija. blockedBy Build.
3. **QA OBSERVABLE** (QA) — PASS×2 desktop+móvil driving el loop real: con enabled:true durante jefe aparece hazard telegrafiado; héroe parado recibe daño/status capeado, héroe que rueda a tiempo lo evita (screenshots); ON==OFF byte-id; 0 regresión 31 mec; 60fps. blockedBy Deploy.
4. **Gate CEO** (e77e7f98) — verifica live + flip config-only `enabled:false→true` (mirror CAS-2043/2055/2075/2093). blockedBy QA.
