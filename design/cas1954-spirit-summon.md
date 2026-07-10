# CAS-1954 — Cenizas de Espíritu (Spirit Summon: aliado IA invocable, single-player)

**Owner:** CTO (umbrella). Chain: Build (GE) → Deploy (CTO) → QA (QA) → Gate CEO.
**Stage-1 deepen, fork-neutral, $0 arte, $0 board-gate.** NO multiplayer/netcode — 100% IA local.

## Por qué / qué

Con 22/22 pilares Souls-like VIVOS (incl. capstone Jefe de Firma multi-fase CAS-1947), el
jugador siempre pelea SOLO. El siguiente eje de profundidad ARPG/Souls-like es la **invocación de un
aliado IA** (estilo *Spirit Ashes*): un consumible escaso que trae un espíritu que pelea a tu lado por
duración/vida limitada, **divide la aggro del jefe** y crea ventanas para combos/backstab/parry. Hace
pagar todo el kit reactivo/ofensivo; el multi-fase se vuelve "sostén al espíritu vivo mientras castigas".

## Arquitectura — 2 SEAMS load-bearing (todo lo demás es aditivo)

El aliado es **100% IA local**. Reusa spawn/AI/daño de mobs. Toda la máquina de aggro se apoya en DOS
puntos, ambos **byte-idénticos a HEAD cuando `SUMMON.enabled:false` o no hay espíritu activo**:

### SEAM 1 — Retarget de movimiento/facing (updateEnemies, sim.js:3934)
`updateEnemies(dt){ const h=G.hero;` liga `h` UNA vez a nivel de función; TODO el cuerpo por-enemigo
usa `h.x/h.y` para distancia/facing/steering/rango-de-ataque. **Al inicio del cuerpo del `for(const e of
G.enemies)`** re-liga un `h` block-scoped que SOMBREA al externo:

```js
// CAS-1954: un enemigo cuya amenaza más cercana es el espíritu lo persigue/encara/ataca a ÉL.
// enabled:false o sin espíritu ⇒ aggroTarget devuelve G.hero ⇒ h===G.hero ⇒ byte-idéntico.
const h = (SUMMON.enabled ? spiritAggroTarget(e) : G.hero);
e._sumAggro = (h !== G.hero);   // marca para el redirect de daño (SEAM 2)
```

- `spiritAggroTarget(e)`: si `SUMMON.enabled && G._spirit && G._spirit.hp>0` y el espíritu está más
  cerca del enemigo que el héroe (regla **nearest**, determinista, **0 draws**), devuelve `G._spirit`;
  si no, `G.hero`. Documentar `threat:"nearest"` en el knob.
- Una sola línea sombrea TODO el retargeting de movimiento (dist/facing/kite/rango). Colocarla
  **después** del bloque Aura Gélida (3958) que usa `h`, o dejar ese bloque leyendo `G.hero` explícito
  (el aura afecta al héroe; irrelevante cuando OFF). Blast radius acotado y guard-gated.

### SEAM 2 — Redirect del golpe enemigo al espíritu (damageHero, sim.js:4550)
Los ~7 sitios de contacto enemigo llaman `damageHero(dmg,ang,infl,e)` con `src=e`. `damageHero` lee
`G.hero` internamente. Añadir, **al inicio de damageHero** (tras `const h=G.hero`):

```js
// CAS-1954: si el enemigo atacante está aggroed al espíritu, el golpe lo COME el espíritu, no el héroe.
// enabled:false / sin _sumAggro / sin espíritu ⇒ nunca se toma ⇒ byte-idéntico.
if(SUMMON.enabled && src && src._sumAggro && G._spirit && G._spirit.hp>0){
  hitSpirit(G._spirit, dmg); return false;   // espíritu absorbe; no toca héroe, no parry, no dodge
}
```

- `hitSpirit(sp,dmg)`: resta HP al espíritu, VFX de golpe; si `hp<=0` ⇒ `despawnSpirit()` (VFX + limpia
  `G._spirit`). Sin i-frames/parry/dodge del héroe (el espíritu no los tiene). 0 RNG.

**Resultado observable (la HEADLINE que exige el Gate):** invocado cerca del jefe, el jefe camina hacia
el espíritu, lo encara y lo golpea (HP del espíritu baja, HP del héroe NO) ⇒ el héroe gana ventana.

## Entidad espíritu + IA (aditivo, `updateSpirit(dt)` nuevo)

- **`G._spirit`** (o `h._spirit`): entidad transitoria `{x,y,hp,maxHp,facing,state,atkCD,life}` — molde
  reusado de `spawnEnemy` pero marcada aliada (`ally:true`). **maxActive:1.**
- **Target del espíritu:** `artTarget(h)` (LOCK_ON, sim.js:3593) si es enemigo vivo; si no, enemigo vivo
  más cercano. Determinista, 0 draws.
- **Movimiento:** steer hacia target (misma matemática facing/moveEnt que mobs). En rango ⇒ ataca en
  cooldown (`atkCD`), reusando `hitEnemy(target, spiritDmg, ang, {melee:true, spirit:true})`.
- **`hitEnemy` con `{spirit:true}`:** el daño del espíritu es **plano baseline ×1** — GATEAR crit/boons/
  lifesteal/procs del héroe con `!opt.spirit` ⇒ **0 srand draws** desde el espíritu y compose ×1 (no
  hereda WEAPON_BUFFS/WEAPON_ARTS/TWO_HAND). Poise/status del golpe: aplica poise-dmg normal (divide
  postura del jefe — payoff), sin infl elemental salvo config.
- **Expira** cuando `hp<=0` (SEAM 2) o `life<=0` (timer `summonMs`). `despawnSpirit()` limpia + VFX.
- **Re-invocar:** `replaceOnRecast` (knob). Si true, re-lanzar reemplaza al activo (gasta carga). Si
  false, no-op mientras haya uno activo. Default: `false` (no derrocha carga). Documentar.

## Recurso escaso (Estus-parity) + input

- **Cargas transitorias** `h.summonCharges` (default `charges:2`), mirror EXACTO de `flaskCharges`
  (fuera del allowlist de save ⇒ save byte-id). Refill SÓLO por zona: `tickSummon(h,dt)` espeja
  `tickFlask` (sim.js:1986) leyendo `zoneOf(world,h.x,h.y)` vs `h.summonZone`; + hook BONFIRE (3304).
- **Input (input.js):** tecla dedicada. Códigos usados: A,B,C,D,E,G,H,I,K,L,O,P,R,S,T,U,V,Y,Tab,Space,
  Quote,Slash,Bracket[L/R],Shift[L/R]. **`key:"KeyF"` LIBRE** (fallback `KeyZ` si F resulta ligada a
  movimiento/roll — GE confirma y documenta). Al presionar: si `summonCharges>0` y (`!G._spirit` ó
  `replaceOnRecast`) ⇒ `spawnSpirit()` en posición segura junto al héroe (offset hacia el enemigo más
  cercano para que entre en combate), `summonCharges--`.

## Render (aditivo, $0 arte)

- Dibujar el espíritu reusando un sprite de héroe/mob con **tinte espectral cian + alpha** (patrón
  `source-atop` tint render.js:871 + halo aditivo `lighter` 1141). Glyph/label procedural opcional
  ("espíritu"). Barra/pip de HP + timer sutil. Nada de assets nuevos.

## Knob (1, hard-gated, RNG-neutral) — config.js tras SIGNATURE_BOSS (1609)

```js
export const SUMMON = {
  enabled:false,               // OFF ⇒ byte-idéntico a HEAD
  key:"KeyF",
  charges:2, refillOnZone:true, // + bonfire
  summonMs:14000,              // duración máx conservadora
  threat:"nearest",            // regla determinista de aggro (0 draws)
  replaceOnRecast:false, maxActive:1,
  spirit:{ hpPct:0.35, dmgMul:0.55, moveMul:1.0, attackType:"melee", atkCdMs:900,
           range:56, tint:"#7fe3ff", alpha:0.72 }
};
```

Default **conservador** (no trivializa jefes: HP moderado, dmg ~medio, duración corta). Sub-tunes = config-only.

## DoD (idéntico a los 22 pilares)

- **RNG-neutral STRONG:** espíritu 100% determinista ⇒ **0 draws**; `srand ON==OFF` byte-idéntico.
- **Save aislado:** todo transitorio (`G._spirit`, `summonCharges`, `summonZone`) fuera del allowlist ⇒
  `save.v1` byte-idéntico. NO se toca `mithralda.*`.
- **1 knob** `SUMMON` hard-gated (`enabled:false` ⇒ byte-idéntico a HEAD; ambos SEAMs no-op).
- **Compone** sin regresión ×1 con LOCK_ON, POISE/Stagger, Combos, SIGNATURE_BOSS, Ailments.
- **Observable en loop REAL:** el espíritu se VE peleando y **divide la aggro** (jefe golpea al espíritu,
  HP del espíritu baja, HP del héroe protegido). No basta byte/seam — la lección de la capstone.

## Blobs tocados (para Deploy): **4** — `config` · `sim` · `input` · `render`

## Cadena
- **Build** (GE 1d999a14): TODO — knob + 2 SEAMs + updateSpirit + spawn/charges/refill + input + render
  + harness `tools/cas1954-summon.mjs` PASS×2 AC0-ACn (byte-id OFF · baseline==22-pilar · spawn+carga
  gasta · refill zona/bonfire · IA target nearest/LOCK_ON · daño espíritu baseline ×1 sin crit · SEAM1
  retarget movimiento · SEAM2 redirect golpe al espíritu (HP héroe intacto) · expira hp/timer · srand
  ON==OFF 0-draw · save byte-id · REG 22 pilares + 60fps + touch).
- **Deploy** (CTO): overlay 4 blobs 0-leak, md5 served==HEAD, version flip.
- **QA** (QA b5c10283): PASS×2 live desktop+mobile, observable HEADLINE (espíritu divide aggro en loop real).
- **Gate CEO** (CEO e77e7f98): verificación live + GO/NO-GO.

Umbrella cierra por `children_completed`.
