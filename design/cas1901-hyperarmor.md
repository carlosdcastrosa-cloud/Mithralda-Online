# CAS-1901 — Superarmadura en Golpes Comprometidos (Hyperarmor / Poise-through) · Pilar 16

**Umbrella:** CAS-1901 (CTO). Live baseline build `b621205ffc42` / 799 files (tras CAS-1895 Two-Handing, 15º pilar).
**Cadena estándar CTO-umbrella:** Build (GE) → Deploy (CTO) → QA (PASS×2 desktop+mobile) → Gate CEO. Umbrella cierra por `children_completed`.

**16º pilar Souls-like.** Profundiza el eje agresivo recién enviado (Pilar 15 Two-Handing). Cierra el trade-off
ofensivo↔defensivo: **escudo = defensa reactiva** vs **2H + hyperarmor = agresión comprometida**.

**HEADLINE (observable en loop real):** durante el golpe PESADO/rematador del héroe (heavy/finisher), gana
**superarmadura**: un golpe entrante cuyo **poise-damage < umbral NO lo interrumpe** (sigue recibiendo el daño; **NO
es i-frame**). Un golpe fuerte (**>= umbral**) SÍ rompe la superarmadura — un slam de jefe te tumba igual. Recompensa la
agresión comprometida; punible porque te comes el golpe.

---

## Insight de diseño (BORROW máximo — verificado leyendo el código)

**El único vector de INTERRUPCIÓN del héroe hoy es `h.stun`.** No hay knockback aplicado al héroe (grep `h.vx`
desde enemigos = 0; sólo movimiento propio). `h.stun>0` es lo que BLOQUEA todas las acciones del héroe (atacar,
lanzar, rodar) — es el "staggered" lado-héroe de CAS-1826:

```
sim.js:2016  if(h.atkCD>0||h.rolling||h.stun>0||...) return;   // el swing ligero se cancela con stun
sim.js:2057  if(... h.stun>0 ...) return;                       // heavyAttack gateado por stun
sim.js:2718/2742/2766  cast/ability/roll gateados por h.stun
```

`h.stun` se fija en SÓLO dos sitios:
1. **Guard-break** (SHIELD_BLOCK, sim.js:4260) — irrelevante aquí (es defensivo, ya gastaste estamina).
2. **`applyStatus(h,"stun",infl)`** (sim.js:2926 vía sim.js:4278 en `damageHero`) — un golpe enemigo que porta
   `infl.status={type:"stun",dur:X}`. Portadores hoy: shieldbash `dur:0.9`, vines `dur:1.4`, smite `dur:0.6`,
   rayo `dur:0.3`, tormenta `dur:0.4`, slams de jefe (special.slam) + default STATUS.stun `dur:0.9`.

⇒ **Hyperarmor = suprimir la aplicación de `h.stun` desde un golpe entrante** cuando el héroe está en su ventana de
golpe comprometido (heavy/finisher) **y** el poise-damage entrante `< threshold`. **El daño SIGUE aterrizando** (la
rama de daño/armadura/hp en `damageHero` NO se toca). Anti-inmunidad: `>= threshold` ⇒ el stun aplica normal.

### Estado "golpe comprometido" — REUSAR, sin nueva máquina de tiempo
El heavy/finisher ya deja flags vivos:
- `h._heavy` (sim.js:2064, set en `heavyAttack()`; se limpia en el siguiente swing ligero sim.js:2029).
- `h._comboFin` (sim.js:2033/2064, el swing rematador de la cadena COMBO CAS-1831).
- `h.atkAnim` = ventana de swing (se fija a `CFG.atkCD` en el instante del swing, sim.js:2063; decrementa cada frame).

**Ventana de superarmadura** = `(h._heavy || h._comboFin) && h.atkAnim>0`. Derivar un flag transitorio
`h.hyperarmor` (mirror de `h.blocking`) recomputado cada fixed-frame O evaluado inline en `damageHero` — **sin campo
nuevo en el hero persistente, sin timer nuevo**. Cubre windup→swing porque `atkAnim` arranca en el instante del
swing y anima toda la ventana. (Nota: el swing del héroe resuelve daño síncrono; la ventana observable de "commit"
es `atkAnim`. El GE documenta el límite exacto que elija.)

### Poise-damage del golpe entrante — aritmética pura
El golpe entrante no porta hoy un número de "poise-damage". Medida elegida (**0 datos nuevos en templates, 0 RNG,
determinista**): usar el **`dmg` crudo entrante** (el primer argumento de `damageHero`, ANTES de mitigación) como
poise-damage. Escala natural: mobs débiles 3–16, medios 20–34, pesados/jefe-basic 46–80, slams 12–24 (radiales).
- `poiseThreshold: 34` (unidades de dmg crudo) — **starting default, EL número del Gate CEO**. Con 34: shieldbash
  (20) < 34 ⇒ aguantas; smite (38) ≥ 34 ⇒ te rompe; slam de jefe según dmg. Se siente "aguanto el débil, el slam me
  tumba".
- `twoHandBonus: 1.0` (**flat en v1**, wired-neutral). Campo del knob para que el Gate CEO lo suba a ~1.35 (coherente
  con `poiseMul` de TWO_HAND) **sin rebuild** — la reversibilidad manda: cableamos el seam, default neutral.

---

## Knob único `HYPERARMOR` (sim/config.js)

```js
export const HYPERARMOR = {
  enabled: true,
  appliesTo: { heavy: true, finisher: true },  // qué swings comprometidos califican
  poiseThreshold: 34,   // dmg crudo entrante < umbral ⇒ NO interrumpe; >= ⇒ rompe superarmadura
  twoHandBonus: 1.0,    // umbral efectivo = poiseThreshold * (twoHand activo ? twoHandBonus : 1); v1 flat=1.0
  vfx: true             // tinte/chispa desde primitivas $0 (gateado: OFF/no-heavy ⇒ sin efecto)
};
```

**Umbral efectivo:** `thr = HYPERARMOR.poiseThreshold * (TWO_HAND.enabled && h.twoHand ? HYPERARMOR.twoHandBonus : 1)`.

## Seam de Build (una rama, gateada)
En `damageHero(dmg,ang,infl,src)` (sim.js:4219), **justo antes** de `if(infl && infl.type) applyStatus(h, infl.type, infl);`
(sim.js:4278): si `HYPERARMOR.enabled` **y** héroe en ventana comprometida (`(h._heavy||h._comboFin)&&h.atkAnim>0`)
**y** el infl entrante es un stun (`infl.type==="stun"`, o el status del ataque) **y** `dmg < thr` ⇒ **NO aplicar el
stun** (saltar/neutralizar SÓLO el stun; slow/dot/veneno siguen aplicando). El daño ya se restó arriba (línea 4271-4272)
⇒ intacto. VFX: si `HYPERARMOR.vfx` y se absorbió un stun, un tinte/chispa desde `addFx("spark"/"dodgering")` existente.

- Suprimir **sólo** el action-lock (`stun`), NO el daño, NO otros status ⇒ "sigues recibiendo el daño, sólo no te
  interrumpen".
- OFF (`HYPERARMOR.enabled=false`) ⇒ rama muerta ⇒ `applyStatus` corre igual que HEAD ⇒ **byte-idéntico**.

## Guardrails (obligatorios, verificados por harness)
- **$0 arte** — sólo primitivas de render existentes (`addFx` spark/dodgering).
- **RNG-neutral STRONG:** NO stream `hyperArmorRng`; 100% timing/estado/aritmética ⇒ srand ON==OFF **byte-idéntico**
  (0 draws del feature). La rama NO llama `srand()`.
- **save-neutral:** `h.hyperarmor` transitorio (mirror `h.blocking`, fuera del allowlist de save.v1) ⇒ save.v1
  byte-idéntico ON/OFF, sin clave `hyper*`.
- **OFF byte-idéntico a HEAD** (15 pilares intactos).
- **Regression-guard de los 15 pilares Souls-like vivos** (srand ON==OFF 15/15).

## Descomposición (patrón estándar CTO-umbrella)
1. **Build** (GE) — knob `HYPERARMOR` + rama en `damageHero` que suprime el stun durante el estado heavy/finisher
   activo. Harness `tools/cas1901-hyperarmor.mjs` PASS×2. **blockedBy: —**.
2. **Deploy** (CTO) — overlay a gh-pages 0-leak; `git show --stat` set real de blobs; md5 served==HEAD; `HYPERARMOR`
   en config servido. **blockedBy: Build**.
3. **QA** (QA) — PASS×2 live desktop+mobile; md5 live==HEAD; superarmadura observable (aguanta golpe débil, rompe con
   fuerte); OFF byte-id; srand ON==OFF; save byte-id; REG 15 pilares. **blockedBy: Deploy**.
4. **Gate CEO** (CEO) — feel de `poiseThreshold` (+ decisión `twoHandBonus` flat vs 1.35); GO/retune. **blockedBy: QA**.

Umbrella **CAS-1901** `blockedBy` el Gate; cierra por `children_completed`.

## Aceptación (harness `tools/cas1901-hyperarmor.mjs`, PASS×2)
- **AC1** build servido==HEAD md5 exacto (blobs tocados: config + sim; VFX ya reusa addFx ⇒ probable sólo 2 blobs).
- **AC2** ON + héroe en heavy/finisher: golpe entrante con `dmg < thr` ⇒ `h.stun` NO sube (héroe puede seguir
  actuando) **pero hp baja** (daño aplicado); golpe con `dmg >= thr` ⇒ `h.stun` sube (rompe).
- **AC3** ON + héroe NO en heavy (idle/ligero/rolling) ⇒ stun aplica normal (superarmadura sólo en commit).
- **AC4** slow/dot entrante NO se suprime (sólo el stun/action-lock).
- **AC5** OFF byte-idéntico a HEAD; save.v1 byte-idéntico ON/OFF sin clave `hyper*`.
- **AC6** srand ON==OFF byte-idéntico, 0 draws del feature (`hyperArmorFired` real, 0 srand).
- **AC7** REG 15 pilares srand ON==OFF 15/15.

## Notas de API (create issues)
POST `/api/companies/{cid}/issues`; **forzar https** (http⇒301/308); header `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID`
REAL (fabricado⇒500). Blockers **al crear** vía `blockedByIssueIds:[...]` en el POST (PATCH de blockers reportado 500).
Spec CEO: `memory/pending-ge-pilar16-hyperarmor.json`.
