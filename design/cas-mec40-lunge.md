# CAS-2156 — LUNGE / Estocada de Avance (mecánica #40)

**Primer verbo de MOVILIDAD-OFENSIVA anti-kite.** DARK build (`LUNGE.enabled:false`). Origen: recomendación **#2** del Audit v5 (CAS-2150, GO, 0 sev) — pick del CEO para #40. Baseline live `04486d8c3b84/799` (post-#39 Deflect, `DEFLECT.enabled:true`). **39 mecánicas Souls-like VIVAS.**

## 0. Gate de secuencia — CONFIRMACIÓN DE NO-SOLAPE (paso obligatorio del issue)

El Audit v5 (CAS-2150) publicó el mapa de las **39 mecánicas vivas** (`STACK COHESIVE: YES`, 0 hallazgos > sev-4). Auditado el verbo Estocada/Lunge contra el kit de MOVILIDAD y de OFENSIVA — **NO se solapa** con ninguna mecánica live:

| Mecánica live | Eje / disparador | ¿Solapa con Estocada #40? |
|---|---|---|
| **Esquiva / Rodada (DODGE, i-frames)** | movilidad **DEFENSIVA**: i-frames niegan daño, 0 daño, banda reactiva; consume `STAMINA.cost.dodge` | **No — es su OPUESTO exacto.** DODGE = defensa (i-frames `h.iframe`, **0 daño**, evasión reactiva). LUNGE = **ofensa** (daño ×`dmgMul`, **SIN i-frames** ⇒ vulnerable, compromiso proactivo). Ejes distintos; LUNGE NO puede reemplazar al roll (no da i-frames) ⇒ el roll defensivo sigue siendo obligatorio. |
| **Ataque Cargado / Charged #37** | hold-release ESTACIONARIO con híper-armadura; el héroe NO se mueve | **No.** CHARGED = commit estacionario que ABSORBE (híper-armadura) y pega pesado en el sitio. LUNGE = commit que **CIERRA DISTANCIA** (dash) sin híper-armadura (vulnerable). Uno aguanta y golpea fuerte; el otro persigue. |
| **Empujón / Rompe-Guardia #38** | patada CORTA 52px anti-turtle, drena postura, estacionaria | **No.** GUARD_BREAK = utilidad melee-adyacente (52px, dmg 5, rompe guardia) SIN desplazamiento. LUNGE = gap-closer de **alcance largo** (dash 118px + golpe) contra un enemigo que HUYE, no que turtlea. |
| **Reflejo de Proyectil / Deflect #39** | ventana de parry ⇒ invierte un proyectil entrante | **No.** DEFLECT = respuesta reactiva anti-**ranged** (convierte SU proyectil). LUNGE = iniciativa PROACTIVA anti-**kite** (persigue al tirador/caster para negarle la distancia). Complementarios: deflect castiga el disparo, lunge cierra para que no vuelva a disparar. |
| **Arte de Arma (dagger dash) #WEAPON_ARTS** | dash-a-objetivo **por-arquetipo** (sólo daga), gated `WEAPON_ARTS.enabled` | **No.** El Arte de dash es una firma de UN arquetipo (daga), cooldown propio, con auto-target/lock. LUNGE es un verbo **UNIVERSAL** del kit base (toda clase), direccional a `facing`, sin auto-snap, con su propio coste/recuperación. |
| **Embestida enemiga (ENEMY_ABILITIES A1)** | IA: un mob embiste al héroe | **No** — dueño ENEMIGO. El héroe no tenía equivalente proactivo. LUNGE llena ese hueco del lado del jugador. |

**Nicho genuinamente ausente:** hoy el héroe NO tiene ninguna respuesta de **movilidad OFENSIVA**. Toda la movilidad es defensiva (roll con i-frames) o reactiva (deflect). Contra un enemigo que **retrocede/kitea** o un caster que pelea a distancia, el kit sólo ofrecía *perseguir caminando* (misma velocidad ⇒ nunca alcanza) o *rodar* (defensivo, no daña). LUNGE aporta el **gap-closer ofensivo universal** anti-kite. **Sin solape ⇒ construir.**

## 1. La mecánica (1 línea)

Ataque COMPROMETIDO que **traslada al héroe hacia adelante** (dash direccional con un golpe de estocada de cono estrecho) para castigar a un enemigo que retrocede/kitea o cerrar sobre un caster — **sin i-frames** (a diferencia del roll), con coste de estamina y una ventana de recuperación (whiff = vulnerable).

## 2. Restricciones DURAS (idénticas a #31–#39) — cumplidas

- **$0 arte / $0 motor nuevo:** reusa el **vector de impulso del roll** (`moveEnt` + patrón `h.rollX/rollSpd`, aquí `h._lungeVx/_lungeSpd`), el hitbox melee (`applyHeroMelee`, con `_mcfg` sintetizado de cono estrecho/alcance largo), STAMINA (`spendStam`), el sprite de swing + estela/anillo de dash (`addFx("swing"/"dodgering"/"slashArc")`). VFX = floater `STR.lunge` + primitivas existentes. Sin assets nuevos.
- **Config/lógica-only**, knob `LUNGE.enabled` default **false, DARK-by-default**.
- **RNG-neutral STRONG:** geometría/aritmética pura (cos/sin/hypot/atan2), **0 draws**, NO existe `lungeRng`. El golpe pasa por el MISMO `hitEnemy` que un swing normal ⇒ 0 draw NUEVO. srand ON==OFF byte-id (32-draw fingerprint, `lungeSrandFp`) — AC7.
- **Save-neutral:** todo el estado es transitorio con prefijo `_` (`_lunge`, `_lungeT`, `_lungeCd`, `_lungeSpd`, `_lungeVx/_lungeVy`) — FUERA del allowlist explícito de `serializeSave()` (objeto-literal, sim.js:1890) ⇒ save.v1 byte-id ON/OFF, **sin clave** `lunge*` — AC6.
- **OFF-path byte-id:** `enabled:false` ⇒ el input está gated (`input.js`), `lungeStrike()` retorna en el 1er gate, `h._lunge` nunca se arma ⇒ `lunge=false` en `applyHeroMelee` (×1, `_mcfg` normal), la rama de dash-movement nunca se entra (`_lungeT` nunca se setea), el timer `_lungeCd` gated, el botón móvil ausente ⇒ **byte-idéntico al HEAD previo** (0-regresión de las 39 mec vivas; cohesion audit sigue PASS) — AC4.
- **Reversible** en 1 línea (`enabled:true→false`).
- **ANTI-DEGENERADO:** (a) coste de estamina real `staminaCost 16` (> dodge 25? no — deny sin vigor); (b) ventana de recuperación `recoverMs 520` (`h._lungeCd`) ⇒ **no spammeable / no gap-closer infinito**; (c) `dmgMul 1.3` deliberadamente **sub-counter** (< dodge-counter 1.5, < charged 1.7) ⇒ es **reposición + castigo, NO burst** — nunca one-shot; (d) **SIN i-frames** ⇒ NO reemplaza al roll defensivo (el whiff deja vulnerable; durante el dash el roll está bloqueado ⇒ no hay cancel-a-i-frames); (e) `distance 118` **cap de distancia razonable** (gap-closer acotado, sólo ~1.3× el roll).
- **Encaja arena top-down 2D:** puro XY (dash direccional a `h.facing`), sin eje Z/verticalidad.
- **Sin colisión de teclas:** `key:"Backslash"` — code LIBRE grep-verificado (las 26 letras rebindeables + fijas Semicolon/Quote/Slash/Brackets/Comma/Period/KeyN/KeyE ya ocupadas; Backslash NO listado como ocupado en input.js:324/338). NO rebindable (deliberate, como KeyH parry ⇒ `REBINDS`/`settings.binds` byte-id). Móvil = botón HUD `tb.lunge`.

## 3. Tecla / colisión — Gate

`LUNGE.key = "Backslash"` (`\`). Desktop: TAP en el edge (`input.js`, gated `LUNGE.enabled` ⇒ OFF inerte, falls-through, no toca `REBINDS`/`settings.binds` ⇒ snapshot byte-id). Móvil: botón HUD `tb.lunge` (present-only `LUNGE.enabled` ⇒ undefined OFF ⇒ layout byte-id; mirror `tb.guardbreak`), se atenúa durante `_lungeCd`. El Códice de Combate gana la entrada **"Estocada de Avance"** bajo *Ofensiva*, `keyOf: LUNGE.key`, gated `LUNGE.enabled` (descubrible in-game al flip).

## 4. Seams (5 blobs — mirror GUARD_BREAK #38)

| Seam | Archivo | Qué |
|---|---|---|
| A knob | `sim/config.js` | `LUNGE{enabled:false,key,distance,dashMs,range,arcDeg,dmgMul,staminaCost,recoverMs,requiresMelee}` + entrada del Códice bajo *Ofensiva* |
| B verbo | `sim/sim.js` | `lungeStrike()` — gate (mirror `guardBreakKick`/`weaponArt`) + `spendStam` + arma dash (`_lungeT/_lungeSpd/_lungeVx/_lungeVy`, SIN i-frames) + arma swing (`_mcfg` sintetizado cono estrecho + `_lunge=true` + `atkT`) |
| C dash-move | `sim/sim.js` | rama `else if` en la sección de movimiento (4757): `_lungeT>0` ⇒ `moveEnt` hacia adelante, decae `_lungeT`; OFF ⇒ rama muerta. + timer `_lungeCd` (gated) + gate anti-cancel en `doRoll` |
| D dmg | `sim/sim.js` | `applyHeroMelee`: `const lunge=LUNGE.enabled&&h._lunge` ⇒ `dmg ×(lunge?LUNGE.dmgMul:1)`; `_lunge=false` limpiado en heroAttack/heavyAttack/weaponArt (mirror `_charged`). OFF ⇒ ×1 ⇒ byte-id |
| input | `input.js` | keydown `LUNGE.key` gated ⇒ `sim.lungeStrike()`; botón móvil `tb.lunge`; import `LUNGE` |
| string | `strings.js` | `STR.lunge="¡ESTOCADA!"` (floater del dash, $0 arte) |
| render | `render/render.js` | `if(tb.lunge) btn(...)` — atenúa durante `_lungeCd` (mirror `tb.guardbreak`) |
| dev | `sim/sim.js` | `dev.lungeProbe` (driva el loop real: dash + golpe) + `dev.lungeSrandFp` (fingerprint 0-RNG) para la QA observable |

## 5. Números observables (knob)

`distance 118` px (> roll 92; gap-closer acotado) · `dashMs 150` ⇒ vel ≈ 787 px/s · `range 60` px + `arcDeg 70` (cono ESTRECHO = estocada, no barrido) · `dmgMul 1.3` (sub-counter, no burst) · `staminaCost 16` · `recoverMs 520` (no spam) · `requiresMelee false` (universal). Observable: héroe se DESPLAZA ~118px hacia `facing`, golpea al enemigo en el camino ×1.3, gasta 16 estamina, no puede re-lunge ni rodar durante ~0.52s, y NO gana i-frames (un golpe entrante durante el dash SÍ conecta) ⇒ prueba compromiso/vulnerabilidad. OFF ⇒ tecla inerte, héroe no se desplaza, 0 estado.

## 6. QA / DoD

Harness DOM-free/browser `tools/cas2156-lunge-live-qa.mjs` — DRIVE el loop real vía dev probes desk+móvil. **PASS×2 + determinism:**
- **AC0 META** (enabled DARK, knobs) · **AC1 DASH** (héroe se traslada ~distance hacia facing; posición cambia) · **AC2 STRIKE** (golpe ×dmgMul conecta al enemigo en el camino; daño observable) · **AC3 NO-IFRAMES** (`h.iframe` NO se arma durante el dash ⇒ un golpe entrante daña al héroe — prueba vulnerabilidad, distingue del roll) · **AC4 OFF byte-id** (tecla inerte, sin desplazamiento, sin estado) · **AC5 COST+RECOVERY** (estamina 16 gastada; `_lungeCd` bloquea re-lunge; sin vigor ⇒ deny) · **AC6 SAVE byte-id** (sin clave `lunge*`) · **AC7 0-RNG STRONG** (srand ON==OFF 32 draws) · **AC8 NO-REGRESSION** (swing normal + roll defensivo + los counters intactos) · determinism. Cohesion audit (39-mec) sigue PASS. Headline OBSERVABLE: floater `¡ESTOCADA!` + desplazamiento del héroe leído de `G.hero.x/y`.

**Cadena:** Build DARK (este commit) → **Deploy DARK (GE, overlay gh-pages)** → **QA OBSERVABLE desk+móvil PASS×2 (QA b5c10283)** → **Gate CEO** (verify byte live==QA-proven, flip 1 línea `enabled:false→true`, deploy overlay, post-flip QA). Entonces #40 VIVA = primer verbo de movilidad-ofensiva anti-kite universal.
