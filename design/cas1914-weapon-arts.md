# CAS-1914 — EVO Pilar 18: Artes de Arma / Weapon Arts ("Ash of War")

**Umbrella:** [CAS-1914](/CAS/issues/CAS-1914) · **Autor:** CTO · **Fecha:** 2026-07-10
**Cadena:** Build → Deploy → QA (PASS×2 live) → Gate CEO. Umbrella cierra por `children_completed`.

## Objetivo (1 frase)
Cada **arquetipo de arma** (Pilar 17 `heroArch()`) gana un **Arte de Arma firma** —
un movimiento especial dedicado, con coste de estamina y cooldown, cuyo efecto escala por
arquetipo activo. Profundiza la identidad de build **100% BORROW** sobre los seams vivos
(arquetipo, hyperarmor, dash/roll, backstab, two-hand, estamina) — **sin arte, sin save nuevo,
sin RNG nuevo**.

## Restricciones de diseño (por qué este seam)
- **Compone sobre Pilar 17** (`heroArch(h)` en `sim.js:3419`) — el arte lee la clase de arquetipo
  y despacha su variante. `sword` = baseline útil, no dominante.
- **Compone sobre Pilar 16 Hyperarmor** (`sim.js:4302`, `h.hyperarmor` derivado de `(h._heavy||h._comboFin)&&h.atkAnim>0`)
  — el greatsword Art REUSA esa ventana extendiéndola con un flag `h._art`.
- **Compone sobre Pilar 6 Backstab** (`sim.js:2214`, arco rear `BACKSTAB.rearArcDeg`) — el dagger Art
  reposiciona al héroe detrás del objetivo ⇒ el swing subsiguiente entra en el arco rear ⇒ auto-backstab.
- **Compone sobre Pilar 8 Estamina** (`spendStam` `sim.js:1907`) — cada Art gasta vigor vía `spendStam`
  (OFF ⇒ `true` byte-id).
- **Compone sobre Pilar 15 Two-Hand** — los muls del Art se aplican DENTRO de `applyHeroMelee`/`hitEnemy`,
  que ya multiplican `heroArch` × `TWO_HAND` ⇒ el Art compone multiplicativo sin pisar fórmulas.

## Tecla (DESVÍO justificado, FEEL/CEO-tunable)
**TODAS las 26 letras están ocupadas** (WASD move, J attack, N heavy, H parry, U flask, Space roll,
ShiftL block, ShiftR two-hand, Tab lock-on, E interact, F pickup, Q/R consumibles, Z/X abilities,
C ultimate, K/Y/L/T/V/B/G/I/M/O/P paneles/pociones). Ver `settings.js:26` REBINDS + aliases fijos en
`input.js:250-287`.

**Default propuesto: `key:"Semicolon"`** (`;`, a la derecha de L — alcanzable por meñique derecho,
cluster de combate J/K/L/H/N/U). Es un CODE libre (no en REBINDS ni en aliases fijos). Patrón idéntico a
CAS-1895 (spec pedía KeyH, ocupada ⇒ ShiftRight). **Número/tecla = decisión FEEL/CEO**, tunable sin rebuild.
Alias fijo gated (`if(code===WEAPON_ARTS.key && WEAPON_ARTS.enabled){ sim.weaponArt(); return; }`), NO
rebindable (como parry/flask/two-hand: nunca toca `REBINDS`/`settings.binds` ⇒ snapshot byte-id).

## Knob (1 config `WEAPON_ARTS`, config-tunable sin rebuild)
```js
export const WEAPON_ARTS = {
  enabled: true,
  key: "Semicolon",       // alias fijo gated; FEEL/CEO-tunable
  cooldownMs: 2500,       // cooldown COMPARTIDO por-arte (transitorio h.artCD, NO save)
  // efecto por arquetipo (heroArch class). Números = FEEL/CEO, tunables sin rebuild.
  classes: {
    // Golpe de Carga: overhead comprometido, ventana hyperarmor (reusa Pilar 16), poise masivo.
    greatsword: { name:"Golpe de Carga",      stam:35, windupMul:1.6, dmgMul:1.8, poiseDmgMul:2.2, hyperarmor:true },
    // Filo Sombrío: dash corto que reposiciona DETRÁS del objetivo ⇒ setup auto-backstab (Pilar 6). Barato.
    dagger:     { name:"Filo Sombrío",        stam:12, dashDist:70, dmgMul:0.9, autoBackstab:true },
    // Estocada Perforante: reach↑↑ arco estrecho, atraviesa al frente. Espaciado.
    spear:      { name:"Estocada Perforante",  stam:20, reachMul:1.8, arcMul:0.4, dmgMul:1.2, pierce:true },
    // Tajo Circular: giro arco completo, equilibrado — baseline útil sin dominar.
    sword:      { name:"Tajo Circular",        stam:22, arcMul:2.0, dmgMul:1.0, poiseDmgMul:1.2 },
  },
};
```

## Seam plan (100% BORROW — dónde toca)
`sim.js` — nueva función exportada `weaponArt()` gated en `WEAPON_ARTS.enabled` + escena play + héroe vivo + `h.artCD<=0`:
1. **Despacho por arquetipo**: `const cls = heroArch===... ` → resolver clase vía el MISMO mapa que Pilar 17
   (`weaponArchetype(h)` ya deriva la clase; exponer/derivar el nombre de clase para indexar `WEAPON_ARTS.classes`).
   OFF ⇒ rama muerta byte-id; sin arma / `w_iron` ⇒ `sword`.
2. **Coste + cooldown**: `if(!spendStam(h, art.stam)) return;` luego `h.artCD = WEAPON_ARTS.cooldownMs/1000`.
   `h.artCD` transitorio (mirror `h.atkCD`), decrementa en el tick de update del héroe; **fuera de la allowlist de save**.
3. **greatsword — Golpe de Carga**: arma un heavy con windup extendido (`h.atkAnim *= windupMul`), setea `h._art=true`
   ⇒ extiende el gate de `h.hyperarmor` (`sim.js:4302`) a `((...heavy)||(...finisher)||(WEAPON_ARTS.enabled&&h._art))`;
   `applyHeroMelee` lee `h._art` ⇒ `dmg*=art.dmgMul`, `opt.poiseDmgMul*=art.poiseDmgMul`. VFX = glow hyperarmor existente ($0).
4. **dagger — Filo Sombrío**: reusa la matemática de dash de `doRoll` (`sim.js:3421`) para desplazar `h.x/h.y` a
   `dashDist` px al lado OPUESTO del objetivo lock-on/más cercano (queda en su arco rear) ⇒ el siguiente swing dispara
   `backstab` natural (Pilar 6, `sim.js:2214`). VFX = estela de dash existente ($0). Bajo coste.
5. **spear — Estocada Perforante**: un swing con `opt.reachMul*=art.reachMul`, `opt.arcMul*=art.arcMul` (cono estrecho),
   `pierce` = no consume en el 1er hit (recorre el arco frontal). Reusa el sweep de `applyHeroMelee`. VFX = arco de swing existente.
6. **sword — Tajo Circular**: swing con `opt.arcMul*=art.arcMul` (360°/arco completo), `opt.poiseDmgMul*=art.poiseDmgMul`.
   VFX = arco de swing existente.

`input.js` — 1 alias fijo gated tras el bloque TWO_HAND (`input.js:285`).
`hud`/mobile — 1 botón HUD para la tecla del Arte (paridad touch, requisito #6). Preferir DOM/hud.js (patrón EQUIP_LOAD)
si es $0; si necesita render.js, es un blob más.

## Requisitos de calidad (NO negociables)
1. **1 knob `WEAPON_ARTS`** con `enabled` (OFF ⇒ byte-idéntico a HEAD) + params por clase tunables.
2. **RNG-neutral STRONG**: sin stream nuevo (dash/backstab/melee son 100% timing/aritmética). srand ON==OFF 48-draw;
   `weaponArtFired` observable pero 0-draw.
3. **Save-neutral**: `h.artCD` + `h._art` transitorios (mirror `h.atkCD`/`h._heavy`), **sin clave save nueva**;
   SAVE byte-id sin clave `art*`.
4. **$0 arte**: reusar VFX/estelas existentes (dash, hyperarmor glow, swing arcs).
5. **Compone multiplicativo** con TWO_HAND y arquetipo sin pisar fórmulas (los muls entran DENTRO de applyHeroMelee/hitEnemy).
6. **Móvil**: botón HUD para la tecla del Arte (paridad touch).
7. **0 regresión**: sin arma / arquetipo `sword`-baseline con Art no disparado / OFF ⇒ combate byte-id.

## Aceptación (harness `tools/cas1914-weapon-arts.mjs`, PASS×2 byte-id)
- **AC0**: OFF ⇒ serialize + combate byte-id a HEAD (rama muerta).
- **AC1**: sin arma / `w_iron`(sword) sin disparar Art ⇒ baseline intacto (combate byte-id, feel Pilar 17 conservado).
- **AC2 greatsword**: Golpe de Carga ⇒ hyperarmor ON durante windup (stun sub-umbral suprimido, daño aterriza) + poise×2.2 + dmg×1.8.
- **AC3 dagger**: Filo Sombrío ⇒ héroe reposicionado al arco rear del objetivo ⇒ swing siguiente `backstab=true` (×BACKSTAB.mult×archBackstabMul).
- **AC4 spear**: Estocada Perforante ⇒ reach efectivo ×1.8, arco estrecho ×0.4, pierce (>1 enemigo en línea).
- **AC5 sword**: Tajo Circular ⇒ arco ×2.0 golpea arco completo, dmg×1.0 (equilibrado).
- **AC6 coste/cooldown**: cada Art gasta `stam` vía spendStam (falla si vigor insuficiente); `h.artCD` bloquea re-disparo hasta expirar.
- **AC7 compone TWO_HAND**: greatsword+twoHand ⇒ dmg = base×archDmgMul×twoHandDmgMul×artDmgMul (multiplicativo, sin pisar).
- **AC8 RNG**: srand ON==OFF 48-draw, `weaponArtFired` real 0-draw (sin `weaponArtRng`).
- **AC9 SAVE**: byte-id sin clave `art*` (transitorio).
- **AC10 REG**: 17 pilares vivos + core-loop 60fps + touch intactos.

## Notas de ejecución / GOTCHAS heredados
- **REG zona-sensible**: los probes que matan enemigos (dagger backstab, hyperarmor) contaminan loot RNG condicional a
  zona ⇒ correr con **héroe prístino del pueblo** ANTES de la regresión Bonfire (que reubica al héroe). Mismo patrón que
  CAS-1898/CAS-1904/CAS-1911 (`_archArm` reemplaza `h.equip`; two-hand/equip-load al final).
- **`weaponArchetype(h)`** ya deriva la clase 0-draw desde `h.equip.weapon.defId` vía `byDefId`. El Art indexa la MISMA clase
  ⇒ no duplicar el mapa; si hay que exponer el nombre de clase, hacerlo en el mismo helper (append-only).
- **Deploy**: contar blobs reales vía `git show --stat` del Build (config+sim mínimo; +hud/render si el botón no es DOM-$0).
  NO mirror. md5 served==HEAD por blob.
```
