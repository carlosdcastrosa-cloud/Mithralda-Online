# CAS-2114 — Recuperación / Rally / Regain (mecánica #35)

**Estado:** SHIPPED DARK (`RALLY.enabled:false`). $0 arte · RNG-neutral estricto · save-neutral · config-gated · reversible.
**Umbrella:** CAS-2114. **Baseline LIVE previo:** `90ef7f7e411a`/799 (34 mec, sim md5 `2524c04f`).

## 1. Qué es y por qué

Mecánica icónica de Souls/Bloodborne ausente en las 34 vivas: **al recibir daño, una fracción del HP perdido queda
RECUPERABLE durante una ventana corta; golpear en melee dentro de la ventana devuelve parte de ese pool al HP.** Es el eje
de **riesgo/recompensa agresivo**: en vez de retirarte tras comer un golpe, presionar de vuelta te *reembolsa* daño.

Compone con las dos conversiones defensa→ofensiva ya vivas **sin solaparse** — ejes ortogonales:
- **Guard Counter (#33, CAS-2105):** bloquear con escudo → el siguiente swing pega ×dmg/×poise. Requiere escudo.
- **Dodge Counter (#34, CAS-2110):** esquiva perfecta → el siguiente swing pega ×dmg/×poise. Universal.
- **Rally (#35, éste):** *cualquier* daño recibido → el siguiente **golpe melee que conecte** te **cura** de un pool. No
  amplifica el swing (dmg/poise intactos): lo convierte en curación. Un swing puede a la vez ser dodge-counter (×dmg) **y**
  curar por rally — los factores no se pisan (uno escala daño saliente, el otro suma HP entrante).

## 2. Diseño (thin additive, mirror CAS-2110)

Estado transitorio en el héroe (mirror `h.dodgeCounterT`), **fuera** del allowlist de `serializeSave`:
- `h.rallyPool` — HP recuperable acumulado.
- `h.rallyT` — segundos restantes de la ventana (techo duro).

Tres seams, **todos gated en `RALLY.enabled`**:

1. **Arma (`sim.js` `damageHero`):** justo tras `h.hp-=real` (el daño REAL, post-armadura/bloqueo). Corre *después* de
   todos los early-outs de negación (spirit/parry/i-frame/dodge-talent/shield-block, que retornan antes) ⇒ sólo el daño
   que de verdad restó HP alimenta el pool:
   ```
   h.rallyPool = min(h.rallyPool + real*recoverFrac, capFracMaxHp*HPmax);  // anti-abuse jefes
   h.rallyT    = windowS;
   ```
2. **Decae (`sim.js` `tickRally`, junto a `tickDodgeCounter`):** mientras `rallyT>0`, `rallyPool -= decayPerSec*HPmax*dt`
   (lineal); al expirar la ventana (`rallyT→0`) el pool se fuerza a 0. Sin golpear ⇒ el pool se pierde.
3. **Cura (`sim.js` `applyHeroMelee`):** un swing que **conecta ≥1 enemigo** (`rallyLanded`) cura **una sola vez por swing**
   (no por enemigo — un barrido AoE no multiplica la cura):
   ```
   heal = min(rallyPool*healPerHitFrac, rallyPool);   // healPerHitFrac<1 ⇒ nunca full-heal de un golpe
   rallyPool -= heal;  h.hp = min(HPmax, h.hp + heal);
   ```

**Render (`render/render.js`):** overlay **'ghost HP'** translúcido verde sobre la barra de HP existente
(`renderVitalsShoulders`), desde el fin del fill de HP hasta `hp+rallyPool` (capado a HPmax). $0 arte: reusa la primitiva
`fillRect` ya viva. Gated ⇒ `enabled:false`/pool 0 ⇒ no dibuja. Además `applyHeroMelee` emite floater `¡RECUPERA!` +
`spellburst` (primitivas canvas existentes) al curar.

## 3. Invariantes (probados en `tools/cas2114-rally-live-qa.mjs`, PASS×2 + 34-mech REG)

- **OFF==baseline byte-id:** `enabled:false` ⇒ (a) recibir daño NO arma el pool; (b) forzar `rallyPool>0` es INERTE en el
  swing (hp idéntico con/sin pool) ⇒ ramas de daño/melee byte-idénticas a HEAD. `rallyOffProbe`.
- **RNG-neutral ESTRICTO:** 0 draws nuevos, **no existe `rallyRng`** — timers/estado puros. Fingerprint master-srand
  BYTE-IDÉNTICO ON==OFF alrededor del ciclo real (daño→decay→cura). `rallySrandProbe`.
- **Save-neutral:** `h.rallyPool`/`h.rallyT` transitorios ⇒ `serializeSave()` byte-id ON/OFF, sin clave `rally*`. `rallySaveByteId`.
- **Anti-abuse:** `capFracMaxHp` capa el pool (`rallyCapProbe`); `healPerHitFrac<1` evita full-heal de un golpe.
- **60fps / 0 alloc por frame:** `tickRally` es aritmética escalar; el overlay es un `fillRect` gated.

## 4. Knob (`sim/config.js`) — defaults sanos para QA; el CEO retunea + flipea en el Gate

```
export const RALLY = {
  enabled:false,        // SHIP DARK
  recoverFrac:0.35,     // fracción del daño REAL que entra al pool
  windowS:3.0,          // ventana (s) — techo duro; al expirar pool→0
  healPerHitFrac:0.5,   // fracción del pool que devuelve un golpe melee (<1)
  decayPerSec:0.15,     // decaimiento lineal (fracción de HPmax/s)
  capFracMaxHp:0.4,     // el pool nunca excede 40% HPmax (anti-abuse jefes)
  requiresMelee:true,   // sólo golpes melee recuperan (identidad de riesgo)
};
```

## 5. Cadena (GE self-orquesta, mirror mec #34)

1. **Build DARK** — este doc + seams + harness. ✅
2. **Deploy DARK** — overlay gh-pages, served md5 config/sim == HEAD.
3. **QA OBSERVABLE** (QA `b5c10283`) — drive el sim loop REAL desktop+móvil: OFF==baseline, SRAND ON==OFF, save byte-id,
   60fps, 0 regresión 34 mec, headline (recibir daño → pool visible → golpe melee cura). PASS×2.
4. **QA regresión baseline** (QA `b5c10283`) — full-build vs LIVE.
5. **Gate CEO** (child, asignado CEO `e77e7f98`, blocked-by umbrella) — verifica OFF==baseline + QA observable, flipea
   `RALLY.enabled false→true`, deploya, registra GO, cierra.

Reversible → `enabled:false` + redeploy.
