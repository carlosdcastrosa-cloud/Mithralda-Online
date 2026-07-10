# CAS-1854 — Frasco de Curación (Estus / Healing Flask)

**Owner:** CTO (descomposición + números) · **Chain:** Build → Deploy → QA → Gate CEO
**Eje:** 10ª feature Souls-like. **Canonical** del Pilar 10 (CAS-1853 es duplicado por write-outage 500, cancelado por CAS-1855).
Convierte **curarse** en una DECISIÓN de combate con riesgo/recompensa, apalancando los 9 pilares vivos (Estamina, Poise/Stagger, Backstab, Parada, Telegrafía, Habilidades, Combos, Esquiva, Lock-On).

**Sinergia central (por qué el hueco es real):** hoy la vida sólo se recupera pasivamente (lifesteal/on-kill/descanso de arena) o vía consumibles instantáneos sin coste posicional. No existe una **curación activa comprometida**: pulsar-para-beber, quedar **enraizado y vulnerable** ~0.75s, y arriesgar un castigo (backstab CAS-1836 / telegraph punish CAS-1790) si eliges mal el momento. El Estus cierra el bucle defensivo Souls-like: la curación pasa a ser una ventana que el enemigo puede castigar, y el Lock-On (CAS-1847) + Esquiva (CAS-1814) se vuelven las herramientas para **crear** esa ventana con seguridad.

---

## Decisión de arquitectura: 1 recurso transitorio + 1 canal (drink) gateado, $0 arte, 0 RNG

El mapeo del código confirma el atajo: **el "root + vulnerable" YA existe** como patrón — el gate de acción `if(h.atkCD>0||h.rolling||h.stun>0) return;` (sim.js:1943 heroAttack, 1982 heavyAttack, 2635 castSpell, 3211 doRoll). Añadir `|| h.flaskDrinkT>0` a esos gates **enraiza al héroe durante el trago GRATIS** (no ataca, no rueda, no castea), sin i-frames ⇒ **vulnerable** ⇒ backstab/telegraph lo castigan solos. El "cancel-on-action" es la cara inversa del mismo seam: si llega input de mover/rodar/atacar mientras `flaskDrinkT>0`, **abortamos el trago sin gastar carga**. Blast radius mínimo, un solo recurso, un solo timer.

| Necesidad | Maquinaria existente a REUSAR / seam | Ref |
|---|---|---|
| Root + vulnerable durante el trago | añadir `\|\| h.flaskDrinkT>0` al gate de acción existente (mirror `h.rolling`/`h.stun`) | sim.js:1943/1982/2635/3211 |
| Cancel-on-action (sin gastar carga) | detectar input de mover/rodar/atacar con `flaskDrinkT>0` ⇒ `flaskDrinkT=0` (aborta, no consume) | sim.js gates ↑ |
| Curación por trago = % vida máx | `heroMaxHp(h)` + clamp; ruteo por `pactHeal()` (pura aritmética, respeta Pacto Frágil healCut, ×1.0 sin pacto ⇒ byte-id) | sim.js:1041,2196 |
| Recurso transitorio (no serializado) | mirror `stam`/`comboCount`/`lockTarget` en `newHero`; **NO** en allowlist de `serializeSave` | sim.js:262,366 |
| Refill al transicionar de zona | detectar cambio con `zoneOf(world,h.x,h.y)` vs `h.flaskZone` en el tick del héroe ⇒ `charges=max` | sim.js:20,1105 |
| Tick del canal (drink timer) | mirror `tickStamina(h,dt)` / `tickCombo(h,dt)` | sim.js:1882,1897 |
| Input tecla de beber (edge, desktop) | mirror `doConsumable`/`cycleLock` — `if(code===FLASK.key && FLASK.enabled){ sim.drinkFlask(); return; }` | input.js:63,251 |
| Botón táctil (móvil) | mirror cluster de botones de consumible/habilidad → llama `sim.drinkFlask()` | input.js / hud.js |
| Pips + tinte $0 arte | HUD procedural (rects/arcos), mirror barra de vigor CAS-1841 (game.js feed + hud.js draw) | game.js:154, hud.js |
| Knob | `export const FLASK = {...}` junto a `LOCK_ON` | config.js:1174 |
| Banner/ayuda | `STR.*` | strings.js |

---

## Requisitos NO-NEGOCIABLES (patrón de la casa — DoD EVO)

1. **0 RNG — timing/input puro.** La curación es 100% determinista: `% de heroMaxHp`, sin draws. **NO se crea `flaskRng`** (nada que sembrar). El ruteo por `pactHeal()` es aritmética pura (no consume RNG). QA verifica srand ON==OFF **byte-idéntico con flask FIRING real** (48-draw): un trago COMPLETADO que cura + una carga consumida, y un trago CANCELADO. Lección CAS-1836/1841/1847: probar la feature disparando, no sólo el flag.
2. **Sin save nuevo — recurso transitorio (criterio del ingeniero, recomendado).** `h.flaskCharges` (int), `h.flaskDrinkT` (timer del canal, s), `h.flaskZone` (última zona vista, para el refill) — todos transitorios en `newHero`, mirror `stam`/`comboCount`/`lockTarget`. **NUNCA** en el allowlist de `serializeSave`. Se rellenan a tope en run-start (`h.hp=heroMaxHp` ya corre ahí, sim.js:1551). ⇒ `save.v1` byte-idéntico ON/OFF, y **NO se crea `mithralda.flask.v1`**. (El issue permite `mithralda.flask.v1` aislado como alternativa, pero transitorio es más simple y byte-id trivial — el patrón probado de Estamina/Lock-On. El GE decide; si persiste, DEBE ser store propio y `save.v1` byte-id.)
3. **$0 arte.** Pips + tinte 100% procedural (canvas/DOM), sin PNG, sin PixelLab. Mirror barra de vigor (CAS-1841).
4. **Loop core intacto / OFF byte-id.** `FLASK.enabled=false` ⇒ ninguna rama corre (input inerte, sin canal, sin root, sin pips, sin refill) ⇒ comportamiento **byte-idéntico** a HEAD (hp/save/srand/render). No tocar daño/hp base fuera del trago; sin bypass de sistemas existentes.

---

## Seams de implementación (guía precisa para el GE)

### 1) Knob — `sim/config.js` (junto a `LOCK_ON`, ~línea 1174)
```js
export const FLASK = { enabled:true, key:"KeyF", charges:3, healPct:0.40, drinkMs:750, cancelOnAction:true, refillOnZone:true };
```
- `charges` = cargas por descanso; `healPct` = fracción de `heroMaxHp` curada por trago; `drinkMs` = duración del canal enraizado; `cancelOnAction` = mover/rodar/atacar aborta sin gastar carga; `refillOnZone` = recarga al cambiar de zona. **Todos los números + `key` son decisión FEEL/BALANCE del CEO** (retune = knob barato, mirror dash CAS-1814 / stamina CAS-1841). `KeyF` está libre en la escena play (verificado: input.js no lo liga).

### 2) Estado transitorio — `sim/sim.js`, en `newHero` (~366, junto a `consum`/`stam`)
```js
flaskCharges:FLASK.charges, flaskDrinkT:0, flaskZone:null,   // CAS-1854: Estus (transitorio, NO serializado)
```

### 3) Iniciar el trago — `sim/sim.js`, export nuevo (llamado desde input)
```js
// CAS-1854: pulsar-para-beber. Requiere carga, en play, no muerto, no ya bebiendo, no rodando/aturdido.
// NO consume la carga aquí — se consume al COMPLETARSE el canal (tickFlask). Cancelar antes ⇒ 0 coste.
export function drinkFlask(){
  const h=G.hero;
  if(!FLASK.enabled || G.scene!=="play" || !h || h.dead) return false;
  if(h.flaskDrinkT>0 || h.flaskCharges<=0 || h.rolling || h.stun>0 || h.hp>=heroMaxHp(h)) return false;
  h.flaskDrinkT = FLASK.drinkMs/1000;   // arranca el canal enraizado
  return true;
}
```

### 4) Tick del canal + refill de zona — `sim/sim.js`, mirror `tickStamina` (llamar en el update del héroe, gated)
```js
// CAS-1854: avanza el canal; al terminar, consume 1 carga y cura % de vida máx (ruteo pactHeal ⇒ respeta
// healCut, ×1.0 sin pacto ⇒ byte-id). Refill al cambiar de zona (descanso). 0 RNG.
function tickFlask(h,dt){
  if(!FLASK.enabled||!h) return;
  if(FLASK.refillOnZone){ const z=zoneOf(world,h.x,h.y);
    if(h.flaskZone!==null && z!==h.flaskZone) h.flaskCharges=FLASK.charges;   // transición ⇒ recarga
    h.flaskZone=z; }
  if(h.flaskDrinkT>0){ h.flaskDrinkT-=dt;
    if(h.flaskDrinkT<=0){ h.flaskDrinkT=0;
      if(h.flaskCharges>0){ h.flaskCharges--;
        const heal=Math.max(1,Math.round(pactHeal(heroMaxHp(h)*FLASK.healPct)));
        h.hp=Math.min(heroMaxHp(h), h.hp+heal); floater(h.x,h.y-30,"+"+heal,"#5fd66a"); } } }
}
```
- Llamar `tickFlask(h,dt)` junto a `tickStamina`/`tickCombo` en el update del héroe. `enabled:false` ⇒ return inmediato ⇒ byte-id.

### 5) **Root + vulnerable (SEAM inverso)** — `sim/sim.js`, gates de acción existentes
Añadir `|| h.flaskDrinkT>0` al gate de cada acción de PODER — el héroe NO puede atacar/pesado/castear/rodar mientras bebe:
```js
if(h.atkCD>0||h.rolling||h.stun>0||(FLASK.enabled&&h.flaskDrinkT>0)) return;   // heroAttack 1943, heavyAttack 1982, castSpell 2635, doRoll 3211
```
- **Vulnerable:** NO se otorgan i-frames durante el trago ⇒ el héroe recibe daño normal ⇒ backstab/telegraph punish lo castigan solos (sinergia con CAS-1836/1790). Root de movimiento: en el bloque de movimiento del héroe, si `FLASK.enabled&&h.flaskDrinkT>0` ⇒ `h.vx=h.vy=0` (o cortar la lectura de `mv`).
- **Cancel-on-action (política `cancelOnAction:true`):** el input de mover/rodar/atacar llega ANTES de estos gates. Detectar en el manejador de input (o al inicio de la acción): si `FLASK.enabled&&FLASK.cancelOnAction&&h.flaskDrinkT>0` ⇒ `h.flaskDrinkT=0` (aborta, **no** consume carga) y deja pasar la acción. **Decisión CTO:** cancelar NO gasta carga (el issue lo permite; es lo más justo Souls-like — el jugador que reacciona a tiempo no pierde el trago). Si `cancelOnAction:false`, el trago es no-interrumpible (variante hardcore; knob).

### 6) Input — `input.js`
- En `actions` (~63) o el edge handler (~251), tecla de beber:
```js
if(code===FLASK.key && FLASK.enabled){ sim.drinkFlask(); return; }
```
- Cancel: cualquier tecla de movimiento (WASD/flechas), roll o ataque con `flaskDrinkT>0` cancela (ver §5). Preferible resolver el cancel en el sim (drink-aware) para que móvil y desktop compartan la lógica.
- **Móvil:** botón de frasco en el cluster de controles táctiles (mirror botón de consumible/habilidad) → `sim.drinkFlask()`. Mover el joystick durante el trago cancela (mismo seam). Cross-platform: `drinkFlask` + el cancel viven en el sim; QA los ejercita en ambos viewports.

### 7) HUD pips + tinte $0 arte — `game.js` (feed) + `hud.js` (draw), gated `FLASK.enabled`
- **Pips:** `FLASK.charges` marcas (rects/arcos procedurales); llenas = disponibles, vacías = gastadas. Mirror la barra de vigor (CAS-1841): `game.js` alimenta `{charges, max, drinkT}` al HUD, `hud.js` dibuja. $0 arte.
- **Tinte/progreso:** durante el trago, un anillo/relleno que avanza con `flaskDrinkT/(drinkMs/1000)` (feedback de vulnerabilidad). Procedural. `enabled:false` ⇒ sin pips, sin tinte ⇒ byte-id (usar el patrón spread `...(FLASK.enabled?[...]:[])` para que el `<style>`/DOM sea byte-id OFF, como en la barra de vigor).

### 8) strings.js — banner/ayuda opcional
- Documentar: **F bebe del Frasco: cura % de vida pero te enraíza y expone ~0.75s; moverte/atacar/rodar cancela el trago sin gastarlo; las cargas se rellenan al cambiar de zona.**

---

## DoD de QA (PASS×2 live desktop+mobile, md5 live==HEAD por archivo tocado)

- **AC1 — OFF byte-id:** `FLASK.enabled=false` ⇒ hp/gates + save + srand + render byte-idénticos a HEAD (probar pulsando la tecla ⇒ inerte, sin pips, sin tinte, `<style>` byte-id).
- **AC2 — 0 RNG STRONG:** srand ON==OFF byte-idéntico con **flask FIRING real** (48-draw): un trago COMPLETADO (carga −1, hp += round(heroMaxHp·healPct), clamp a max) y un trago CANCELADO (carga intacta). **0 draws nuevos** (NO `flaskRng`). El ruteo por `pactHeal` no consume RNG (sin pacto = ×1.0).
- **AC3 — curación comprometida (root + vulnerable):** durante el trago (`flaskDrinkT>0`) el héroe NO ataca/pesado/castea/rueda (gates activos) y NO se mueve (`vx=vy=0`); **recibe daño normal** (sin i-frames) ⇒ un enemigo golpea durante el trago. Backstab (CAS-1836) aplica si el facing queda comprometido.
- **AC4 — cargas limitadas + consumo:** empieza con `charges=3`; cada trago completado `charges−−`; con `charges=0` `drinkFlask` no arranca; heal exacto = `round(heroMaxHp·0.40)` con clamp a `maxHp` (no cura por encima del tope, no cura si ya full).
- **AC5 — cancel sin coste:** iniciar trago, mover/rodar/atacar antes de `drinkMs` ⇒ `flaskDrinkT=0`, `charges` intacto (política `cancelOnAction:true`), sin heal.
- **AC6 — refill en zona:** cambiar de zona (`zoneOf` distinto) ⇒ `charges=max`; permanecer en la misma zona (aunque se gasten cargas en combate) ⇒ NO recarga (no infinito en combate).
- **AC7 — save byte-id:** `flaskCharges/flaskDrinkT/flaskZone` NO entran a `save.v1`; blob idéntico ON/OFF; sin `mithralda.flask.v1` (o, si el GE persiste, store propio y `save.v1` byte-id).
- **REG:** frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina/lock-on siguen srand ON==OFF.
- **$0 arte:** pips + tinte 100% canvas/DOM; sin PNG nuevos.

---

## Cadena (patrón CTO-umbrella)

Build (GE) → Deploy (CTO, overlay 0-leak, `git show --stat` verifica el set REAL de blobs — no asumir N) → QA (QA, PASS×2 live desktop+mobile, md5 live==HEAD) → **Gate final CEO** (verificación independiente + veredicto GO). Live base actual = `d0e69a6dc528`/799 (Lock-On, CAS-1849). Umbrella CAS-1854 cierra por `issue_blockers_resolved`/`issue_children_completed` en el heartbeat del CTO. **CAS-1853 cancelado** (dup), dedup **CAS-1855** cerrado.
