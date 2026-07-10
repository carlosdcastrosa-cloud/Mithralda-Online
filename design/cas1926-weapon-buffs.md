# CAS-1926 — EVO Pilar 20: Resinas / Buffs de Arma (Weapon Grease)

**Umbrella:** [CAS-1926](/CAS/issues/CAS-1926) · **Autor:** CTO · **Fecha:** 2026-07-10
**Cadena:** Build → Deploy → QA (PASS×2 live) → Gate CEO. Umbrella cierra por `children_completed`.

## Objetivo (1 frase)
Pareja natural del recién-shippeado Pilar 19 Consumibles Arrojadizos (tema **consumibles**): un consumible
que **unta el arma** con un buff temporal (elemental / afilado) por una ventana corta, empujando al jugador a
**preparar el arma antes de un jefe/élite** — decisión de recurso escaso, alto skill-expression — **100% BORROW**
sobre los seams vivos (sink de daño melee `applyHeroMelee`, status `burn`/`slow` vía `applyStatus`, refill-por-zona
tipo Estus/BONFIRE, coste sin RNG), **sin arte, sin save nuevo, sin RNG nuevo**.

## Restricciones de diseño (por qué este seam)
- **Compone MULTIPLICATIVAMENTE en el MISMO sink de daño melee** (`sim.js:2095`):
  `dmg = equippedDmg(h)*cfg.dmgMul*(fin?…)*(heavy?…)*(th?TWO_HAND.dmgMul:1)*wa.dmgMul*wart.dmgMul` — el buff añade
  **`*buffMul(h)` como ÚLTIMO factor** ⇒ compone después de `TWO_HAND` (15) × `WEAPON_ARCHETYPES` (17) ×
  `WEAPON_ARTS` (18); ninguno pisa al otro. Los afijos de arma (`WEAPON_AFFIXES`) y `FRENZY` (`sim.js:2153`) ya
  multiplican sobre el mismo `dmg` ⇒ el buff los compone también. **No bypassa poise ni i-frames** (es un factor
  sobre el golpe que YA pasó el gating de `hitEnemy`; melee-only — ranged/nova no pasan por `applyHeroMelee`).
- **Elemento vía status existente** (`sim.js:2238` `applyStatus(e,"burn",…)` ya lo usa el boon Sangre de Brasa y el
  afijo Ardiente `sim.js:2302`): la **Resina Ardiente** reusa el DoT `burn`; la **Escarcha** reusa el `slow`
  (`applyStatus(e,"slow",…)`, mismo status que los mobs infligen `sim.js:3663`). Rama gateada en `hitEnemy` tras el
  bloque de afijos/boons ⇒ compone, no reemplaza. **$0 status nuevo.**
- **Recurso escaso** — reusa el seam de refill-por-zona de FLASK/Estus (`h.flaskZone` en `sim.js:1970`, refill al
  cambiar de zona) + **BONFIRE** (`sim.js:3187`, hook ya presente junto al refill de arrojadizos). Las cargas de
  resina recargan SÓLO al cambiar de zona / descansar en hoguera. **NO infinito.** (Espejo exacto de `refillThrowables`.)
- **$0 arte** — el buff activo tinta el sprite del héroe reusando el tinte de status existente (`tint` del knob por
  tipo, patrón de los tintes `burn`/`frost` ya dibujados); botón HUD procedural. **Sin sprites nuevos.**

## Tecla (DESVÍO justificado, FEEL/CEO-tunable)
26 letras + `Semicolon` (WEAPON_ARTS P18) + `ShiftRight` (TWO_HAND P15) + `KeyH` (Parry P10) + `Quote`/`Slash`
(THROWABLES P19) ocupadas. **Defaults propuestos: `applyKey:"BracketRight"` (`]`) + `cycleKey:"BracketLeft"` (`[`)** —
ambos CODEs LIBRES, par adyacente alcanzable por meñique derecho. Patrón idéntico a CAS-1895/1914/1920: **alias fijo
gated** en `input.js` (`if(code===WEAPON_BUFFS.applyKey && WEAPON_BUFFS.enabled){ sim.applyWeaponBuff(); return; }` +
análogo cycle), **NO rebindable** (nunca toca `REBINDS`/`settings.binds` ⇒ snapshot byte-id). **Tecla = decisión
FEEL/CEO**, tunable sin rebuild. Simple (petición CEO): 1 tecla aplica el tipo seleccionado, 1 tecla cicla el tipo.

## Knob (1 config `WEAPON_BUFFS`, config-tunable sin rebuild)
```js
export const WEAPON_BUFFS = {
  enabled: true,
  applyKey: "BracketRight",   // ] — aplica la resina seleccionada; alias fijo gated, FEEL/CEO-tunable
  cycleKey: "BracketLeft",    // [ — cicla el tipo de resina seleccionado
  applyMs: 400,               // windup de aplicación (unta el arma, breve, punible); transitorio h.applyBuffT, mirror flaskDrinkT
  refillOnZone: true,         // recarga cargas al cambiar de zona (reusa seam flaskZone) + BONFIRE
  order: ["ember","whet","frost"],   // orden del ciclo
  // Números = FEEL/CEO, tunables sin rebuild.
  types: {
    // Resina Ardiente: +daño moderado + añade DoT burn en cada golpe melee (reusa afijo Ardiente). Contra hordas/DoT.
    ember: { name:"Resina Ardiente",  charges:2, buffS:20, dmgMul:1.15, element:"burn",  burn:{dmg:5},          tint:"#ff7a3c" },
    // Piedra de Afilar: +daño físico PURO alto, sin elemento. La opción de daño crudo para un jefe.
    whet:  { name:"Piedra de Afilar", charges:3, buffS:25, dmgMul:1.35, element:null,                            tint:"#dfe7f2" },
    // Escarcha: +daño leve + aplica slow (reusa STATUS.slow) ⇒ control. Contra élites móviles.
    frost: { name:"Escarcha",         charges:2, buffS:18, dmgMul:1.10, element:"frost", slow:{mul:0.6,dur:1.5}, tint:"#7fd3ff" },
  },
};
```

## Seam plan (100% BORROW — dónde toca)
`sim/config.js` — el knob `WEAPON_BUFFS`.

`sim/sim.js`:
1. **Estado transitorio** (`createHero`, junto a `throwSel`/`flaskCharges`, FUERA del allowlist de save):
   `buffSel:WEAPON_BUFFS.order[0]`, cargas por tipo `emberCharges/whetCharges/frostCharges` (mapa
   `BUFF_CHARGE_KEY`, espejo de `THROW_CHARGE_KEY`), `_wbuff:null` (tipo activo), `wbuffT:0` (segundos restantes),
   `applyBuffT:0` (windup), `buffZone:null` (detecta refill).
2. **Reset al arrancar run** (`enterPlay`, junto a `if(THROWABLES.enabled)` `sim.js:1574`):
   `if(WEAPON_BUFFS.enabled){ refillBuffs(h); h.buffSel=WEAPON_BUFFS.order[0]; h._wbuff=null; h.wbuffT=0; h.applyBuffT=0; h.buffZone=null; }`
3. **`buffMul(h)` helper gated** — `return (WEAPON_BUFFS.enabled && h._wbuff && h.wbuffT>0) ? WEAPON_BUFFS.types[h._wbuff].dmgMul : 1;`
   OFF / sin buff ⇒ `1` ⇒ byte-idéntico.
4. **Sink de daño** (`applyHeroMelee` `sim.js:2095`): append **`*buffMul(h)`** como último factor. Melee-only.
5. **Elemento on-hit** (`hitEnemy`, rama gateada TRAS el bloque de afijos/boons `sim.js:~2238`, sólo `opt&&opt.melee`):
   `if(WEAPON_BUFFS.enabled && G.hero && G.hero._wbuff && G.hero.wbuffT>0){ const t=WEAPON_BUFFS.types[G.hero._wbuff];
   if(t.element==="burn") applyStatus(e,"burn",{dmg:t.burn.dmg}); else if(t.element==="frost") applyStatus(e,"slow",{...t.slow}); }`
   Reusa STATUS vivos ⇒ compone (no reemplaza), no bypassa poise/i-frames.
6. **`applyWeaponBuff()` exportado gated** — escena play + héroe vivo + no ocupado (mirror gate del Estus
   `h.flaskDrinkT`/`h.applyBuffT<=0`) + `h[chargeKey]>0` ⇒ `h[chargeKey]--; h._wbuff=h.buffSel;
   h.wbuffT=t.buffS; h.applyBuffT=WEAPON_BUFFS.applyMs/1000;` (re-aplicar cambia/refresca el buff, gasta 1 carga).
   Sin carga ⇒ no aplica.
7. **`cycleBuff()` exportado gated** — avanza `h.buffSel` en `WEAPON_BUFFS.order`.
8. **Windup punible** — `(WEAPON_BUFFS.enabled&&h.applyBuffT>0)` añadido a los gates de attack/heavy/art/throw
   (`sim.js:2022,2065,3486` + gate de `throwItem`) + root de movimiento breve (mirror `flaskDrinkT`).
9. **Refill** (`refillBuffs(h)` espejo de `refillThrowables` `sim.js:3517`): llamado en la transición de zona
   (`sim.js:1970`, junto a `flaskZone`/`throwZone`) + **BONFIRE** hook (`sim.js:3187`).
10. **Tick** — `h.wbuffT`/`h.applyBuffT` decrementan en el tick de update (mirror `flaskDrinkT`/`throwWind`);
    al llegar `wbuffT<=0` limpiar `h._wbuff=null`. Transitorios.

`input.js` — 2 alias fijos gated (apply + cycle) tras el bloque THROWABLES (`input.js:297`); `preventDefault`
incluye los CODEs (`input.js:128`). Botón HUD táctil `tb.weaponbuff` (patrón `tb.weaponart`/`tb.throwable`).

`render/render.js` — tinte/glow del sprite del héroe cuando `h._wbuff` activo (reusa `type.tint`, patrón de los
tintes de status; **$0 asset**). Botón HUD `tb.weaponbuff`: glyph del tipo activo + anillo de duración `wbuffT`,
atenuado sin cargas.

## Requisitos de calidad (NO negociables — idénticos a pilares 1-19)
1. **1 knob `WEAPON_BUFFS`** con `enabled` (OFF ⇒ byte-idéntico a HEAD) + params por tipo tunables sin rebuild.
2. **RNG-neutral STRONG**: buff 100% determinista, **0 draws** (sin `buffRng`; sin drop de resinas en v1 — cargas
   fijas refilladas por zona). srand ON==OFF 48-draw; `weaponBuffApplied` observable pero **0-draw**. Sin tocar streams existentes.
3. **Save-neutral**: `buffSel`/`emberCharges`/`whetCharges`/`frostCharges`/`_wbuff`/`wbuffT`/`applyBuffT`/`buffZone`
   transitorios (mirror `flaskCharges`/`throwSel`/`atkCD`), **fuera del allowlist de save**; `save.v1` byte-id sin
   clave `buff*`/`wbuff*`. (NO `mithralda.weaponbuffs.v1` en v1 — inventario in-run; persistencia = pilar futuro.)
4. **$0 arte**: tinte de status existente + botón HUD procedural + status `burn`/`slow` vivos.
5. **Recurso escaso**: cargas limitadas por tipo, refill SÓLO por zona/hoguera (reusa seam FLASK/BONFIRE), NO infinito.
6. **Compone MULTIPLICATIVAMENTE**: `buffMul` último factor en `applyHeroMelee` ⇒ compone con TWO_HAND × ARCHETYPES ×
   ARTS × AFFIXES × FRENZY; elemento vía `applyStatus` compone (no reemplaza); no bypassa poise/i-frames.
7. **Móvil**: botón HUD `tb.weaponbuff` (paridad touch) + affordance de ciclo.
8. **0 regresión**: OFF / sin aplicar ⇒ combate byte-id; 19 pilares vivos.

## Aceptación (harness `tools/cas1926-weapon-buffs.mjs`, PASS×2 byte-id)
- **AC0**: OFF ⇒ serialize + combate byte-id a HEAD (rama muerta; sin `buffMul`/elemento/refill/botón).
- **AC1**: sin aplicar ⇒ baseline intacto (combate byte-id, feel 19 pilares conservado).
- **AC2 ember**: `applyWeaponBuff()` con `buffSel=ember` ⇒ swing melee ×1.15 dmg (vía `buffMul` en el sink) + cada
  golpe aplica `burn` DoT (`applyStatus`); gasta 1 carga; `wbuffT` cuenta atrás; al expirar `_wbuff=null`.
- **AC3 whet**: `buffSel=whet` ⇒ dmg ×1.35 PURO (sin elemento; `applyStatus` NO se llama por el buff); más cargas.
- **AC4 frost**: `buffSel=frost` ⇒ dmg ×1.10 + aplica `slow` (`applyStatus(e,"slow")`, mismo status que mobs).
- **AC5 compone**: buff ×TWO_HAND ×ARCHETYPE ×ART multiplicativo en el MISMO golpe (p.ej. greatsword+twoHand+whet
  ⇒ producto de los 4 factores, ninguno pisa); afijo/FRENZY siguen sumando; poise/i-frames intactos (no bypass).
- **AC6 recurso**: cargas decrementan por aplicación; a 0 ⇒ no aplica; **cambio de zona / bonfire ⇒ refill a tope**
  (reusa seam flaskZone/BONFIRE); NO refill infinito en la misma zona.
- **AC7 windup punible**: `applyBuffT>0` bloquea attack/heavy/art/throw + root breve (comprometido, no instantáneo).
- **AC8 RNG**: srand ON==OFF 48-draw, `weaponBuffApplied` real 0-draw (sin `buffRng`).
- **AC9 SAVE**: `save.v1` byte-id sin clave `buff*`/`wbuff*` (todo transitorio).
- **AC10 REG**: 19 pilares vivos + core-loop 60fps + touch intactos.

## Deploy (conteo de blobs)
Contar blobs reales vía `git show --stat` del Build. Mínimo esperado: **config + sim + input + render**
(4 blobs — el buff tinta el sprite en render.js + botón HUD táctil `tb.weaponbuff`, patrón THROWABLES/WEAPON_ARTS
4 blobs). NO mirror. md5 served==HEAD por blob. El Build reporta el set exacto.

## Notas de ejecución / GOTCHAS heredados
- **REG zona-sensible**: los probes que matan enemigos (buff + golpe) contaminan loot RNG condicional a zona ⇒
  correr con **héroe prístino del pueblo** ANTES de la regresión Bonfire (que reubica al héroe). Mismo patrón que
  CAS-1898/1904/1911/1917/1924 (`armTown` antes de cada srand; Bonfire/EquipLoad/Two-Hand/Arch/Arts al final).
- **Compose probe**: aislar `buffMul=OFF` vs `ON` con el MISMO arma (para que `equippedDmg`/`gearStat` se cancele);
  verificar el producto exacto de factores encadenando twoHand+arch+art+buff sobre el mismo golpe.
- **Refill probe**: cambiar de zona de forma controlada (mirror el probe de Estus/arrojadizos) sin disparar loot condicional.
- **Windup vs otros gates**: `applyBuffT` es un windup NUEVO que se añade a los gates existentes (attack/heavy/art/throw).
  GOTCHA heredado (CAS-1924): dejar un windup `>0` tras un probe bloquea REG posteriores con el MISMO héroe ⇒
  **limpiar `applyBuffT`/`wbuffT`/`_wbuff` al final de cada probe** antes de la regresión.
- **QA live**: harness espejo de `tools/cas1920-throwables-live-qa.mjs` (`tools/cas1926-weapon-buffs-live-qa.mjs`);
  hooks `buff*` vía `import()` misma URL; md5 live==HEAD de TODOS los blobs; OFF byte-id; srand ON==OFF; save-neutral;
  PASS×2 desktop+mobile.
