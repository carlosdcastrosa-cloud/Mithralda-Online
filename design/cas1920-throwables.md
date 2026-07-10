# CAS-1920 — EVO Pilar 19: Consumibles Arrojadizos / Throwing Items

**Umbrella:** [CAS-1920](/CAS/issues/CAS-1920) · **Autor:** CTO · **Fecha:** 2026-07-10
**Cadena:** Build → Deploy → QA (PASS×2 live) → Gate CEO. Umbrella cierra por `children_completed`.

## Objetivo (1 frase)
El kit es 100% cuerpo-a-cuerpo tras 18 pilares. Este pilar añade la primera **herramienta a
distancia de recurso limitado**: 2 consumibles arrojadizos firma (cuchillo recto / bomba incendiaria)
para abrir peleas, castigar rangeds/casters y aplicar presión sin comprometerse a melee — **100% BORROW**
sobre los seams vivos (proyectil, LOCK_ON aim, STAMINA coste, refill-por-zona tipo Estus, status `burn`),
**sin arte, sin save nuevo, sin RNG nuevo**.

## Restricciones de diseño (por qué este seam)
- **Reusa el sistema de PROYECTILES vivo** (`G.projectiles.push({x,y,vx,vy,life,dmg,kind,ang,aoe,burstFx,col,infl})`,
  `sim/sim.js:2832` es el molde de proyectil de hechizo). Los proyectiles del **héroe** (`!p.enemy`) ya:
  colisionan con enemigos y llaman a **`hitEnemy(e,p.dmg,ha)`** (`sim.js:4402`) ⇒ el daño compone con
  defensas/backstab/afijos sin nueva economía; aplican **`applyStatus(e,p.infl.type,p.infl)`** al impactar
  (`sim.js:4403`) ⇒ la bomba reusa el DoT `burn` existente; soportan `aoe`/`burstFx`. **$0 arte.**
- **Compone sobre Pilar 12 LOCK_ON** (`sim.js:3464` helper `artTarget(h)` ya devuelve `h.lockTarget`
  vivo o el enemigo más cercano) — el proyectil apunta al objetivo enfocado; si no hay, va a `h.facing`.
  Geometría pura ⇒ 0 draws (LOCK_ON no tiene RNG).
- **Compone sobre Pilar 8 Estamina** (`spendStam(h,cost)` `sim.js`) — lanzar gasta vigor
  (OFF ⇒ rama muerta byte-id). Falla si vigor insuficiente ⇒ no lanza.
- **Reusa el seam de refill-por-zona de FLASK/Estus** (`h.flaskZone` en `sim.js:1959`, refill al cambiar de
  zona) + **BONFIRE** (`BONFIRE.refillFlasks`, `config.js:1237`). Las cargas de arrojadizos recargan SÓLO al
  cambiar de zona / descansar en hoguera — recurso escaso, **NO infinito**.
- **Status `burn`** existente (`applyStatus(e,"burn",{dmg})`, `sim.js:2296` ya lo usa el afijo de arma) —
  la bomba lo reusa vía `p.infl={type:"burn",dmg}`. $0 status nuevo.

## Tecla (DESVÍO justificado, FEEL/CEO-tunable)
Las 26 letras están ocupadas (ver `input.js:100-260`; Semicolon lo tomó WEAPON_ARTS en Pilar 18).
**Defaults propuestos: `throwKey:"Quote"` (`'`) + `cycleKey:"Slash"` (`/`)** — ambos son CODEs LIBRES,
adyacentes a L/Semicolon en el cluster de combate, alcanzables por meñique derecho. Patrón idéntico a
CAS-1895 (ShiftRight) / CAS-1914 (Semicolon): **alias fijo gated** en `input.js`
(`if(code===THROWABLES.throwKey && THROWABLES.enabled){ sim.throwItem(); return; }` + análogo cycle),
**NO rebindable** (nunca toca `REBINDS`/`settings.binds` ⇒ snapshot byte-id). **Tecla = decisión FEEL/CEO**,
tunable sin rebuild. Mantener simple (petición CEO): 1 tecla lanza el tipo seleccionado, 1 tecla cicla el tipo.

## Knob (1 config `THROWABLES`, config-tunable sin rebuild)
```js
export const THROWABLES = {
  enabled: true,
  throwKey: "Quote",     // ' — lanza el tipo seleccionado; alias fijo gated, FEEL/CEO-tunable
  cycleKey: "Slash",     // / — cicla el tipo seleccionado
  windupMs: 200,         // windup corto punible (comprometido, NO instantáneo); mirror atkAnim
  cooldownMs: 500,       // cd por-lanzamiento (transitorio h.throwCD, NO save)
  refillOnZone: true,    // recarga cargas al cambiar de zona (reusa seam flaskZone) + BONFIRE
  order: ["knife","firebomb"],   // orden del ciclo
  // Números = FEEL/CEO, tunables sin rebuild.
  types: {
    // Cuchillo Arrojadizo: proyectil recto rápido, daño moderado, barato. Apertura / castigo a distancia.
    knife:    { name:"Cuchillo Arrojadizo", charges:6, stam:8,  spd:520, dmg:14, life:0.9, kind:"knife",    col:"#d8dee8" },
    // Bomba Incendiaria: arco corto, impacto en área pequeña, aplica burn (reusa DoT). Más cara, más escasa.
    firebomb: { name:"Bomba Incendiaria",   charges:3, stam:20, spd:300, dmg:10, life:0.7, kind:"firebomb", col:"#ff7a3c", aoe:26, burn:{dmg:6}, burstFx:"flame", arc:true },
  },
};
```

## Seam plan (100% BORROW — dónde toca)
`sim/sim.js` — nueva función exportada **`throwItem()`** gated en `THROWABLES.enabled` + escena play +
héroe vivo + `h.throwCD<=0`:
1. **Selección de tipo**: `h.throwSel` transitorio (default `THROWABLES.order[0]`); `cycleThrow()` avanza en `order`.
2. **Coste + cargas + cooldown**: `const t=THROWABLES.types[h.throwSel]; if(h[chargeKey]<=0) return; if(!spendStam(h,t.stam)) return;`
   luego `h[chargeKey]--; h.throwCD=THROWABLES.cooldownMs/1000; h.throwWind=THROWABLES.windupMs/1000;`
   (windup breve: bloquea attack/move como el windup de ataque, mirror `atkAnim`; punible).
3. **Apuntado**: `const tgt=artTarget(h);` (reusa helper Pilar 12) ⇒ ángulo `a = tgt? atan2(tgt.y-h.y,tgt.x-h.x) : h.facing`.
4. **Spawn del proyectil (BORROW molde 2832)**:
   `G.projectiles.push({x:h.x+ca*18, y:h.y-2+sa*18, vx:ca*t.spd, vy:sa*t.spd, life:t.life, dmg:t.dmg, kind:t.kind, ang:a, aoe:t.aoe||0, burstFx:t.burstFx, col:t.col, infl:t.burn?{type:"burn",...t.burn}:null});`
   — el resto (colisión, `hitEnemy`, `applyStatus(burn)`, aoe, filtro `life>0`) ya está vivo en `sim.js:4399-4419`.
   El **cuchillo** (`infl:null`, recto) y la **bomba** (`infl:burn`, `aoe`) sólo se diferencian por datos del knob.
5. **Refill**: en el chequeo de transición de zona (junto a `flaskZone`, `sim.js:1959`) recargar
   `h.knifeCharges/h.bombCharges` a `types.*.charges` si `refillOnZone`; **BONFIRE** hook lo llama también.
6. **Tick**: `h.throwCD`/`h.throwWind` decrementan en el tick de update (mirror `h.atkCD`); transitorios.

`render/render.js` — 1 `kind:"knife"` + `kind:"firebomb"` en el switch de dibujo de proyectil (tinte/glyph
procedural, patrón de los kinds `bolt`/`rune`/`spear` existentes; **$0 asset**). Botón HUD táctil `tb.throwable`
(patrón `tb.weaponart` `render.js:3690`; se atenúa sin cargas / en cooldown; muestra el glyph del tipo activo).
`input.js` — 2 alias fijos gated (throw + cycle) tras el bloque WEAPON_ARTS.
`config.js` — el knob `THROWABLES`.

## Requisitos de calidad (NO negociables — idénticos a pilares 1-18)
1. **1 knob `THROWABLES`** con `enabled` (OFF ⇒ byte-idéntico a HEAD) + params por tipo tunables sin rebuild.
2. **RNG-neutral STRONG**: sin stream nuevo (spawn/geometría/timing 100% deterministas). srand ON==OFF 48-draw;
   `throwableFired` observable pero **0-draw** (sin `throwRng`). Sin tocar streams existentes.
3. **Save-neutral**: `h.throwSel` + `h.knifeCharges` + `h.bombCharges` + `h.throwCD` + `h.throwWind` transitorios
   (mirror `flaskCharges`/`atkCD`), **fuera del allowlist de save**; SAVE `save.v1` byte-id sin clave `throw*`.
4. **$0 arte**: reusar render de proyectil existente (tinte/glyph) + `burstFx:"flame"` + botón HUD procedural.
5. **Recurso escaso**: cargas limitadas por tipo, refill SÓLO por zona/hoguera (reusa seam FLASK/BONFIRE), NO infinito.
6. **Compone**: daño vía `hitEnemy` (defensas/backstab/afijos), burn vía `applyStatus`, aim vía LOCK_ON, coste vía spendStam.
7. **Móvil**: botón HUD `tb.throwable` (paridad touch) + affordance de ciclo.
8. **0 regresión**: OFF / sin lanzar ⇒ combate byte-id; 18 pilares vivos.

## Aceptación (harness `tools/cas1920-throwables.mjs`, PASS×2 byte-id)
- **AC0**: OFF ⇒ serialize + combate byte-id a HEAD (rama muerta; sin proyectil/refill/botón).
- **AC1**: sin lanzar ⇒ baseline intacto (combate byte-id, feel 18 pilares conservado).
- **AC2 cuchillo**: `throwItem()` con `throwSel=knife` ⇒ spawn proyectil recto `kind:"knife"`, viaja a `spd`,
  impacta enemigo ⇒ `hitEnemy` aplica `dmg`, `infl:null` (sin burn); gasta `stam` + 1 carga; cd bloquea re-lanzar.
- **AC3 bomba**: `throwSel=firebomb` ⇒ proyectil `kind:"firebomb"` con `aoe>0`; impacto aplica `burn` DoT
  (`applyStatus`) + daño de área; más caro (`stam` mayor) + menos cargas.
- **AC4 apuntado**: con `lockTarget` vivo ⇒ ángulo hacia el objetivo (artTarget); sin lock ⇒ ángulo = `h.facing`.
- **AC5 recurso**: cargas decrementan por lanzamiento; a 0 ⇒ no lanza; **cambio de zona / bonfire ⇒ refill a tope**
  (reusa seam flaskZone); NO refill infinito en la misma zona.
- **AC6 coste stamina**: lanzar gasta `stam` vía spendStam; vigor insuficiente ⇒ no lanza (0 cargas gastadas).
- **AC7 windup punible**: `throwWind>0` bloquea attack/move brevemente (comprometido, no instantáneo).
- **AC8 RNG**: srand ON==OFF 48-draw, `throwableFired` real 0-draw (sin `throwRng`).
- **AC9 SAVE**: `save.v1` byte-id sin clave `throw*` (todo transitorio).
- **AC10 REG**: 18 pilares vivos + core-loop 60fps + touch intactos.

## Deploy (conteo de blobs)
Contar blobs reales vía `git show --stat` del Build. Mínimo esperado: **config + sim + input + render**
(4 blobs — el proyectil se DIBUJA en render.js + botón HUD táctil `tb.throwable`, patrón WEAPON_ARTS 4 blobs).
NO mirror. md5 served==HEAD por blob. Si el render del proyectil resulta $0 (kind cae en un draw genérico), podrían
ser menos; el Build reporta el set exacto.

## Notas de ejecución / GOTCHAS heredados
- **REG zona-sensible**: los probes que matan enemigos (impacto de proyectil) contaminan loot RNG condicional a
  zona ⇒ correr con **héroe prístino del pueblo** ANTES de la regresión Bonfire (que reubica al héroe). Mismo
  patrón que CAS-1898/1904/1911/1917 (`armTown` antes de cada srand; Bonfire/EquipLoad/Two-Hand al final).
- **Refill vs zona-sensible**: el probe de refill debe cambiar de zona de forma controlada (mirror el probe de
  Estus flaskZone) sin disparar loot condicional.
- **Aim probe**: fijar `h.lockTarget` a un enemigo con posición conocida y verificar el ángulo del proyectil;
  luego `lockTarget=null` y verificar `h.facing`. Puro (0-draw).
- **QA live**: harness espejo de `tools/cas1914-weapon-arts-live-qa.mjs`; hooks `throw*` vía `import()` misma URL;
  md5 live==HEAD de TODOS los blobs; OFF byte-id; srand ON==OFF; save-neutral; PASS×2 desktop+mobile.
