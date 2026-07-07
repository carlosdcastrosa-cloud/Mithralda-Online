# CAS-1785 — Parada con Tempo (Timing Parry)

**Gameplay Evolution beat.** Una parada por timing que premia la lectura del jugador: pulsar la
tecla de parada en una ventana estrecha (~150ms) justo antes de recibir un golpe **cuerpo-a-cuerpo**
niega el golpe por completo y dispara un contraataque corto. Fuera de ventana = no-op (con cooldown
anti-spam). Feel objetivo: alto skill-ceiling, gratificante, legible. Mirror de patrón de
[[cas1773-frenzy-meter]] (run-state transitorio, NO serializado).

## Restricciones NO-NEGOCIABLES (patrón estándar Gameplay Evolution)

1. **$0 arte** — sólo glyphs/tintes/VFX procedurales existentes (`addFx("dodgering"|"spark")`,
   `floater`, `shakeAdd`, `freeze`). NADA de PixelLab/Higgsfield.
2. **RNG-neutral byte-idéntico** — la parada es **timing puro, CERO draws de RNG** (ni con `PARRY`
   ON). No abre stream nuevo (`parryRng` innecesario). Con `PARRY.enabled=false` el juego es
   BYTE-IDÉNTICO (mismo md5 de sim/replay). Con ON, sigue siendo determinista (0 srand).
3. **Save aislado** — la parada es run-state **transitorio** (mirror `atkspdBuff`/`frenzyT` de
   Frenzy): NO se serializa. `save.v1` NO crece ni cambia de forma; byte-idéntico con feature on u
   off. **v1 no necesita persistencia.** Si en el futuro se quiere un contador de por-vida de paradas
   exitosas (p.ej. para un Título de Gesta), iría en clave propia `mithralda.parry.v1` (append-only),
   NUNCA en `save.v1`. Fuera de alcance v1.
4. **1 solo knob** — `PARRY` en `sim/config.js` (enabled + params). Default sensato.

## Config knob (sim/config.js)

```js
// CAS-1785 — Parada con Tempo (timing parry). HARD-GATED tras `enabled`: false ⇒ 0 lectura de
// input de parada, 0 estado nuevo en el héroe, 0 ramas nuevas ⇒ sim + save.v1 byte-idénticos.
// Timing puro: CERO draws de RNG incluso con enabled:true (determinismo de replay intacto).
export const PARRY = {
  enabled:true,
  windowMs:150,     // ventana activa tras pulsar (spec 120–180ms; 150 = punto medio)
  cooldownS:0.55,   // cooldown tras cualquier pulsación (anti-spam; fuera de ventana = whiff)
  counterDmg:26,    // daño del contraataque al atacante melee parado (ruteado por hitEnemy ⇒ crit/procs)
  knockback:230,    // empuje aplicado al atacante parado
  riposteMul:1.5,   // buff de 1 golpe: el PRÓXIMO hitEnemy del héroe ×este mult (consumible, transitorio)
};
```

## Seams de implementación (para el Game Engineer)

### A. Estado transitorio en el héroe (NO serializado)
- En `newHero()` (`sim/sim.js` ~L286, junto a `rollCD:0, iframe:0, atkCD:0…`): añadir
  `parryT:0, parryCD:0, _parryRiposte:0`. Estos campos son **run-state efímero**; NO se escriben en
  `serializeSave` ni se leen en el load (mirror exacto de `atkspdBuff` de Frenzy → `save.v1` byte-id).
- **Tick per-frame** en el seam existente `sim/sim.js` L3062
  (`h.atkCD=Math.max(0,h.atkCD-dt); …`): añadir
  `h.parryT=Math.max(0,h.parryT-dt); h.parryCD=Math.max(0,h.parryCD-dt);` **gated tras `PARRY.enabled`**
  (si `!PARRY.enabled` no tocar estos campos ⇒ permanecen 0 ⇒ byte-id). Extraer a `tickParry(h,dt)`
  como `tickFrenzy` para que el hook `__dev` de QA lo comparta.

### B. Trigger de input (input.js)
- Parada = tecla **dedicada** `KeyH` manejada en el handler de escena `play`, **igual que**
  `KeyK`(codex)/`KeyY`(titles)/`KeyL`(pacts) que se manejan fuera de la tabla `binds`
  (input.js L241/244/247). Gated tras `PARRY.enabled` (si off, la tecla no hace nada nuevo).
  → NO tocar `REBINDS`/`settings.binds` ⇒ el snapshot de settings queda **byte-idéntico** con feature
  off, evitando cualquier riesgo de crecer la persistencia de settings.
- La tecla llama a un export nuevo `sim.tryParry()`: si `PARRY.enabled && G.scene==="play" &&
  h.parryCD<=0 && !h.dead`: `h.parryT=PARRY.windowMs/1000; h.parryCD=PARRY.cooldownS;` + un VFX/sfx
  de "windup" sutil (glint procedural). Si en cooldown ⇒ whiff (sin efecto). CERO RNG.

### C. Negación + contraataque (sim/sim.js `damageHero`, L3699)
- `damageHero(dmg,ang,infl,src)` ya retorna `false` cuando el golpe se niega (i-frame/roll/dodge).
  El seam de parada va **al inicio**, tras `if(h.dead) return false;` y **antes** del bloque
  i-frame, gated así:
  ```js
  if(PARRY.enabled && src && src.hp>0 && !src.dead && h.parryT>0){
    h.parryT=0;                                   // consume la ventana
    // niega el golpe: 0 daño, 0 status (infl ignorado), breve i-frame de recompensa
    h.iframe=Math.max(h.iframe,0.18);
    // contraataque: daño + empuje al atacante, ruteado por hitEnemy (crit/procs/kill normales)
    const ra=Math.atan2(src.y-h.y,src.x-h.x);
    hitEnemy(src, PARRY.counterDmg, ra);
    src.vx=(src.vx||0)+Math.cos(ra)*PARRY.knockback; src.vy=(src.vy||0)+Math.sin(ra)*PARRY.knockback;
    h._parryRiposte=1;                            // buff de 1 golpe (consumible transitorio)
    // feel: VFX procedural + freeze + floater legible ($0 arte)
    addFx("dodgering",h.x,h.y,{life:0.34}); addFx("spark",src.x,src.y);
    floater(h.x,h.y-38,STR.parry||"¡Parada!","#ffe27a"); shakeAdd(7); freeze(6); audio.sfx.roll();
    return false;                                  // golpe COMPLETAMENTE negado
  }
  ```
  **Clave — `src` sólo está presente en golpes de CONTACTO (melee)**; los proyectiles pasan `null`
  (ver `af.blastDmgMul` L2124 y comentarios de thorns/reflect). Por eso la parada es naturalmente
  **melee-only** sin lógica extra, cumpliendo el spec "golpe cuerpo-a-cuerpo".
- **Riposte de 1 golpe** (opcional pero recomendado para el "counterattack buff"): en `hitEnemy`
  (choke de daño del héroe), si `h._parryRiposte>0`: `dmg*=PARRY.riposteMul; h._parryRiposte=0;`
  (consumido). Transitorio, no serializado, CERO RNG. Si el GE prefiere v1 sin riposte, dejar
  `counterDmg+knockback` como el efecto y documentar; el contra corto ya cumple el AC.

### D. VFX/HUD ($0 arte, render/render.js)
- Durante `h.parryT>0` (ventana activa): un aro/glint procedural sutil alrededor del héroe (mismo
  `addFx` o un stroke en `render.js`) para legibilidad de la ventana.
- Opcional: un pip de cooldown junto al HUD de roll. NO obligatorio para el AC. Sin `hud.js` si el
  glint vive en `render.js`.
- `STR.parry` = "¡Parada!" en `strings.js` (si se usa; string-only, no arte).

## Blobs game-core tocados (set esperado; el GE confirma el set REAL en su handoff)
- `sim/config.js` — knob `PARRY`.
- `sim/sim.js` — estado en `newHero`, `tickParry` + tick L3062, `tryParry` export, negación+contra en
  `damageHero`, riposte en `hitEnemy`, hook `__dev`.
- `input.js` — `KeyH` → `sim.tryParry()` (gated).
- `render/render.js` — glint de ventana activa (procedural).
- `strings.js` — `STR.parry` (opcional, string-only).

> El Deploy (CTO) publica **exactamente el set que el GE reporte**, no un set adivinado.

## Hooks `__dev` para QA (DOM-free / live-injectable, mirror `frenzyStep`)
- `parryState()` → `{ parryT, parryCD, riposte:h._parryRiposte }`.
- `parryPress()` → equivalente a `sim.tryParry()` (arma la ventana si CD lo permite).
- `parryStep(dt)` → `tickParry(h,dt)` (avanza sólo los timers de parada por dt).
- `parryEnabled()` → `PARRY.enabled` (para que el harness sepa si probar ON/OFF).
- QA debe poder: armar parada → recibir golpe melee dentro de ventana ⇒ `damageHero` retorna false y
  atacante recibe `counterDmg`; recibir golpe fuera de ventana ⇒ daño normal (no-op); golpe **ranged**
  (src=null) dentro de ventana ⇒ NO se niega (parada es melee-only).

## Guardrail de aceptación (crítico — lección 07-07)
- **AC-RNG/BYTE (OFF)**: con `PARRY.enabled=false`, `save.v1` byte-idéntico y una secuencia srand de
  N-draws idéntica a HEAD (0 draws nuevos). md5 sim OFF == HEAD.
- **AC-RNG (ON)**: con `PARRY.enabled=true`, la parada NO consume srand (timing puro) ⇒ misma
  secuencia srand ON==OFF sobre la misma seed. Determinismo de replay intacto.
- **AC-SAVE**: `save.v1` byte-idéntico con feature on Y off (run-state transitorio, no serializado).
- **QA harness (crítico)**: debe ejercitar el **`buildTiledWorld` REAL** que juega el jugador (NO un
  `buildWorld` fresco DOM-free) — misma lección que [[cas1784-caldera-zoneof-fix]]. Casos: dentro de
  ventana niega+contra; fuera de ventana no-op; ranged no-parable; OFF ⇒ replay/save byte-idéntico
  (md5 live==HEAD). PASS×2 en live.

## Descomposición (chain)
Build (GE) → Deploy gh-pages (CTO) → QA×2 live md5==HEAD (QA) → Gate CEO. Blockers encadenados en las
descripciones (PATCH de `blockedByIssueIds` reportado 500 → también se fija en el POST de creación
para habilitar auto-wake). Umbrella CAS-1785 cierra por `children_completed`.
