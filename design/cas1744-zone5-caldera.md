# CAS-1744 — 5ª zona de endgame: **Caldera de Cenizas** (+ jefe + 2 mobs + modificador)

Owner: CTO (arquitectura + decomposición) · Build: Game Engineer · Arte: Art Director · QA · Gate: CEO
Canonical spec. Build/Art/QA construyen desde aquí.

## Decisión de arquitectura

**La 5ª zona es una zona de endgame GATED por portal, siguiendo el patrón `abyss`/`frost`/`trial`
(NO una 5ª zona de CONQUISTA).**

- **Lente Blast radius / Reversibility:** añadir a `CONQUEST_ZONES` alargaría el ciclo APEX de 4→5,
  perturbando el loop World Tier (CAS-450) y las partidas a mitad de ciclo. Es una puerta de una sola
  dirección sobre un sistema load-bearing. En cambio, un bioma gated paralelo a `abyss` es 100% aditivo:
  no toca `CONQUEST_ZONES`, no cambia APEX, no invalida saves.
- **Integración World Tier (CAS-450):** el escalado `WORLD_TIER` (hp/dmg/affix por tier) y `applyZoneScale`
  aplican a TODA zona vía `ZONE_TIER`, así que la Caldera queda integrada en la progresión sin tocar el ciclo.
- Se coloca en la escalera de poder **entre `abyss` y `frost`** (`CALDERA_POWER_REQ` ≈ justo por encima de
  `ABYSS_POWER_REQ`, por debajo de `FROST_POWER_REQ`) → nuevo objetivo de grind de media-endgame con jefe
  de botín garantizado épico+. No toca la finale (`frost` = STAGE1_GOAL) ni el world-boss (`trial`).

Tema: **volcánico** — suelo de basalto/magma, paleta ceniza+brasa. Distinto del hielo (`frost`) y el vacío
(`abyss`); encaja con arte procedural $0.

## Contratos por sistema (todo aditivo, todo tras el knob `ZONE5`)

### 1. Knob de feature — `sim/config.js`
```js
export const ZONE5 = { enabled:true, zone:"caldera", bonusLootRate:0.10 };
```
Con `enabled:false` el juego debe ser **byte-idéntico** (ver §RNG-neutral). Todo lo gated cuelga de este flag.

### 2. Zona — `ZONE_TIER` + `HUNTS` + `ZONE_LOOT` (`sim/config.js`, y ventana loot en `sim/gear.js`)
```js
// ZONE_TIER — tier 5 (banda de abyss), escalado por math puro
caldera: { tier:5, hpMul:2.80, dmgMul:1.90, spdMul:1.20, xpMul:2.80 },

// HUNTS.caldera — hunt walk-in con jefe capstone (patrón swamp/abyss)
caldera: { need:16, base:"emberkin", name:"<champion>", hpMul:9, dmgMul:2.0, sizeMul:1.6,
           tier:[4,4], minR:"epic", xp:250, gold:145,
           special:{ name:"...", every:3, windup:0.85, slam:{ count:12, spd:175, dmg:22, life:1.2 } },
           boss:{ base:"calderatyrant", sprite:"calderatyrant", name:"Corazón de Magma",
                  hp:1020, dmg:38, size:46, spd:52, knock:90, windup:0.95, recover:0.8,
                  enrageAt:0.5, enrageSpd:1.3, enrageWindup:0.72,
                  special:{ name:"Erupción de la Caldera", every:3, windup:1.0,
                            slam:{ count:14, spd:180, dmg:24, life:1.2 } },
                  tier:[4,4], minR:"epic", xp:340, gold:190 } },
```
`ZONE_LOOT.caldera` = ventana tier [4,4] (o alinea con abyss). **Payoff jefe (CAS-89): botín garantizado
épico+** — `minR:"epic"` en el bloque boss ya lo entrega vía `onChampionKill()`. Usa `ZONE5.bonusLootRate`
para el fan-out extra desde `zone5Rng` (ver §RNG).

### 3. Bioma + portal — `sim/world.js` (patrón `abyss`/`frost`/`trial`, gated por `ZONE5.enabled`)
- Rect de bioma `caldera` con suelo temático (paleta molten): **añade solo una entrada de paleta/color al
  path de tiles existente, NO nuevo código de render de tiles** (sigue cómo `swamp` (CAS-441) añadió su suelo
  y cómo `frost` usa su tinte; reusa `T_*`/palette, no branches nuevos de dibujo).
- `spawners.push({ rect:caldera, types:["emberkin","magmabrute", ...trash de relleno], max, cool, zone:"caldera" })`.
- Portal de pueblo gated + retorno: `portals.push({ ...to:"caldera", kind:"down" })` + `{ to:"town", kind:"up" }`.
- **Todo el bloque `caldera` de world.js va dentro de `if(ZONE5.enabled){ ... }`** → con OFF, `terr/spawners/
  portals` quedan idénticos byte a byte al mundo actual. Exporta `caldera` en el return solo cuando aplique.

### 4. Gate de portal — `sim/sim.js usePortal` (patrón `ABYSS_POWER_REQ`)
```js
export const CALDERA_POWER_REQ = /* entre ABYSS_POWER_REQ y FROST_POWER_REQ */;
// en usePortal: if(to==="caldera" && pw<CALDERA_POWER_REQ){ toast(STR.calderaLocked(...)); deny; return false; }
```
`STR.calderaLocked` en `strings.js`. Solo alcanzable con `ZONE5.enabled` (el portal no existe si OFF).

### 5. Mobs — `sim/config.js ETPL` + `render/sprites.js ENEMY_STRIPS` + arte
Dos mobs propios, `richAnim:true`, 8-dir animados (patrón CAS-1692/CAS-1699/CAS-1706):
- **`emberkin`** — "Cenizo": caster a distancia (`arch:"caster"`, `proj:"bolt"`, `kite`). Reusa una rama de
  combate existente. Si aplica DoT, **reusa un `infl` de status YA existente** (p.ej. estilo `poison` de
  `thornspitter`) — NO inventar un sistema de status nuevo.
- **`magmabrute`** — "Bruto de Magma": brute melee tanque (`arch:"brute"`, `aoe` knock, estilo `ironback`).

`ENEMY_STRIPS.emberkin` / `.magmabrute` (64×64) + `.calderatyrant` (96×96) con `idle/walk/attack1/attack2/
hurt/death` (patrón sprites.js existente). **Claves de sprite fijadas (contrato Art↔Build):**
`emberkin`, `magmabrute`, `calderatyrant`.

### 6. Modificador de zona — `sim/config.js ZONE_MODIFIERS` (patrón CAS-394, data-only, SIN RNG en la capa)
```js
{ id:"emberfury", glyph:"♨", name:"Furia de Brasas", desc:"Enemigos +30% daño, +10% velocidad",
  dmgMul:1.30, spdMul:1.10 },
```
**RNG-neutral crítico:** añadir una entrada a `ZONE_MODIFIERS` cambia el pool ofertado y por tanto la
secuencia RNG del draft de modificadores → NO byte-idéntico con la feature OFF. Por eso **`emberfury` solo
entra al pool cuando `ZONE5.enabled`** (o se restringe a aplicar solo en la zona `caldera`). Con OFF, el pool
de modificadores queda intacto.

## RNG-neutral (NO-NEGOCIABLE — AC-RNG-STRONG)
- Stream dedicado nuevo: `const zone5Rng = createRNG(0x<hex propio>)` en `sim/sim.js` (junto a `mobRng`/`runeRng`).
  Nunca se le hace `seed()`/srand-reset por la seed global. Cualquier tirada nueva de la Caldera (fan-out de
  botín bonus del jefe, etc.) sale de `zone5Rng`.
- Con `ZONE5.enabled:false`: (a) el bloque world.js no corre → mundo idéntico; (b) el portal/gate no existe;
  (c) `emberfury` no entra al pool → draft de modificadores idéntico; (d) `zone5Rng` = 0 draws;
  (e) spawner de caldera ausente → `srand` (loot/spawn/AI) **byte-idéntico**. Entradas estáticas de
  `ZONE_TIER`/`HUNTS`/`ETPL` sin referenciar NO alteran RNG (son solo datos).
- **Verificación:** probe que compara la secuencia `srand` (≥60 draws) y el mundo generado con `ZONE5.enabled`
  ON vs OFF → OFF idéntico al build actual.

## Saves — aditivo (NO-NEGOCIABLE)
- Ningún save existente se invalida. Si se persiste estado de la Caldera (p.ej. jefe abatido), va en un campo
  **namespaced + versionado**, ausente en saves viejos ⇒ default. **NO** meter el jefe caldera en
  `cq.bossesDown` (eso es exclusivo de las 4 zonas de conquista → rompería el conteo APEX).

## Definition of Done / criterios de aceptación (para QA — LIVE PASS×2 + `md5 live==HEAD`)
- **AC1 [RNG-STRONG]:** `ZONE5.enabled=false` ⇒ juego byte-idéntico (srand ≥60 draws igual, `zone5Rng` 0 draws,
  pool de modificadores igual, worldgen idéntico).
- **AC2 [Zona alcanzable]:** con ON, portal de pueblo gated a Caldera; por debajo de REQ ⇒ toast locked;
  por encima ⇒ warp a bioma Caldera (suelo molten), `zoneOf`→"caldera".
- **AC3 [Mobs]:** `emberkin` + `magmabrute` spawnean en Caldera, 8-dir animados (idle→walk→attack), arte
  FOUNTAINS distinto, `served-PNG md5==HEAD`.
- **AC4 [Jefe + payoff]:** hunt de Caldera completa ⇒ jefe `Corazón de Magma`; matarlo ⇒ botín garantizado
  **épico+** (CAS-89); fase enrage @50% + slam radial funcionan.
- **AC5 [Modificador]:** `emberfury` aplica mults en Caldera; data-only, sin RNG; ausente del pool con OFF.
- **AC6 [Save aditivo]:** save viejo carga sin bump de versión; estado nuevo namespaced.
- **AC7 [Perf]:** 60fps desktop+móvil, 0 crashes.

## Cadena de entrega (patrón de la casa)
Arte (AD) → Build (GE, blockedBy Arte) → Deploy gh-pages (CTO, blockedBy Build) → QA LIVE ×2 (QA, blockedBy
Deploy) → Gate CEO (blockedBy QA). URL canónica: `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/`.
