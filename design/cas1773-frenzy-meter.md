# CAS-1773 — Medidor de Frenesí (Kill-Streak / Momentum)

**EVO gameplay — eje momento-a-momento (combate).** Umbrella CTO-owned. Design spec (CTO).
Chain: Build (GE) → Deploy (CTO) → QA PASS×2 live → Gate CEO.

## Objetivo
Un **Medidor de Frenesí**: matar enemigos en rápida sucesión llena un medidor que otorga un buff
APILABLE, determinista y **transitorio**; el medidor decae si dejas de matar. Refuerza el bucle
momento-a-momento y sinergiza con Afijos (CAS-1768: más procs → más kills → más frenesí) y
Pactos/Heat (CAS-1763: más densidad → mantener frenesí más difícil pero más rentable).

## Arquitectura — precedente exacto: `atkspdBuffT`/`atkspdBuffAmt`
El buff de "furia" (CAS-192) ya establece el patrón EXACTO que copiamos:
- Campo **transitorio** en el héroe, **inicializado en `newHero`**, **NUNCA serializado** (no toca
  `serializeSave`/save.v1), **tick-down en `update(dt)`**, **leído en `heroAtkspd(h)`**.
Frenesí es el mismo patrón, sin abrir **ningún** stream RNG (aún más fuerte que Afijos, que necesitó
`affixRng`; aquí el buff es 100% derivado del *timing* de kills → CERO srand tocado siempre).

### Estado (transitorio, run-only — NO persistido)
Dos campos nuevos en el objeto héroe de `newHero` (junto a `atkspdBuffT:0, atkspdBuffAmt:0`):
```
frenzyStacks:0,   // 0..FRENZY.maxStacks — cuántos stacks activos ahora
frenzyT:0,        // ventana restante (s) desde el último kill; ≤0 ⇒ empieza el decay
```
Ambos **fuera** de `serializeSave` (mirror de `atkspdBuffT` — comentario "Transient — never serialized").
Reset natural por run: `newHero` los pone a 0. **No** hay clave de save, **no** hay migración.

## Config — 1 knob `FRENZY` (sim/config.js, junto a WEAPON_AFFIXES)
```js
// CAS-1773 — MEDIDOR DE FRENESÍ (kill-streak / momentum). Estado de run TRANSITORIO: matar dentro de
// `window` s del último kill suma 1 stack (hasta maxStacks); sin kill, tras `window` el medidor decae 1
// stack cada `decayEvery` s. Cada stack = buff DETERMINISTA (atk-speed aditivo + daño multiplicativo),
// aplicado en los chokes de combate YA EXISTENTES (heroAtkspd sink + hitEnemy dmg mul). NO abre RNG (el
// buff deriva sólo del timing de kills ⇒ srand byte-idéntico), NO persiste (no toca save.v1). HARD-GATED
// tras `enabled`: false ⇒ 0 incrementos, 0 decay, +0 atkspd, ×1 dmg, sin HUD ⇒ sim + save.v1 byte-idénticos.
export const FRENZY = {
  enabled:true,
  window:3.0,        // s desde el último kill para encadenar / mantener el medidor
  decayEvery:0.6,    // s por stack perdido una vez expira la ventana (decay gradual, no reset seco)
  maxStacks:8,       // techo de stacks
  perStack:{ atkspd:4, dmgPct:3 },  // por stack: +4 atk-speed (aditivo, entra al ATKSPD_TOTAL_CAP) y +3% daño
};
```
- Sólo 2 "efectos" (atkspd + dmg) para respetar guardrail 5 (single combat choke): ambos reusan
  sinks/chokes YA existentes. **Sin** move-speed en v1 (evita un 3er site disperso; queda como
  follow-up opcional si Carlos lo pide).
- `enabled:false` ⇒ toda rama Frenesí es no-op ⇒ **sim y save.v1 byte-idénticos** (AC1).

## Seams (sólo 3 blobs game-core: config.js / sim.js / render.js — NO hud.js, NO gear.js)

1. **`newHero`** (sim.js ~272): añadir `frenzyStacks:0, frenzyT:0` junto a `atkspdBuffT`.
2. **`killEnemy`** (sim.js ~1985, rama de kill real no-neutral): al principio, gated:
   ```js
   if(FRENZY.enabled && G.hero && !tpl.neutral && !G.hero.dead){
     const h=G.hero;
     if(h.frenzyT>0) h.frenzyStacks=Math.min(FRENZY.maxStacks, h.frenzyStacks+1);
     else h.frenzyStacks=Math.max(h.frenzyStacks,1); // primer kill tras decay total re-arma en 1
     h.frenzyT=FRENZY.window;
   }
   ```
   Colocar **temprano** en `killEnemy` (arithmetic puro, 0 RNG). Neutral deaths no cuentan (mismo
   criterio que kills/ultCharge). El choke de *kill* es único.
3. **`update(dt)`** (sim.js ~3022, junto al tick de `atkspdBuffT`): decay gradual gated:
   ```js
   if(FRENZY.enabled && h.frenzyStacks>0){
     if(h.frenzyT>0) h.frenzyT-=dt;
     else { h._frenzyDecayT=(h._frenzyDecayT||0)+dt;
            while(h._frenzyDecayT>=FRENZY.decayEvery && h.frenzyStacks>0){ h._frenzyDecayT-=FRENZY.decayEvery; h.frenzyStacks--; }
            if(h.frenzyStacks<=0) h._frenzyDecayT=0; }
   }
   ```
   (`_frenzyDecayT` también transitorio, no serializado.)
4. **`heroAtkspd(h)`** (sim.js ~1801): sumar el aporte de frenesí al total **antes** del
   `ATKSPD_TOTAL_CAP` (mismo sink que `atkspdBuffAmt`):
   ```js
   + (FRENZY.enabled ? h.frenzyStacks*FRENZY.perStack.atkspd : 0)
   ```
   `enabled:false` ⇒ `+0` ⇒ byte-idéntico. (Ya está clampeado por ATKSPD_TOTAL_CAP ⇒ sin runaway.)
5. **`hitEnemy`** (sim.js ~1880, junto al multiply de `leg_cazador`): multiplicador de daño por
   stacks, **determinista**, consumo srand nulo:
   ```js
   if(FRENZY.enabled && G.hero && G.hero.frenzyStacks>0) dmg*=(1+G.hero.frenzyStacks*FRENZY.perStack.dmgPct/100);
   ```
   0 stacks (o disabled) ⇒ `×1` ⇒ secuencia de hit byte-idéntica. Único choke de daño.
6. **HUD (render.js)** — glyph/barra de Frenesí ($0 arte, canvas puro):
   - Un pip/barra que llena `frenzyStacks/maxStacks` + contador; **tinte/brillo de borde**
     (edge glow) al llegar a stacks altos (p.ej. ≥ maxStacks·0.75). Reusa primitivas de dibujo
     existentes; sin assets. Gated tras `FRENZY.enabled` (disabled ⇒ no se dibuja nada).

## Guardrailes (verificación)
1. **$0 arte** — glyph/barra/edge-glow procedurales canvas. ✔
2. **RNG-neutral STRONG** — NO nuevo stream; buff 100% derivado del timing. `enabled:false` ⇒ srand
   ON==OFF y sim byte-idéntico. ✔
3. **Save-aislado** — `frenzyStacks/frenzyT/_frenzyDecayT` transitorios, fuera de `serializeSave`;
   save.v1 byte-idéntico; reset por run vía `newHero`. ✔
4. **1 knob** — bloque `FRENZY`; OFF ⇒ comportamiento y build byte-idéntico. ✔
5. **Single combat choke** — incremento en `killEnemy`, decay en `update`, y el buff se lee en los
   sinks/chokes YA existentes (`heroAtkspd`, `hitEnemy`). No disperso en features nuevas. ✔

## Aceptación (Gate CEO)
- Live version.json nuevo + QA PASS×2 vs live, md5 live==HEAD en `config.js/sim.js/render.js`.
- **AC1** `FRENZY.enabled=false` ⇒ **save byte-idéntico** y **build byte-idéntico** (md5 config/sim/render
  ON vs. una build OFF difieren SÓLO por el flag; save.v1 idéntico).
- **AC2** `srand` ON==OFF (barrido de ≥48 draws sobre combate real con y sin frenesí activo).
- **AC3** los buffs por stack **disparan y decaen** correctamente: matar en ventana sube stacks
  (atk-speed sube en `heroAtkspd`, daño de `hitEnemy` sube el % esperado por stack); parar de matar
  → tras `window` el medidor pierde 1 stack cada `decayEvery` s hasta 0.
- **AC4** el medidor **NO se persiste** entre runs: guardar con stacks>0, recargar ⇒ `frenzyStacks==0`
  y save.v1 blob byte-idéntico a uno guardado con stacks=0 (byte-id del save).

## Hand-off
Build **CAS-xxxx** (GE) → Deploy (CTO, auto-wake) → QA (PASS×2 live) → Gate CEO (e77e7f98).
Blobs servidos afectados: `sim/config.js`, `sim/sim.js`, `render/render.js`. hud.js/gear.js NO tocados.
