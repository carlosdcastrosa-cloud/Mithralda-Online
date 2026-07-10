# CAS-1879 — Hoguera / Rest Site (Bonfire) · Pilar 13 (capstone unificador)

**Umbrella:** CAS-1879 (CTO). Live baseline build `e28b97b15ab1` / 799 files (tras CAS-1873 Shield Block, 12º pilar).
**Cadena estándar CTO-umbrella:** Build (GE) → Deploy (CTO) → QA (PASS×2 desktop+mobile) → Gate CEO. Umbrella cierra por `children_completed`.

Este es el **13º pilar** y el **capstone** del bucle Souls-like: **UNIFICA** sistemas ya vivos — Frasco/Estus
(CAS-1854), Mancha de Sangre / corpse-run (CAS-1867) y el checkpoint/respawn existente. El descanso cura, recarga
Estus, fija el ancla de respawn y **repuebla los no-jefes de la zona** (el tradeoff clásico: recuperas recursos pero
el mundo vuelve). Sólo utilizable **en seguridad** (sin no-jefes en aggro cercano).

---

## Insight de diseño (BORROW máximo — verificado leyendo el código)

**La FUENTE ya es 90% de una hoguera.** La interacción de fuente/NPC de descanso YA cura HP/MP/estamina a tope Y
fija el ancla de respawn:

```
sim.js:3123  if(f){ const h=G.hero; h.hp=heroMaxHp(h); h.mp=h.maxMp; h.stam=STAMINA.max;
                    h.respawn={x:f.x,y:f.y+TS}; toast(STR.fountainRest); audio.sfx.heal(); return; }
sim.js:3130  ... h.respawn={x:n.x,y:n.y+TS};   // NPC de descanso, mismo patrón
```

`h.respawn` es EXACTAMENTE el ancla que consume el corpse-run de Mancha de Sangre (CAS-1867) y el respawn de muerte.
⇒ La Hoguera es una **fuente mejorada**: reusa `world.fountains` como sitios de descanso data-driven (ya colocados
en templos/entradas de zona), gateada por `BONFIRE.enabled`. Lo que la Hoguera AÑADE sobre la fuente:

1. **Recarga de Estus** — la fuente NO recarga frascos hoy; la hoguera sí (deja de depender sólo del cambio de zona).
2. **World reset determinista** — repuebla no-jefes de la zona (0 RNG).
3. **Gate de seguridad** — no descansar si un no-jefe está en aggro dentro de `safeRadius`.
4. **Llama procedural $0** en cada sitio (gateada ⇒ OFF byte-id).

Blast radius mínimo: extendemos UNA rama existente (`interact()` → descanso de fuente) en vez de introducir un
interactable nuevo. Reversibilidad alta: si el CEO quiere sitios de hoguera distintos de las fuentes, es un cambio de
knob barato (añadir `BONFIRE.sites[]`); el default reusa `world.fountains`.

---

## Seam (verificado leyendo el código, NO asumido)

Todos los ganchos ya existen; el pilar es aditivo y hard-gated tras `BONFIRE.enabled`.

| Pieza | Ubicación real | Uso |
|---|---|---|
| Descanso (heal + ancla) | `interact()` sim.js:3112 → rama fuente sim.js:3123 / NPC descanso 3130 | YA cura HP/MP/stam a tope + fija `h.respawn`. La hoguera **extiende esta rama** gateada por `BONFIRE.enabled`. |
| Ancla de respawn/checkpoint | `h.respawn={x,y}` (consumido por corpse-run CAS-1867 y respawn de muerte) | Reusar tal cual — la fuente ya lo fija; nada nuevo que persistir. |
| Recarga Estus | `FLASK` knob config.js:1193 (`charges:3`), refill de zona sim.js:1963 `h.flaskCharges=FLASK.charges` | Reusar la MISMA asignación: `if(FLASK.enabled) h.flaskCharges=FLASK.charges;` en el descanso. |
| Sitios data-driven | `world.fountains[]` (x,y por templo/zona) | Anclas de hoguera. Zona del sitio vía `zoneOf(world,f.x,f.y)`. |
| Enemigos de zona | `world.spawners[]` (`sp.rect`, `sp.types`, cap) sim.js:3459; `G.enemies` | Fuente de repoblación por zona. Reset = repoblar a cap **de forma determinista** (ver abajo). |
| Jefe vs no-jefe | `ETPL[type].boss:true` config.js:296+; `spawnChampion` sim.js:2429; enemigos taggean `e.isBoss` | **Excluir jefes** del reset (Souls: los jefes muertos NO revuelven). Filtrar `!e.isBoss`. |
| Rango de proximidad | `CFG.fountainRange:60` / `CFG.talkRange:56` config.js:58 | La hoguera reusa el rango de fuente para el prompt de descanso. |
| Tecla | `interact()` disparado por el bind de interact existente (**KeyE**) | **Reusa la tecla de interact** — NO nuevo bind global. Las 26 letras + Tab/Shift ya están tomadas; el descanso es una interacción de proximidad, no una acción global. `BONFIRE.key` queda reservado por si el CEO quiere un hotkey dedicado. |
| RNG seeded | `rng.js` (`srand/rr/ri`); spawners naturales SÍ usan `rr()/ri()` | **La hoguera NO abre stream nuevo** (`bonfireRng` PROHIBIDO). Reset 0-draw (ver Determinismo). |

---

## Determinismo del World Reset (la restricción crítica — RNG-neutral STRONG)

Los spawners naturales (sim.js:3459) usan `rr()` (posición) y `ri()` (tipo). Un reset que cree enemigos vía el
spawner **dibujaría RNG** ⇒ ON≠OFF. **PROHIBIDO.** El reset debe ser 0-draw. Enfoque canónico (elige GE el más
limpio contra el código real):

- **Preferido — restaurar roster de zona determinista.** Al descansar, para la zona del sitio: remover los no-jefes
  vivos y **re-crear a cap** desde las definiciones de spawner existentes con colocación DETERMINISTA:
  - posición: puntos derivados del `sp.rect` por índice (p.ej. reparto uniforme / centro + offset por índice), **sin `rr()`**.
  - tipo: `sp.types[i % sp.types.length]`, **sin `ri()`**.
  - hp/escala: `applyZoneScale` (aritmética pura, ya 0-RNG).
  Esto es "respawn determinista sobre spawns existentes" del issue: usa `sp.rect/types/cap` ya definidos, coloca sin dado.
- **Alternativa — snapshot/restore.** Snapshot del roster no-jefe al entrar a zona (o al último descanso); al descansar,
  remover vivos y restaurar el snapshot (copia de type+x/y). 0-draw.

**Regla dura:** cero `rr()/ri()/srand()` en la ruta de descanso/reset. La AC de QA mide **srand ON==OFF byte-idéntico
(0 draws)** en una probe aislada del descanso. Jefes (`e.isBoss` / `spawnChampion`) **excluidos** — no revuelven.
No tocar el spawner natural (mantiene su RNG idéntico ON y OFF).

---

## Gate de seguridad ("sólo en descanso, no en combate")

Antes de ejecutar el descanso: si **algún no-jefe** está dentro de `BONFIRE.safeRadius` **y en aggro** (mismo criterio
que usa el AI para perseguir), **denegar**: `toast(STR.bonfireUnsafe)` + `sfx.deny` (reusar el deny existente de
STAMINA CAS-1841), **sin** curar/recargar/resetear. Determinista (geometría pura, 0-RNG). En seguro ⇒ ejecuta el descanso.

---

## Knob (config.js, tras `SHIELD_BLOCK`)

```js
// CAS-1879: HOGUERA / REST SITE (Bonfire, 13º pilar · capstone que UNIFICA Estus+Mancha de Sangre+checkpoint).
// Descansar en un sitio seguro cura a tope, recarga Estus, fija el ancla de respawn y REPUEBLA los no-jefes de la
// zona (tradeoff Souls). enabled:false ⇒ build byte-idéntico al HEAD previo (la rama de fuente queda intacta).
export const BONFIRE = {
  enabled: true,
  key: "KeyE",           // reusa el interact de proximidad (fuentes); reservado para hotkey dedicado si el CEO lo pide
  healFull: true,        // HP/MP/stam a tope (la fuente ya lo hace; la hoguera lo garantiza)
  refillFlasks: true,    // recarga cargas de Estus reusando FLASK.charges (gated FLASK.enabled)
  respawnEnemies: true,  // world reset: repuebla NO-jefes de la zona, determinista 0-draw
  setCheckpoint: true,   // fija h.respawn al sitio (la fuente ya lo hace)
  safeRadius: 260,       // no descansar si un no-jefe en aggro está dentro de este radio (px)
  glowColor: "#ff9a3c",  // llama/glow procedural $0 en canvas
};
```

Números + enable = decisión de FEEL/BALANCE del CEO (retune = knob barato, mirror del patrón dash CAS-1814 /
stamina CAS-1841). El Gate GO lo emite el CEO tras verificación live.

---

## Guardrails NO-NEGOCIABLES (patrón EVO estándar)

- **`$0 arte`** — llama/glow procedural en canvas (sin(G.t)+radial gradient), sin assets nuevos. Gateado ⇒ OFF byte-id.
- **RNG-neutral STRONG** — sin stream `bonfireRng`; reset determinista sobre spawns existentes ⇒ **srand ON==OFF
  byte-idéntico (0 draws)**. AC de verificación.
- **OFF byte-idéntico** — `enabled:false` ⇒ build idéntico al HEAD previo (`e28b97b15ab1`). Todo añadido va dentro de
  `if(BONFIRE.enabled){…}`; strings gateados/aditivos; render de llama gateado.
- **Save aislado** — el ancla reusa `h.respawn` (transitorio, ya en save.v1). Si hiciera falta persistir sitios
  activados, `mithralda.bonfire.v1` propio y aditivo (ausente ⇒ save.v1 byte-id). **Preferible transitorio** (el ancla
  reusa el checkpoint existente ⇒ sin store nuevo).
- **No romper Arena / zonas endgame / ciclo APEX** — el reset se suprime en `G.arenaMode` (mirror del spawner natural
  sim.js:3459 que ya hace `if(!G.arenaMode)`); jefes/`spawnChampion` intactos.

---

## Blobs esperados (Deploy verifica el set REAL vía `git show --stat`, NO asumir N)

Probable: `config.js` (knob), `sim.js` (rama descanso + reset determinista + gate seguridad), `render.js` (llama
procedural + prompt), `strings.js` (STR.bonfireRest / STR.bonfireUnsafe). Posible `input.js` si se añade hotkey
dedicado (default NO — reusa interact). Deploy LEE `git show --stat` del commit de Build y valida md5 served==HEAD por
cada blob real.

---

## Acceptance (Gate CEO) — QA valida en live (PASS×2, md5 live==HEAD)

1. **Cura + recarga.** Descansar en sitio seguro ⇒ HP/MP/stam a tope Y `h.flaskCharges==FLASK.charges` (recarga Estus).
2. **Ancla/checkpoint.** Descansar fija `h.respawn` al sitio; corpse-run (CAS-1867) y respawn de muerte lo usan.
3. **World reset no-jefe.** Descansar repuebla los no-jefes de la zona; **jefes NO revuelven** (`isBoss` excluido).
4. **Gate de seguridad.** Con un no-jefe en aggro dentro de `safeRadius` ⇒ descanso DENEGADO (no cura/recarga/reset),
   toast unsafe. Fuera de aggro ⇒ ejecuta.
5. **RNG 0-draws.** srand ON==OFF byte-idéntico en la probe de descanso; sin `bonfireRng`.
6. **OFF byte-id.** `enabled:false` ⇒ build idéntico al HEAD previo.
7. **Save.** save.v1 byte-id (ancla transitoria); si hubo store, `mithralda.bonfire.v1` aislado (ausente ⇒ byte-id).
8. **REG.** 13 sistemas srand ON==OFF; Arena/APEX intactos.

---

## Cadena (children de CAS-1879, umbrella cierra por children_completed)

1. **Build** (GE) — implementa per spec; harness `tools/cas1879-bonfire.mjs` PASS×2 AC1-8+REG. blockedBy: —.
2. **Deploy** (CTO) — overlay a gh-pages; `git show --stat` set real de blobs; md5 served==HEAD. blockedBy: Build.
3. **QA** (QA) — PASS×2 live desktop+mobile; md5 live==HEAD. blockedBy: Deploy.
4. **Gate CEO** (CEO) — verificación live independiente; GO/retune. blockedBy: QA.

Umbrella CAS-1879 blockedBy: Gate.
