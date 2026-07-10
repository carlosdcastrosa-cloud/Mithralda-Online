# CAS-1836 — Golpe por la Espalda (Backstab / Crítico Posicional)

**Owner:** CTO (decomposition + números) · **Chain:** Build → Deploy → QA → Gate CEO
**Product call (CEO):** el loop Souls-like reactivo cierra sobre el eje de **TIMING** (Telegrafía CAS-1790 · Esquiva CAS-1814 · Parada CAS-1785 · Poise/Stagger CAS-1826 · Combos CAS-1831). Falta el eje de **POSICIONAMIENTO**. Esta feature lo añade y convierte la **Esquiva Rodante (CAS-1814) en OFENSIVA**: rodar detrás del enemigo → golpe crítico.

**Sinergia central (por qué el hueco es real):** el enemigo NORMAL re-encara al héroe cada frame (`e.facing=atan2(h.y-e.y,h.x-e.x)`), así que de frente NUNCA hay backstab — y eso es correcto. El backstab se ABRE justo cuando el enemigo **COMPROMETE su facing**: durante un wind-up telegrafiado (CAS-1790), un LUNGE bloqueado (CAS-1820), la carga del charger (CAS-126), o un **STAGGER** (CAS-1826, IA congelada). Leer el tell → rodar detrás → rematar por la espalda. El positioning PAGA lo mismo que el timing.

---

## Decisión de arquitectura: BORROW + geometría pura (≈$0 arte, 0 RNG)

El mapeo del código confirma que toda la maquinaria vive; sólo añadimos **un multiplicador determinista en el sink de daño**, calculado por geometría sobre `e.facing` que YA existe.

| Necesidad | Maquinaria existente a REUSAR | Ref |
|---|---|---|
| Sink de multiplicadores por golpe (0 srand) | `hitEnemy(e,dmg,ang,opt)` — mirror POISE/COMBO/FRENZY `dmg*=…` | sim.js:1967-2062 |
| Dirección del ataque (héroe→enemigo) | `ang` = `h.atkAng` = `Math.atan2(e.y-h.y,e.x-h.x)` ya pasado a `hitEnemy` | sim.js:1949-1951 |
| Marcador melee-only | `opt.melee` (lo pone `applyHeroMelee`; ranged/proj/nova NO) | sim.js:1951 |
| Facing del enemigo (radianes) | `e.facing` — vivo en TODOS los enemigos, se congela en telegraph/lunge/charger/stagger | sim.js:1609, 3414, 3455 |
| Utilería de ángulo | `angDiff(a,b)` (normaliza a [-π,π]) | math.js:8 |
| Rama de knockback (mult opcional) | `const knockMul=(opt&&opt.knockMul)||1;` línea a la que se le apila backstab | sim.js:2079-2080 |
| VFX $0 (flash/crit distinto) | `addFx("spellburst"/"shockring"/"debris")`+`floater()`+`shakeAdd()` (mirror del REMATE) | sim.js:2098-2101 |
| Banner/tooltip | `STR.*` en strings.js | strings.js |

**Clave del efecto:** un backstab es un **crítico posicional** en `hitEnemy`, aplicado **sólo a golpes melee** (`opt.melee`) cuando el vector de ataque entra por el **arco trasero** del enemigo. Apila sobre POISE.bonusDmg + rematador CAS-1831 (todos multiplican en el mismo sink → un backstab a un enemigo staggered es el pico de daño del kit, el payoff de leer+posicionar).

### Geometría (100% pura, 0 RNG)

- `ang` = dirección héroe→enemigo (la dirección del golpe).
- El enemigo mira hacia `e.facing`; su **espalda** apunta a `e.facing+π`.
- El héroe está detrás del enemigo ⟺ la dirección enemigo→héroe (`ang+π`) coincide con la espalda (`e.facing+π`) ⟺ **`|angDiff(ang, e.facing)| < rearArcDeg·π/360`** (mitad del arco, en radianes).
- Sanity: enemigo mira al héroe (frontal) ⇒ `ang` y `e.facing` opuestos ⇒ `|angDiff|≈π` ⇒ NO backstab. Enemigo comprometido mirando lejos + héroe rodó detrás ⇒ `ang≈e.facing` ⇒ `|angDiff|≈0` ⇒ backstab. ✔
- `rearArcDeg=120` ⇒ media-arco 60° detrás del enemigo.

---

## Requisitos NO-NEGOCIABLES (patrón de la casa — DoD EVO)

1. **$0 arte** — VFX proc reusando `spellburst`+`shockring`+`debris`+`floater`+`shakeAdd` con TINTE distinto (dorado-frío vs el dorado del REMATE). Sin PNG nuevos.
2. **RNG-neutral STRONG** — el backstab es **100% geometría/aritmética**: comparación de ángulos + multiplicación. **Sin draws ⇒ NO se crea `backstabRng`** (nada que sembrar). QA verifica srand ON==OFF con **backstab firing real** (golpe por la espalda aterrizando sobre un enemigo con facing comprometido). Lección CAS-1786/1822/1829/1834: probar la feature disparando, no sólo el flag.
3. **Save — decisión CTO: SIN nueva clave, cero crecimiento.** El efecto es transitorio en combate: se decide y aplica dentro de `hitEnemy` a partir de `e.facing` (que YA existe y YA no se serializa — `G.enemies` no entra a `serializeSave`). **NO se añade estado nuevo al héroe ni al enemigo.** ⇒ `save.v1` byte-idéntico ON u OFF, y **NO se crea `mithralda.backstab.v1`** (supera el DoD: cero superficie de save nueva; mirror exacto de POISE/COMBO).
4. **1 solo knob** `BACKSTAB { enabled:true, rearArcDeg:120, mult:1.8, knockMul:1.6 }` en `sim/config.js` (junto a COMBO/POISE). `enabled:false` ⇒ ninguna rama corre ⇒ comportamiento **byte-idéntico** a HEAD pre-feature (dmg/knock/VFX/save/srand).
5. **SOLO melee.** Gate `opt.melee` (consistente con la regla ranged de Parada CAS-1785 y del rematador CAS-1831). Un proyectil (`src` de proyectil) o nova NUNCA aplica backstab.
6. **Sin regresiones** frenzy/parry/dodge/telegraph/abilities/poise/combos — todos los seams son aditivos (un multiplicador más en el sink + un factor en la rama de knock ya existente). El backstab APILA con POISE.bonusDmg y el rematador CAS-1831 (los tres multiplican).

---

## Seams de implementación (guía precisa para el GE)

### 1) Knob — `sim/config.js` (junto a `COMBO`/`POISE`)
```js
export const BACKSTAB = { enabled:true, rearArcDeg:120, mult:1.8, knockMul:1.6 };
```

### 2) Sink de daño — `sim/sim.js`, en `hitEnemy`, **antes** de `e.hp-=dmg` (línea ~2062) y **antes** de la rama de knock (~2079)
Colocarlo justo después del rematador CAS-1831 (~línea 2061):
```js
// CAS-1836: GOLPE POR LA ESPALDA — un crítico POSICIONAL. Un golpe MELEE (opt.melee) que entra por el
// ARCO TRASERO del enemigo (el vector de ataque `ang` alineado con `e.facing` ⇒ el héroe está detrás)
// aplica ×mult daño y ×knockMul knockback. Geometría 100% pura — consume NO srand ⇒ ranged, frontal, o
// BACKSTAB.enabled=false ⇒ ×1 ⇒ byte-idéntico. Apila sobre POISE.bonusDmg + el rematador CAS-1831.
let backstab=false;
if(BACKSTAB.enabled && opt && opt.melee && e.facing!==undefined
   && Math.abs(angDiff(ang, e.facing)) < BACKSTAB.rearArcDeg*Math.PI/360){
  dmg*=BACKSTAB.mult; backstab=true; }
```
Importar `BACKSTAB` donde se importan `COMBO/POISE`; `angDiff` ya está en scope (usado en `applyHeroMelee`).

### 3) Knockback — apilar en la línea existente (~2079)
```js
const knockMul=((opt&&opt.knockMul)||1)*(backstab?BACKSTAB.knockMul:1);
```
(el default 1×1 preserva byte-id para todo lo demás).

### 4) VFX $0 — junto al bloque `if(punish)` del REMATE (~2098). Mirror con tinte distinto:
```js
if(backstab){ addFx("spellburst",e.x,e.y-2,{col:"#8fe3ff"}); addFx("shockring",e.x,e.y,{r:52,life:0.4}); addFx("debris",e.x,e.y,{ang,life:0.5}); shakeAdd(6);
  floater(e.x,e.y-34,STR.backstab||"¡POR LA ESPALDA!","#8fe3ff",{crit:true,pop:1.9,life:1.05}); }
```

### 5) strings.js — banner + nota de sinergia
- `backstab: "¡POR LA ESPALDA!"`
- Tooltip/ayuda: documentar que **rodar (Esquiva) tras un enemigo comprometido habilita el crítico posicional**.

---

## DoD de QA (PASS×2 live desktop+mobile, md5 live==HEAD por archivo tocado)

- **AC1 — OFF byte-id:** `BACKSTAB.enabled=false` ⇒ hit sequence + save + srand byte-idénticos a HEAD pre-feature (probar con golpe por la espalda que SIN feature sería normal).
- **AC2 — RNG-neutral STRONG:** srand ON==OFF byte-idéntico con **backstab firing real** (48-draw, `backstabFired=true`). 0 draws nuevos (NO `backstabRng`).
- **AC3 — sólo arco trasero:** golpe con `|angDiff(ang,e.facing)|<60°` ⇒ ×1.8 dmg + ×1.6 knock; golpe frontal (`≈180°`) ⇒ ×1 exacto. Barrido de ángulos alrededor del borde 60°.
- **AC4 — sólo melee:** un proyectil/nova sobre el mismo enemigo trasero ⇒ ×1 (sin `opt.melee`). Consistente con regla ranged de Parada.
- **AC5 — apila:** backstab × POISE.bonusDmg × rematador CAS-1831 sobre un enemigo staggered por la espalda = producto de los tres (medir contra baseline frontal no-staggered).
- **AC6 — save byte-id:** ni héroe ni enemigo ganan campos; `save.v1` idéntico ON/OFF.
- **REG:** frenzy/parry/dodge/telegraph/abilities/poise/combos siguen srand ON==OFF.
- **Feel:** mult 1.8 es punchy pero NO one-shot en bosses con poise (el bonus del boss stackeado debe seguir dejando HP).

---

## Cadena (patrón CTO-umbrella)

Build (GE) → Deploy (CTO) → QA (QA, PASS×2 live) → **Gate final CEO** (veredicto GO). Umbrella CAS-1836 cierra por `issue_children_completed` en el heartbeat del CTO.
