# CAS-1768 — Afijos de Arma on-hit (Weapon on-hit affixes) — design spec

**EVO beat.** Un arma dropeada puede rodar **0–1 afijo "al golpear"** que dispara un efecto
determinista al impactar un enemigo. Cambia de eje respecto a los últimos 3 beats
(Códice CAS-1751, Títulos CAS-1758, Pactos CAS-1763, todos meta-progresión): éste profundiza
el **combate momento-a-momento** y le da al loot textura de **build** (procs activos) que
complementa sockets/sets/runas (stats planos). Sinergia con Pactos: runs con más Heat premian
estos drops (más rareza ⇒ más chance de afijo).

Mismas reglas duras que los beats previos: **$0 arte** (glyph + tinte + VFX reusando primitivas
de partículas existentes), reversible por knob `WEAPON_AFFIXES.enabled`, **RNG-neutral STRONG**,
deploy overlay **0-leak**.

---

## 0. GUARDRAIL CRÍTICO — el afijo vive en `save.v1` (distinto a los 3 beats previos)

Los últimos 3 beats usaron un **blob AISLADO propio** (`codex.v1` / `titles.v1` / `pacts.v1`) y
nunca tocaron `save.v1`. **Éste NO puede**: el afijo se adjunta al ÍTEM, y los ítems (equipo + bolsa)
se serializan en `save.v1` vía `serializeSave` → `safeInst` (`sim/sim.js`).

**Regla save-safe (load-bearing, one-way door):**

- El afijo es **UN campo opcional trailing** en la instancia del arma: `wa:"<affixId>"` (string).
  Mismo patrón que los campos opcionales ya existentes `uniq` / `set` / `fl` en `safeInst`
  (`sim/sim.js:1076-1080`), que se **omiten del JSON cuando están ausentes** ⇒ save byte-idéntico.
- **Ausente = no-op total** y `save.v1` **byte-idéntico** para ítems pre-existentes / saves viejos.
- La **magnitud NO se almacena**: se **deriva** determinísticamente del `affixId` + tier/rareza del
  arma vía `WEAPON_AFFIXES` config. Esto mantiene la superficie de save en **un solo string opcional
  por arma** (blast-radius mínimo) y evita drift de magnitudes entre versiones.
- Cuando `WEAPON_AFFIXES.enabled=false`, `safeInst` **NO escribe `wa`** y el roll **NO ejecuta** ⇒
  `save.v1` byte-idéntico a un build sin la feature.
- **NO bump de `SAVE_VERSION`.** Campo aditivo, gated, retro-compatible con saves viejos.

**QA debe verificar explícitamente**: `save.v1` byte-idéntico para saves **sin** afijos, en ambos
casos `enabled=false` **y** `enabled=true` con cero afijos rodados.

---

## 1. Arquitectura — read/write mínimo sobre el ítem

- **Un solo campo opcional** `wa:"<affixId>"` en la instancia del arma (slot `weapon`). Sólo armas.
- **Roll en el drop** (append-only, stream dedicado) — ver §3.
- **Efecto en el único choke point de daño** `hitEnemy()` (`sim/sim.js:~1902`) — ver §4.
- **Magnitud derivada** de config, nunca almacenada — ver §2.
- Master kill-switch `WEAPON_AFFIXES.enabled` en `sim/config.js`. `false` ⇒ cero draws de
  `affixRng`, cero escritura de `wa`, cero evaluación de procs, sin glyph/tinte en HUD, y la secuencia
  `srand` + serialización `save.v1` **byte-idéntica** a un build sin la feature.

## 2. `sim/config.js` — el knob `WEAPON_AFFIXES` (mirror CODEX/TITLES/PACTS block)

Tabla fija (YAGNI — no un motor de reglas genérico). Pool ~5. Defaults conservadores; **todo el
tuning (chance de drop, chance de proc, magnitudes) vive en config** para retunear sin re-deploy de
lógica (DoD).

```js
export const WEAPON_AFFIXES = {
  enabled:true,
  // Chance de que un arma uncommon+ ruede 1 afijo, escalada por rank de rareza (índice RARITY.rank).
  // uncommon⇒idx0 … legendary⇒idx3. common NUNCA rueda (gate de rareza).
  dropChanceByRank:[0.10, 0.16, 0.24, 0.35],
  // Pool de 5 afijos on-hit. mag = magnitud base; se escala por tier del arma vía magPerTier.
  // kind selecciona el hook determinista en hitEnemy; 'chance' (si presente) usa affixRng (proc prob.).
  defs:[
    { id:"vampiric", name:"Vampírico", glyph:"❤", tint:"#c0304a",
      kind:"lifesteal", mag:0.08 },                         // cura al héroe 8% del daño infligido
    { id:"cadena",   name:"Cadena",    glyph:"⚡", tint:"#4aa0e0",
      kind:"chain",    mag:0.45, hops:1 },                  // rebota a 1 enemigo cercano por 45% del daño
    { id:"ardiente", name:"Ardiente",  glyph:"🔥", tint:"#e07a2a",
      kind:"burn",     mag:0.30 },                          // aplica DoT burn (reusa STATUS.burn)
    { id:"aturdidor",name:"Aturdidor", glyph:"✷", tint:"#e0d24a",
      kind:"stun",     mag:0.35, chance:0.15 },             // 15% prob. de aturdir (usa affixRng)
    { id:"perforante",name:"Perforante",glyph:"➹", tint:"#9a9aa0",
      kind:"pierce",   mag:0.25 },                          // ignora 25% de la reducción ARMORED del objetivo
  ],
  magPerTier:0.15,   // magnitud efectiva = mag * (1 + magPerTier*(tier-1))   (clamp defensivo)
  chainRange:3.5,    // radio (tiles) para elegir objetivo de Cadena
};
```

Ship conservador. Si el balance es incierto, magnitudes modestas + follow-up de tuning; **no** ampliar
scope (Arena/PvP fuera de v1).

## 3. Roll del afijo en el drop — stream dedicado `affixRng`, append-only

**Stream dedicado nuevo** en `sim/sim.js` (junto a `legRng`/`setRng`/`runeRng`/`mobRng`, ~L50-90):

```js
const affixRng = createRNG(0x0a771c5e);   // CAS-1768: weapon on-hit affix rolls
```

- **Cualquier** randomización (roll del afijo al drop, prob. de proc de Aturdidor) usa `affixRng`.
  **NUNCA** el `srand` base ⇒ garantiza `srand` byte-id ON==OFF (stream separado, igual que
  `legRng`/`setRng`; el base nunca avanza distinto).
- Hook **append-only** tras el roll normal del arma (después de `rollGearInst`, en el mismo lugar
  patrón que `maybeLegendary`/`maybeSetPiece`/`maybeSocketRune`):

  ```js
  function maybeWeaponAffix(inst){
    if(!WEAPON_AFFIXES.enabled) return inst;         // 0 draws, no-op
    if(!inst || inst.slot!=="weapon") return inst;   // sólo armas
    const rank = RARITY[inst.rarity]?.rank ?? 0;     // common=0 ⇒ gate
    if(inst.rarity==="common") return inst;          // gate de rareza (uncommon+)
    const p = WEAPON_AFFIXES.dropChanceByRank[Math.max(0,rank-1)] ?? 0;
    if(affixRng.srand() >= p) return inst;           // 1 draw SIEMPRE que enabled+arma+uncommon+
    const defs = WEAPON_AFFIXES.defs;
    inst.wa = defs[Math.floor(affixRng.srand()*defs.length)].id;  // 2º draw sólo si pasó
    return inst;
  }
  ```

  **Determinismo del número de draws**: cuando `enabled`, un arma uncommon+ consume **exactamente 1**
  draw de `affixRng` (el gate); si pasa, **1 más** para elegir el afijo. Armas common y no-armas
  consumen **0**. Esto es sobre `affixRng`, que no existe cuando `enabled=false` ⇒ base intacto.
- Uniques/set-pieces: v1 **puede** rodar afijo también (son epic/legendary ⇒ uncommon+). Alternativa
  conservadora si preocupa doble-fuente de poder: excluir `uniq`/`set` del roll (los uniques ya traen
  `mod.proc`). **Decisión CTO:** excluir `uniq`/`set` en v1 (evita apilar proc sobre proc legendario);
  el Build lo implementa como guard `if(inst.uniq||inst.set) return inst;`. Flaggeable como follow-up.

## 4. Aplicación del efecto — único choke point `hitEnemy()`

Todo daño héroe→enemigo pasa por `hitEnemy(e,dmg,ang)` (`sim/sim.js:~1815-1913`). El afijo del
**arma equipada** se lee y aplica una sola vez por golpe, junto al bloque de procs existente
(`weaponProcs` / L1902).

```js
// dentro de hitEnemy, tras aplicar dmg al enemigo, gated:
if(WEAPON_AFFIXES.enabled && !opt?.noAffix){
  const w = G.hero?.equip?.weapon;
  const af = w && w.wa && WEAPON_AFFIXES.defs.find(d=>d.id===w.wa);
  if(af) applyWeaponAffix(af, e, dmg, ang);
}
```

`applyWeaponAffix(af, e, dmg, ang)` — magnitud derivada `m = af.mag*(1+magPerTier*(tier-1))`:

| kind        | Efecto (determinista salvo `chance`)                                                                 | RNG        | VFX (reuso)                    |
|-------------|------------------------------------------------------------------------------------------------------|------------|--------------------------------|
| `lifesteal` | Cura al héroe `m*dmg`. **Rutea por el path de curación existente** ⇒ respeta Pacto Frágil (healCut). | ninguno    | `heal` (cruz verde) pequeño    |
| `chain`     | Elige el enemigo **más cercano ≠ e** dentro de `chainRange` (tie-break determinista por índice), le llama `hitEnemy(t, m*dmg, ang, {noAffix:true})`. | ninguno    | `spark`/`chainbolt` entre e→t  |
| `burn`      | `applyStatus(e,"burn",{dmg:m*dmg})` (reusa DoT existente).                                            | ninguno    | `flame`/`burn`                 |
| `stun`      | Con prob. `af.chance` (draw de `affixRng`): `applyStatus(e,"stun",{})`.                               | `affixRng` | `spellburst` tinte control     |
| `pierce`    | Reduce la reducción ARMORED del objetivo en `m` para ESTE golpe (se aplica antes del clamp de dmg). | ninguno    | `spark` tinte metálico         |

**Guardrails de implementación (blast radius / determinismo):**

- **Recursión de `chain`**: el rebote llama `hitEnemy(...,{noAffix:true})` ⇒ el 2º golpe **no**
  vuelve a proc-ear afijos (sin loop infinito, sin cascada). `chain.hops=1` en v1.
- **Selección de objetivo determinista**: nearest-por-distancia con desempate por índice de entidad
  (replay-safe). **Sin** `Math.random`.
- **`stun` es el único proc con RNG** y usa `affixRng` (no el base). Si `enabled=false`, ni siquiera
  se evalúa.
- `lifesteal` debe pasar por el mismo helper de curación que boons/pociones para heredar `healCut`
  (Pacto Frágil) y el clamp de `heroMaxHp` — no escribir `h.hp` directo.

## 5. HUD / presentación — $0 arte

- `hud.js`: en el tooltip/label del arma (equipada + bolsa), si `w.wa` y `enabled`, anteponer
  `glyph` + nombre del afijo con su `tint` (mirror de cómo se muestran rareza/uniq/set). Ausente ⇒
  sin cambio de layout.
- VFX on-hit: **sólo primitivas existentes** (`spark`, `flame`, `burn`, `heal`, `spellburst`,
  `chainbolt`) vía `addFx(kind,x,y,opt)`. **Cero sprites nuevos.** Si un `kind` no existe en
  `FXSPRITEMAP`, usar el genérico coloreado (`novacast`/`buffaura` con `col`) — no agregar assets.

## 6. AC RNG-neutral STRONG (no-negociable)

1. `WEAPON_AFFIXES.enabled=false` ⇒ **build byte-idéntico**: md5 de cada blob game-core tocado ==
   HEAD… salvo el propio `config.js` (que gana el knob con default `false` para el test) — el
   patrón probado: el harness compara con el knob apagado y verifica que sim/gear/hud/render/persist
   quedan byte-id y que `save.v1` + secuencia `srand` no cambian.
2. `save.v1` **byte-idéntico** para saves sin afijos (enabled=false **y** enabled=true-sin-roll).
3. `srand` byte-id **ON==OFF**: misma secuencia base (los draws de afijo viven en `affixRng`).
4. `enabled=true` **sin ningún afijo rodado** ⇒ no-op total (sin `wa` en ningún ítem, sin procs).
5. Un arma **con** `wa` guardada y recargada ⇒ roundtrip byte-id del campo; efecto reproducible en
   `hitEnemy` (mismo seed ⇒ mismos procs, incluido el `stun` de `affixRng`).

## 7. Cadena de entrega (estándar; ver descomposición en la umbrella CAS-1768)

design (este doc) → **Build** (GE) → **Deploy gh-pages** (CTO, overlay 0-leak) →
**QA LIVE PASS×2** (desktop+móvil, md5 live==HEAD de **cada blob game-core tocado** — no un conteo
fijo; probable set: `config.js`, `sim/gear.js`, `sim/sim.js`, `hud.js`, y `render/render.js` si toca
FX) → **Gate CEO**. Al aceptar el gate, cierra la umbrella por children_completed.

**NO originar 2º beat game-code paralelo** mientras éste ocupa la lane de deploy.

## 8. Fuera de scope v1 (YAGNI)

- Afijos en armadura/escudo (sólo armas).
- Múltiples afijos por arma (0–1).
- Re-roll / crafting de afijos, o afijos en Arena/PvP.
- Magnitud almacenada / rolleada por-ítem (se deriva de config).
- Nuevos sprites o partículas (reuso puro).
