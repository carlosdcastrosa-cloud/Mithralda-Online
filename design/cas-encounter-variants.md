# CAS-2071 — EVO: Variedad de Encuentros (variantes de comportamiento enemigo)

**Owner:** CTO (umbrella). Chain: Build (GE) → Deploy (CTO) → QA (PASS×2 observable) → Gate CEO (GO/NO-GO live).
**Fork-neutral / $0 arte.** No pre-empta la dirección mayor del board (CAS-1986).

## Tesis (Prime-Directive lane #1)
El motor de combate ya paga 23 pilares Souls-like (telegrafía, poise, ENEMY_ABILITIES, backstab,
STATUS_BUILDUP…), pero el **roster de comportamientos** es fijo ⇒ el jugador repite los mismos
encuentros. El multiplicador de diversión más barato disponible es **exprimir contenido de sistemas
ya construidos**: variantes que reusan sprites + stats/telegrafía existentes y obligan a usar el kit
de forma distinta. No es scope nuevo — es contenido derivado a **$0 arte**.

## Guardarraíles (idénticos a EVOs previas — NO negociables)
- **$0 arte.** La variante se distingue por MOVESET/telegrafía/stats + un **marcador procedural**
  (tint/glyph/label), reusando EXACTAMENTE el patrón de affix élite (`drawEnemy` render.js:1103,
  halo/tint render.js:1167–1177, label sobre barra HP render.js:1429). Cero sprites nuevos.
- **OFF ⇒ byte-idéntico al baseline.** `ENCOUNTER_VARIANTS.enabled=false` DARK ship; el Gate CEO
  flippea live (mirror CAS-2043/2055).
- **srand ON==OFF byte-idéntico** vía stream dedicado `enemyVariantRng = createRNG(0x…)` (patrón
  sim.js:42–99, p.ej. `mobRng 0x4d0b7e15`). El nuevo stream **NUNCA** consume del master `srand`.
  OFF ⇒ la función de asignación retorna antes de cualquier draw ⇒ 0 consumo en cualquier stream.
- **Clone-not-mutate.** La variante hornea sobre un CLONE del `e.tpl` (mirror `applyZoneScale`
  sim.js:2063, `curseMods` :2071), nunca sobre la fila `ETPL` compartida.
- **Sin AI nueva, sin save nuevo.** Sólo modula knobs que el sim ya lee (windup/spd/hp/lunge/poiseMax).
  Sin estado serializado ⇒ ausencia de save = byte-id. 60fps. Móvil jugable. 0 regresión sobre las
  29 mecánicas vivas.

## Variantes elegidas (CTO pick — mayor impacto / menor riesgo)
3 variantes, cada una = un GANCHO distinto que rompe el "trade genérico" y premia una herramienta
concreta del kit. **Todas son modulaciones puras de stats sobre el clone del tpl** (0 AI nueva,
0 nuevo path de daño) ⇒ blast radius mínimo.

### 1. Acechador (Aggressor / Stunner) — premia parry/dodge preciso
- **Gancho:** telegrafía más corta + lunge más largo/rápido ⇒ la ventana de reacción se estrecha,
  el jugador DEBE leer el windup y hacer parry/dodge en el timing exacto en vez de tankear.
- **Seams reusados:** `tpl.windup` (↓, con **piso** para no ser injusto), `tpl.lunge` (↑),
  TELEGRAPH `leadMs` ya pinta el aviso. Sólo son números en el clone.
- **Config (ejemplo):** `{ id:"stalker", windupMul:0.7, windupFloor:0.28, lungeMul:1.35, dmgMul:0.9 }`
- **Riesgo:** BAJO. Único cuidado = `windupFloor` para que el aviso siga siendo parryable (QA lo mide).

### 2. Bastión (Armored / Poise-tank) — premia combos + rotura de postura + finisher
- **Gancho:** `poiseMax` alto ⇒ no se le interrumpe con golpes sueltos; el jugador DEBE encadenar
  combo/pesado para romper postura y castigar en la ventana `staggerT`. Reusa el sistema POISE entero.
- **Seams reusados:** ceiling de poise resuelto en `poiseCeil` sim.js:2041–2049 (leer un
  `e.variantPoiseMul` ahí, mirror del `ngPoiseMul()`), `tpl.hp`↑, `tpl.spd`↓.
- **Config (ejemplo):** `{ id:"bastion", poiseMaxMul:1.8, hpMul:1.25, spdMul:0.85, dmgMul:1.0 }`
- **Riesgo:** BAJO. La ventana `staggerT` (POISE.elite.dur) ya existe ⇒ el castigo es legible.

### 3. Enjambre-frágil (Glass) — premia AoE / arcos anchos / arrojadizos
- **Gancho:** HP muy bajo + veloz ⇒ muere de un arco ancho o un throwable pero castiga si lo ignoras;
  premia el swing-de-área sobre el pinchazo 1-a-1. Reusa `tpl.hp`/`tpl.spd`.
- **Seams reusados:** SÓLO stats sobre el clone. **NO** añade cuerpos extra (cuerpos extra ⇒ draws
  extra ⇒ rompe RNG-neutral). El "enjambre" emerge de que los spawners ya sueltan grupos; la variante
  sólo los hace glass+veloz.
- **Config (ejemplo):** `{ id:"glass", hpMul:0.55, spdMul:1.3, dmgMul:0.85 }`
- **Riesgo:** BAJO-MEDIO. Veloz+frágil puede acumularse; `dmgMul`↓ lo compensa (QA verifica no-spike).

### Considerada y DIFERIDA — Aflictor (status al héroe)
`STATUS_BUILDUP` hoy fluye **héroe→enemigo** (sim.js:3471+). Un enemigo que aplique bleed/poison/frost
al héroe requiere un **path de daño NUEVO** (enemigo→héroe), no una modulación de stats ⇒ blast radius
mayor y contrato de UI nuevo (barras de status del héroe). **Fuera de scope de este EVO** por
YAGNI/blast-radius; candidato a su propio ticket si el board lo pide.

## Asignación (determinista, fork-neutral)
- Función nueva `maybeVariant(e)` llamada **inmediatamente después** de `maybeAffix(e)` en el caller
  de spawn natural (sim.js loop de `world.spawners`), gateada 100% por `ENCOUNTER_VARIANTS.enabled`.
- Selección **determinista** por `enemyVariantRng`: seed derivada de `(spawner.index, e.x, e.y)` para
  que el reparto sea estable y reproducible; una `chancePerZone` deja que sigan apareciendo mobs base
  (la variante es sal, no reemplazo total).
- Excluye lo mismo que `maybeAffix`: bosses / campeones / élites de emboscada / neutrales / supports
  0-dmg / `arch==="volatile"`. No apila con affix élite en el mismo cuerpo (elige uno) para mantener
  legibilidad y evitar interacción combinatoria.
- **OFF ⇒ `maybeVariant` retorna en la 1ª línea ⇒ 0 draws ⇒ spawns byte-idénticos a HEAD.**

## Knob (config.js — mirror BOSS_RUSH/NG_PLUS)
```js
export const ENCOUNTER_VARIANTS = {
  enabled: false,                 // DARK ship; Gate CEO flippea live (config-only, reversible)
  rngSeed: 0x0EC0_VA21,           // stream dedicado; nunca consume del master srand
  chancePerZone: { forest:0.30, caves:0.30, swamp:0.30, abyss:0.25 }, // TUNABLE; ausente ⇒ 0
  markerLabel: true,              // label procedural sobre barra HP (mirror affix render.js:1429)
  variants: {
    stalker: { windupMul:0.70, windupFloor:0.28, lungeMul:1.35, dmgMul:0.90, tint:"#ff8a3d" },
    bastion: { poiseMaxMul:1.80, hpMul:1.25, spdMul:0.85, dmgMul:1.00, tint:"#9aa7c7" },
    glass:   { hpMul:0.55, spdMul:1.30, dmgMul:0.85, tint:"#7bd14a" },
  },
  byZone: {                       // qué variantes son elegibles por zona (variedad temática)
    forest: ["stalker","glass"],
    caves:  ["bastion","stalker"],
    swamp:  ["glass","bastion"],
    abyss:  ["bastion","stalker","glass"],
  },
};
```
Comportamiento en `sim.js` (`maybeVariant` + lectura de `variantPoiseMul` en `poiseCeil`), marcador
en `render.js` (reusa el path de tint/label de affix). Reversible por el knob `enabled`.

## Cadena de entrega
1. **Build (GE):** implementa `ENCOUNTER_VARIANTS` DARK + `maybeVariant` + `enemyVariantRng` +
   marcador render + harness node que prueba AC0–AC5 (abajo). AC: `enabled=false` byte-id HEAD ×2.
2. **Deploy (CTO):** overlay gh-pages DARK; served md5 == HEAD por blob; 0-leak; reversible.
3. **QA (PASS×2 observable):** conducir el sim loop REAL y demostrar que **cada variante EXHIBE su
   gancho contra el héroe** (windup más corto medible / poise no rompe con golpe suelto pero sí con
   combo / glass muere de 1 arco ancho) + regresión: las 29 mecánicas vivas no cambian + srand ON==OFF.
4. **Gate CEO:** verify indep served==HEAD + headline observable (variantes vivas y distintas) +
   0 regresión + reversible documentado ⇒ flip `enabled:false→true`.

## Criterios de aceptación (para el Build harness)
- **AC0 — OFF byte-id:** con `enabled=false`, fingerprint determinista de N spawns idéntico a HEAD ×2.
- **AC1 — RNG-neutral:** srand sequence tras M spawns idéntica ON vs OFF (variantRng nunca toca srand).
- **AC2 — Acechador:** windup efectivo < baseline (y ≥ `windupFloor`); lunge > baseline.
- **AC3 — Bastión:** un golpe LIGHT no rompe postura (poise < ceiling) pero un combo/pesado sí la
  rompe y abre `staggerT`; ceiling == round(base × poiseMaxMul).
- **AC4 — Enjambre:** hp efectivo == round(base × hpMul); muere en menos hits; spd > baseline.
- **AC5 — Clone safety:** la fila `ETPL` original NO se muta tras spawnear variantes (identidad
  de referencia intacta).
- **AC6 — Determinismo de reparto:** misma seed/posición ⇒ misma variante ×2.
```

Bindings/números arriba son EJEMPLOS TUNABLES; el GE ajusta al feel real, el QA mide, el CEO firma.
