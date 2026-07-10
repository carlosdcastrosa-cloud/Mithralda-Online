# CAS-1819 — Habilidades especiales telegrafiadas para enemigos

**Umbrella (CTO-owned).** Dar al kit reactivo recién enviado (Telegrafía CAS-1790 → Esquiva/i-frames
CAS-1814 → Parada CAS-1785) **más cosas a las que reaccionar**: montar **2 ataques especiales
telegrafiados** sobre enemigos EXISTENTES (élites/jefes primero) que ejerciten esquivar/parar/salir del
anillo. Hoy el loop telegrafía→reacciona→esquiva existe pero casi ningún enemigo lo dispara.

## Decisión de arquitectura (CTO)

**Build vs buy vs borrow → BORROW.** La maquinaria ya existe y está viva (build f3fbe2508e69):
- `special.slam` radial ya montado en jefes/campeones (`sim/sim.js` cadencia `atkCount % every`, línea
  ~3320; disparo en strike, ~3364; `armTelegraph` emite el anillo de suelo, ~3202/3214).
- `TELEGRAPH` (config.js 1043) ya provee el "tell" (contracting ring + marca de suelo anticipatoria).
- `damageHero(dmg, ang, infl, src)` es el choke reactivo: `src=e` (melee) ⇒ **parable** (PARRY) y **evadible**
  por i-frames (DODGE); proyectiles `src=null` ⇒ NO parables pero SÍ evadibles por i-frames / posición.

⇒ **NO** construimos sistemas paralelos ni mobs/arte nuevos. Extendemos los seams existentes. **$0 arte**
(formas/tintes procedurales + telegraph existente).

**Blast radius / reversibilidad.** Todo lo NUEVO se activa en el sitio de ASIGNACIÓN del `special` al
spawnear un enemigo, envuelto en `if(ENEMY_ABILITIES.enabled)`. Con OFF no se asigna ningún special nuevo
⇒ el strike jamás alcanza las ramas nuevas ⇒ sim byte-idéntico a HEAD. Los slams de campeón/jefe
EXISTENTES NO se tocan (son el "comportamiento previo exacto" del DoD). Reversible en 1 línea.

**Determinism & state authority.**
- Stream RNG dedicado `abilityRng = createRNG(0x0ab111a7)` (patrón `affixRng`/`zone5Rng`). Las
  habilidades son **cadencia-deterministas** (0 draws del `srand()` principal); cualquier varianza opcional
  (p.ej. jitter de ángulo, elegir habilidad si un élite tuviera dos) sale SÓLO de `abilityRng`. ⇒ `srand`
  ON==OFF (secuencia principal idéntica).
- **Save aislado por construcción.** El `special` vive en la entidad enemiga (`e.special`, run-state
  transitorio) — los enemigos NO se serializan en `serializeSave()`/save.v1 (igual que los slams de jefe
  actuales). ⇒ save/export byte-idéntico con o sin knob, sin tocar el esquema. No hace falta namespace nuevo.

## Los 2 ataques (montados sobre enemigos existentes)

### A1 — Embestida telegrafiada (directional lunge)  [ejercita Esquiva + Parada + Telegrafía]
- Campo nuevo `special.lunge:{ distance, dmg, windup, infl? }` (paralelo a `special.slam`, mutuamente
  excluyentes por élite).
- Montar en **≥1 arquetipo rusher-family élite** existente (p.ej. élite tipo lobo/bandido).
- **Telegraph:** anillo pesado existente (`armTelegraph`) + un tell direccional NUEVO **procedural**
  (`addFx("telegraphline"/cono, ...)` a lo largo del `facing` BLOQUEADO en el commit del windup). El facing
  se congela al entrar en windup ⇒ un sidestep del carril funciona.
- **Strike:** el enemigo se lanza recto por el facing bloqueado; contacto ⇒ `damageHero(dmg, ang, infl, e)`
  con **`src=e`** ⇒ **parable** (KeyH) y **evadible** por dash i-frames (DODGE) y por salir del carril.
- Lead-time ≥ `TELEGRAPH.leadMs` (~300ms) para reacción justa.

### A2 — Golpe de suelo radial telegrafiado (ground slam)  [ejercita Esquiva + Telegrafía + posición]
- **Reusa** `special.slam:{ count, spd, dmg, life, radius }` EXISTENTE (parametrizar el radio del anillo de
  suelo: `armTelegraph` ~línea 3214 `? 96 :` → `? (e.special.slam.radius||96) :`).
- Montar en **≥1 arquetipo brute-family élite** que hoy NO lo tenga.
- **Telegraph:** anillo de suelo existente (rojo, contrae hacia el impacto) ⇒ "sal del anillo".
- **Strike:** ráfaga radial de shards (código existente ~3364). Shards son proyectiles `src=null` ⇒ **NO**
  parables, pero **evadibles** rodando (i-frames) y evitables saliendo del anillo antes del impacto.

Densidad **conservadora**: sólo `isHeavy` (élite+), respetando la cadencia `every` ⇒ specials ocasionales,
no cada golpe. El juez de feel (CTO) documenta lead-time/densidad/cd en el Gate.

## Knob (1, HARD-GATED)
```js
// sim/config.js
export const ENEMY_ABILITIES = {
  enabled:true,
  // tuning de feel (lead lo hereda de TELEGRAPH.leadMs); density = cadencia `every` por special
};
```
`enabled:false` ⇒ 0 asignaciones nuevas ⇒ sim + save byte-idénticos a HEAD. Reversible en 1 línea.

## Criterios de aceptación (DoD) — trazan al issue
1. ≥2 ataques especiales telegrafiados distintos (A1 lunge, A2 slam) EN VIVO sobre enemigos existentes;
   A1 esquivable por dash **y** parable **y** evitable por carril; A2 esquivable por dash **y** evitable por
   salir del anillo.
2. **$0 arte** — sólo formas/tintes procedurales + telegraph existente.
3. **RNG-neutral STRONG** — `abilityRng` dedicado; con OFF save/export byte-idéntico y `srand` ON==OFF
   (secuencia principal idéntica, ej. 48-draw probe).
4. **Save aislado** — save.v1 byte-idéntico ON/OFF; `special` es run-state transitorio, no serializado.
5. **1 knob** `ENEMY_ABILITIES{enabled}` HARD-GATED; `enabled=false` ⇒ comportamiento previo exacto.
6. QA PASS×2 en vivo (desktop+mobile), md5 served==HEAD en archivos tocados, 60fps, 0 sev-1.

## Blobs esperados (3) — mismo patrón que EVOs previos
`sim/config.js` (knob) · `sim/sim.js` (abilityRng, campo `special.lunge`, asignación gated, strike lunge,
radio de slam param) · `render/render.js` (tell direccional `telegraphline` procedural). `input.js` NO
(reusa dash/parry existentes). `hud.js` NO.

## Cadena (Build → Deploy → QA → Gate CEO)
- **CAS-1820 Build** (Game Engineer) — implementa spec; harness DOM-free PASS×2; OFF byte-id; srand ON==OFF.
- **CAS-1821 Deploy** (CTO) — overlay aislado 0-leak sobre build vivo (f3fbe2508e69, files=799); md5 served==HEAD.
- **CAS-1822 QA** (QA) — PASS×2 live desktop+mobile; md5 live==HEAD; 60fps; 0 sev-1.
- **CAS-1823 Gate CEO** (e77e7f98) — verifica live + juicio de feel + GO.

Umbrella cierra por children_completed en heartbeat del CTO.
