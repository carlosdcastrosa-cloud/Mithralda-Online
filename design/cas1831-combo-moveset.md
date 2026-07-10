# CAS-1831 — Sistema de Combos / Moveset con rematador anti-Stagger

**Owner:** CTO (decomposition + números) · **Chain:** Build → Deploy → QA → Gate CEO
**Product call (CEO):** cerrar el loop Souls-like por el lado OFENSIVO. El kit reactivo ya es profundo (Telegrafía CAS-1790 · Esquiva CAS-1814 · Parada CAS-1785 · Habilidades CAS-1819 · Poise/Stagger CAS-1826). Hueco: el ataque del jugador es plano y las ventanas de STAGGER de CAS-1826 no tienen payoff ofensivo. Feature: cadena de golpes con profundidad + **rematador** que castiga al enemigo aturdido → **hace que Poise/Stagger PAGUE**.

Loop completo: telegrafía → esquiva/parada → **aturdes** (CAS-1826) → **ejecutas rematador** (esta feature).

---

## Decisión de arquitectura: BORROW + estado transitorio (≈$0 arte, 0 RNG)

El mapeo del código confirma que la maquinaria vive; sólo añadimos estado transitorio del héroe y multiplicadores deterministas en el sink de daño.

| Necesidad | Maquinaria existente a REUSAR | Ref |
|---|---|---|
| Sink de multiplicadores por golpe (0 srand) | `hitEnemy(e,dmg,ang,opt)` — mirror FRENZY/PARRY `dmg*=…` | sim.js:1918-2057 |
| Punto de golpe melee | `applyHeroMelee` (arco+arc gate) → `hitEnemy` | sim.js:1894-1909 |
| Iniciación de ataque + cooldown | `heroAttack` (gate `atkCD/rolling/stun`, `h.atkCD=cfg.cd/…`) | sim.js:1876-1893 |
| Estado transitorio NO serializado | mirror `frenzyStacks/frenzyT` (hero, allowlist de `serializeSave` los excluye) | sim.js:293-298, 1402-1472 |
| Enemigo ATURDIDO ya existe | `e.staggerT>0` (ventana) + `e.stun>0` (IA congelada) de CAS-1826 | sim.js:1965-2006, 3274 |
| Poise por golpe pesado ya existe | `POISE.gain.heavy(26)/ultimate(40)` vía `opt.heavy/opt.ultimate` en hitEnemy | config.js:1095-1106, sim.js:1965-1975 |
| VFX $0 | `addFx("spellburst"/"shockring"/"debris")` + `floater()` + `shakeAdd()` | sim.js:2026-2033 |
| Input dedicado (patrón limpio) | mirror KeyH de Parry — tecla nueva aislada, botón de ataque intacto | input.js:57 |

**Clave del payoff:** el **rematador** es un multiplicador `staggerPunishMul` en `hitEnemy` que se aplica **sólo a golpes melee sobre un enemigo con `e.staggerT>0`** (reusa el marcador de CAS-1826). Apila sobre el `POISE.bonusDmg` existente + VFX de impacto. Cero IA nueva, cero arte.

---

## Requisitos NO-NEGOCIABLES (patrón de la casa — DoD EVO)

1. **$0 arte** — VFX proc reusando `spellburst`+`shockring`+`debris`+`floater`+`shakeAdd`. Sin PNG nuevos.
2. **RNG-neutral STRONG** — el combo es **100% timing/input**: cadena por ventana de tiempo, rematador por umbral aritmético. **Sin draws ⇒ NO se crea `comboRng`** (nada que sembrar). QA verifica srand ON==OFF con **combo firing real** (finisher aterrizando + rematador sobre enemigo staggered). Lección CAS-1786/1822/1829: probar la feature disparando, no sólo el flag.
3. **Save aislado — decisión CTO: SIN nueva clave.** El estado del combo (`comboCount`, `comboT`) es **run-transitorio del héroe** (mirror `frenzyStacks`). No hay progresión de cuenta que persistir (a diferencia de codex/titles/pacts). ⇒ `serializeSave` (allowlist) lo excluye automáticamente ⇒ **save.v1 byte-idéntico ON u OFF**, y **NO se crea `mithralda.combo.v1`** (nada que guardar; añadir clave vacía sería peor). Esto **supera** la persistencia aislada que pedía el DoD #2: cero superficie de save nueva. Mirror exacto de POISE (0 claves nuevas).
4. **1 solo knob** `COMBO` con `enabled` + params. `enabled:false` ⇒ ninguna rama corre, botón de ataque intacto, tecla pesada inerte ⇒ comportamiento **idéntico** (byte-id).
5. **Sin regresiones** frenzy/parry/dodge/telegraph/abilities/poise — todos los seams son aditivos (multiplicadores en el sink, tecla nueva aislada). FRENZY y PARRY siguen multiplicando en `hitEnemy` (apilan con el finisher/rematador).

---

## Estado nuevo del héroe (transitorio, junto a frenzyStacks ~sim.js:293)

```
comboCount:0,   // golpes encadenados del combo ligero actual
comboT:0,       // timer de la ventana de encadenado (>0 = cadena viva)
```
Ambos son estado de run transitorio (mirror `frenzyStacks/frenzyT`): la allowlist de `serializeSave` NO los incluye ⇒ nunca se serializan ⇒ save byte-idéntico. Un run nuevo los pone a 0.

## Knob (config.js, junto a POISE ~línea 1095)

```js
export const COMBO = {
  enabled:true,
  // --- cadena ligera (L→L→L) ---
  windowMs:900,        // ventana de encadenado; si expira ⇒ comboCount=0
  chainLen:3,          // golpes hasta el finisher (el 3º es el finisher)
  finisherMul:1.6,     // daño × del finisher de cadena
  finisherKnock:1.7,   // knockback × del finisher de cadena
  // --- ataque pesado (tecla dedicada) ---
  heavyKey:"KeyG",     // v1 desktop: tecla dedicada (mirror KeyH de Parry)
  heavyCdMul:1.9,      // más lento (cooldown ×)
  heavyDmgMul:1.7,     // más daño
  heavyPoise:"heavy",  // alimenta POISE.gain.heavy(26) ⇒ vía natural de romper postura
  // --- rematador anti-Stagger (corazón) ---
  staggerPunishMul:2.2 // × extra al golpear MELEE a un enemigo con e.staggerT>0 (apila sobre POISE.bonusDmg)
};
```

## Seams de implementación (para el Build)

**A. Estado héroe** — añadir `comboCount:0, comboT:0` al objeto hero (sim.js ~299).

**B. heroAttack (sim.js:1876), sólo clase melee** — avanzar cadena por swing (input/timing puro):
```js
if(COMBO.enabled && cfg.type==="melee"){
  h.comboCount = (h.comboT>0) ? Math.min(COMBO.chainLen, h.comboCount+1) : 1;
  h.comboT = COMBO.windowMs/1000;
  h._comboFin = (h.comboCount>=COMBO.chainLen);   // este swing es el finisher
  if(h._comboFin) h.comboCount = 0;               // reinicia tras disparar finisher
} else { h._comboFin=false; }
```

**C. applyHeroMelee (sim.js:1894)** — aplicar finisher (daño+knockback) y marcar melee:
```js
const fin = COMBO.enabled && h._comboFin;
const dmg = equippedDmg(h)*cfg.dmgMul*(fin?COMBO.finisherMul:1);
...
hitEnemy(e, dmg, h.atkAng, {melee:true, heavy:fin, knockMul:(fin?COMBO.finisherKnock:1)});
```
`{heavy:fin}` hace que el finisher de cadena genere `POISE.gain.heavy` (tie a CAS-1826). `{melee:true}` habilita el rematador (excluye ranged). `knockMul` respeta la rama de knockback existente (default 1).

**D. hitEnemy — rematador anti-Stagger (sink de daño, ~sim.js:2006, junto al POISE bonus):**
```js
// existente CAS-1826: if(POISE.enabled && e.staggerT>0) dmg*=(e.isBoss?boss:elite).bonusDmg;
let punish=false;
if(COMBO.enabled && e.staggerT>0 && opt && opt.melee){ dmg*=COMBO.staggerPunishMul; punish=true; }
// ...tras aplicar el daño / donde va el VFX de crit:
if(punish){
  addFx("spellburst",e.x,e.y-2,{col:"#ffd24a"});
  addFx("shockring",e.x,e.y,{r:56,life:0.42});
  addFx("debris",e.x,e.y,{ang,life:0.5});
  shakeAdd(7);
  floater(e.x,e.y-34,STR.execute||"¡REMATE!","#ffd24a",{crit:true,pop:2.0,life:1.1});
}
```
Determinista, 0 srand. Apila sobre el bonus de POISE (payoff intencional del loop).

**E. Ataque pesado — `heroHeavyAttack()` (mirror heroAttack) + input.js:**
- input.js: bind `COMBO.heavyKey` → `sim.heavyAttack()` (patrón ACTIONS, mirror KeyH). Gate: si `!COMBO.enabled` la tecla no hace nada (botón de ataque intacto ⇒ OFF byte-id).
- sim.js `heroHeavyAttack()`: clon de heroAttack para clase melee con `h.atkCD = cfg.cd*COMBO.heavyCdMul/(1+atkspd/100)`, daño `×COMBO.heavyDmgMul`, y `applyHeroMelee` pasa `{melee:true, heavy:true}` (no finisher de cadena; su rol es romper postura). Reusa la anim/fx de swing existente (más lento ⇒ `life` mayor). $0 arte.
- **Móvil:** el rematador + la cadena ligera funcionan en TODAS las plataformas (van sobre el ataque existente). El pesado en v1 es tecla desktop; GE evalúa un hook de botón HUD móvil si es barato, si no queda como follow-up explícito (no es regresión: no toca la ruta actual). El **core loop es cross-platform**.

**F. Tick de ventana** — decaer `comboT` cada frame (mirror tickFrenzy, ~sim.js:1849):
```js
if(COMBO.enabled && h.comboT>0){ h.comboT-=dt; if(h.comboT<=0) h.comboCount=0; }
```

**G. strings.js** — `execute:"¡REMATE!"` (1 string, patrón STR).

## Archivos tocados (para deploy/QA md5)
`sim/config.js` (knob) · `sim/sim.js` (estado/heroAttack/applyHeroMelee/hitEnemy/heavy/tick) · `input.js` (heavyKey) · `render/render.js` (si el VFX de punish requiere un tipo nuevo; ideal 0 — reusa addFx) · `strings.js` (1 string). **GE confirma el set exacto (y el conteo de blobs) en su handoff** — lección CAS-1828: leer `git show --stat` del Build, no asumir el conteo del mirror.

## Acceptance (para el harness de Build/QA — DOM-free, mirror cas1826)
- **AC1 OFF byte-id:** `COMBO.enabled=false` ⇒ save.v1 idéntico + secuencia de golpes idéntica (sin finisherMul, sin rematador, tecla pesada inerte). outsideDiffs=0.
- **AC2 srand ON==OFF:** 48-draw idéntico con combo **firing real** (finisher aterrizando + rematador sobre enemigo `staggerT>0`). Confirma 0 draws (no `comboRng`).
- **AC3 cadena ligera:** 3 swings dentro de `windowMs` ⇒ 3º swing = finisher (`dmg×finisherMul`, knockback ×`finisherKnock`); el 4º reinicia la cadena.
- **AC4 expiración:** hueco > `windowMs` entre swings ⇒ `comboCount` reinicia a 1, sin finisher.
- **AC5 pesado:** cooldown más largo (`×heavyCdMul`), daño mayor (`×heavyDmgMul`), genera `POISE.gain.heavy` (llena postura más rápido que el ligero — verificable con POISE ON).
- **AC6 rematador (corazón):** golpe MELEE a enemigo con `e.staggerT>0` ⇒ `dmg×staggerPunishMul` + VFX + floater; **apila** sobre `POISE.bonusDmg`.
- **AC7 melee-only:** hits ranged/proj NO encadenan y NO reciben el rematador (`opt.melee` gate).
- **AC8 sinergia sin regresión:** FRENZY `dmg` mult sigue aplicando (apila multiplicativo), PARRY riposte sigue aplicando; poise/dodge/telegraph/abilities harnesses PASS.
- **AC9 no-persist:** save/reload no conserva `comboCount/comboT` (transitorio).
- **REG:** parry/dodge/telegraph/abilities/poise harnesses siguen PASS.

## Cadena de entrega
Build (GE) → Deploy gh-pages (CTO) → QA live desktop+mobile PASS×2 md5 live==HEAD (CTO/QA) → Gate CEO (verifica live + GO). Umbrella CAS-1831 cierra por `issue_children_completed`.
