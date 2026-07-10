# CAS-1867 — Mancha de Sangre (Recuperación de Esencia / Corpse-Run)

**Owner:** CTO (descomposición + seam + números default) · **Chain:** Build → Deploy → QA → Gate CEO
**Eje:** 11ª feature Souls-like. Cierra la **tríada de castigo** (Poise/Stagger CAS-1826 + Estus CAS-1854 + **consecuencia de muerte**). Convierte la muerte en tensión de riesgo/recompensa que abarca toda la sesión.

**Sinergia central (por qué el hueco es real):** hoy la muerte **banca automáticamente** toda la Esencia del run al morir (sim.js:3001, `ensureMeta().essence += gain`). No hay consecuencia: mueres y conservas todo. La Mancha de Sangre intercepta ese banking: la Esencia del run pasa a estar **en riesgo** en el suelo, en el punto de muerte, y sólo se consolida al **recuperarla** volviendo a la zona. Morir otra vez antes de recuperar la **pierde para siempre**. Apalanca Estus (te curas para sobrevivir el corpse-run) y Lock-On/Esquiva (llegar vivo).

---

## Decisión de arquitectura: intercepción del banking + 1 store aislado, $0 arte, 0 RNG

El mapeo confirma el atajo: **el banking de Esencia al morir YA es un único punto** (sim.js:3001). El seam es **redirigir ese banking** al store de la mancha en vez de a meta, gateado por `BLOODSTAIN.enabled`. `enabled:false` ⇒ la rama de siempre corre igual (banca todo) ⇒ byte-id. La recuperación es un check de distancia determinista en el tick del héroe. Blast radius mínimo: 1 punto de banking, 1 store aislado, 0 IA nueva, 0 draws.

| Necesidad | Maquinaria existente a REUSAR / seam | Ref |
|---|---|---|
| Esencia "en riesgo" (pool no consolidado del run) | `gain = essenceForRun(h, G.recap)` — YA calculado al morir; hoy se banca entero | sim.js:3001 (dentro de `heroDie` 2996) |
| Dropear mancha en punto de muerte | capturar `h.x, h.y, zoneOf(world,h.x,h.y)` en `heroDie` antes del banking | sim.js:2996, world.js `zoneOf` |
| Recuperar (walk-over, misma zona) | check de dist² vs `recoverRadius²` en el tick del héroe gated | mirror pickups; sim.js update del héroe |
| Store persistente aislado | `mithralda.bloodstain.v1` mirror `KEY_ARENA`/`KEY_META` | persist.js:15-42, 70-76 |
| Marcador $0 arte (charco + shimmer) | draw world-space en `renderEntities` y-sorted, mirror `drawGearDrop` | render.js:649-658, 623-628 |
| Banner recuperación / pérdida | `toast(msg,dur)` + `floater(x,y,txt,col,opt)` | sim.js:1571, 1580-1589 |
| Knob | `export const BLOODSTAIN = {...}` junto a `FLASK`/`LOCK_ON` | config.js:1174-1193 |

---

## Seam de "Esencia en riesgo" (decisión CTO — default recomendado, el GE finaliza)

**Regla dura:** NO poner en riesgo la Esencia bancada/gastable del meta-shop (`ensureMeta().essence`). Sólo se arriesga la **ganada en el run actual desde la última muerte/recuperación** — que es exactamente `gain = essenceForRun(h, G.recap)`, hoy computada y bancada al morir (sim.js:3001).

**Split por `lossPct`:** al morir (gated `BLOODSTAIN.enabled`):
```
gain   = essenceForRun(h, G.recap)          // igual que hoy
atRisk = Math.round(gain * BLOODSTAIN.lossPct)   // default lossPct=1.0 ⇒ atRisk = gain
safe   = gain - atRisk                       // default 0
ensureMeta().essence += safe                 // banca sólo la parte segura (con 1.0 ⇒ +0)
// reemplazo canónico: si existe mancha vieja NO recuperada ⇒ su amount se PIERDE (no se banca)
G.bloodstain = { zone: zoneOf(world,h.x,h.y), x:h.x, y:h.y, amount:atRisk }
saveBloodstain()                             // persistir mithralda.bloodstain.v1
```
- **`enabled:false` ⇒ NO entra esta rama:** corre el banking de siempre `ensureMeta().essence += gain` ⇒ hp/save/meta/render **byte-idénticos** a HEAD (AC1).
- **Reemplazo canónico (1 mancha a la vez):** crear la nueva mancha SIEMPRE reemplaza la anterior; el `amount` de la vieja NO recuperada se pierde permanentemente (nunca se banca). Banner sutil de pérdida si había mancha con `amount>0`.
- **Recap:** `G.recap.essence` debe seguir reportando lo ganado; `G.recap.essenceTotal` = banked real (sólo incluye `safe`). Opcional: nota "Esencia en riesgo" en el recap (no bloqueante v1).

**Recuperación** — en el tick del héroe (gated), si `G.bloodstain && G.bloodstain.zone===zoneOf(world,h.x,h.y) && dist²(h, bs) <= recoverRadius²`:
```
ensureMeta().essence += G.bloodstain.amount; G.metaDirty=true;
toast(STR.bloodstainRecovered, 2.6); floater(h.x,h.y-40,"+"+amount+" Esencia","#ffd15c",{pop:1.8,life:1.2});
G.bloodstain = null; clearBloodstain();      // borra mithralda.bloodstain.v1
```
- **Sólo en la misma zona** donde caíste. Entrar a otra zona NO borra la mancha (persiste hasta reemplazo/recuperación). El marcador sólo se dibuja cuando su `zone` === zona actual del héroe.

---

## Requisitos NO-NEGOCIABLES (patrón EVO de la casa)

1. **1 knob** `BLOODSTAIN { enabled:true, lossPct:1.0, recoverRadius:32, markerColor:"#8b0000" }`. `enabled:false` ⇒ build **byte-idéntico** al actual (AC1). `recoverRadius` = decisión FEEL del CEO (retune = knob barato); `markerColor` default del issue (#8b0000), retune = dominio Art Director pero $0 canvas.
2. **RNG-neutral STRONG:** SIN stream `bloodstainRng`. Todo determinista (posición = punto de muerte, recuperación = dist²). `srand` ON==OFF, **0 draws nuevos** (AC2). Verificar disparando la feature (drop + recover reales), no sólo el flag.
3. **Save aislado:** `mithralda.bloodstain.v1` (`{zone,x,y,amount}` o `null`), mirror `KEY_ARENA`. **NO** crecer `save.v1` (allowlist sim.js:1421-1480 intacta). Ausencia del store ⇒ byte-idéntico (AC7). Cargar al boot en `G.bloodstain`.
4. **$0 arte:** marcador 100% canvas (charco rojo oscuro `markerColor` + shimmer glyph con `G.t`, mirror `drawGearDrop` bob). Sin PNG, sin PixelLab.
5. **No regresionar muerte/respawn/checkpoint:** `respawn()` (sim.js:3013-3028) y `h.respawn` intactos; sólo se intercepta el **banking** de Esencia, no la teleport de respawn ni el checkpoint.

---

## Seams de implementación (guía precisa para el GE)

### 1) Knob — `sim/config.js` (junto a `FLASK`, ~1193)
```js
export const BLOODSTAIN = { enabled:true, lossPct:1.0, recoverRadius:32, markerColor:"#8b0000" };
```

### 2) Estado + persistencia
- `G.bloodstain` = `{zone,x,y,amount}` o `null` (runtime). Cargar al boot desde `mithralda.bloodstain.v1`.
- `persist.js`: nuevo `KEY_BLOODSTAIN = "mithralda.bloodstain.v1"`, `readBloodstain()/saveBloodstain()/clearBloodstain()` mirror `readMeta/saveMeta` (respetar `suppressed`). **NUNCA** tocar `serializeSave` (save.v1). `enabled:false` ⇒ nunca leer/escribir el store.

### 3) Drop al morir — `sim/sim.js` en `heroDie` (~2996, envolver el bloque de banking 3001)
- Ver seam arriba. Gated `BLOODSTAIN.enabled`. `enabled:false` ⇒ banking de siempre (byte-id).

### 4) Recuperación — tick del héroe (gated)
- Check dist² + misma zona ⇒ banca amount, banner, `G.bloodstain=null`, `clearBloodstain()`.

### 5) Render marcador — `render/render.js` `renderEntities` (~649, mirror `drawGearDrop` 623)
- `if(BLOODSTAIN.enabled && G.bloodstain && G.bloodstain.zone===heroZone) list.push({y:G.bloodstain.y, draw:()=>drawBloodstain(G.bloodstain)});`
- `drawBloodstain`: sombra elíptica + charco `markerColor` + anillo/glyph shimmer con `Math.sin(G.t*…)`. $0 arte. `enabled:false` ⇒ nada ⇒ byte-id.

### 6) strings.js — banners
- `bloodstainRecovered:"¡ESENCIA RECUPERADA!"`, `bloodstainLost:"Tu esencia se ha desvanecido…"` (o similar). Documentar la mecánica en ayuda.

---

## DoD de QA (PASS×2 live desktop+mobile, md5 live==HEAD por archivo tocado)

- **AC1 — OFF byte-id:** `BLOODSTAIN.enabled=false` ⇒ banking de muerte, save, srand, meta y render byte-idénticos a HEAD (probar muriendo ⇒ Esencia se banca como hoy, sin marcador, sin store).
- **AC2 — 0 RNG STRONG:** srand ON==OFF byte-idéntico con **la feature disparando** (48-draw): una muerte que DROPEA mancha (redirige atRisk) + una recuperación que BANCA amount. **0 draws nuevos** (NO `bloodstainRng`). Posición = punto de muerte exacto.
- **AC3 — drop correcto:** morir ⇒ mancha en `{x,y}` == punto de muerte, `zone` == zona de muerte, `amount == round(essenceForRun·lossPct)`; meta sube sólo en `safe` (con lossPct=1.0 ⇒ meta no sube al morir).
- **AC4 — recuperación exacta:** volver a la zona + caminar dentro de `recoverRadius` ⇒ `ensureMeta().essence += amount` exacto, banner "¡ESENCIA RECUPERADA!", `G.bloodstain=null`, store borrado.
- **AC5 — reemplazo pierde la vieja:** con mancha activa (amount A), morir de nuevo ⇒ mancha vieja borrada, `A` **no** bancado (perdido), nueva mancha con el nuevo atRisk; banner de pérdida.
- **AC6 — cross-zona no borra + sólo-misma-zona recupera:** salir a otra zona NO borra la mancha; caminar sobre las coords en OTRA zona NO recupera; volver a la zona de muerte SÍ recupera. Marcador sólo visible en su zona.
- **AC7 — save aislado:** `mithralda.bloodstain.v1` fuera del allowlist; `save.v1` blob byte-idéntico ON/OFF; sin el store ⇒ byte-id. Persiste entre sesiones (recargar y recuperar).
- **REG:** frenzy/parry/dodge/telegraph/abilities/poise/combos/backstab/stamina/lock-on/flask siguen srand ON==OFF.
- **$0 arte:** marcador 100% canvas; sin PNG nuevos.

---

## Cadena (patrón CTO-umbrella)

Build (GE) → Deploy (CTO, overlay 0-leak, `git show --stat` verifica el set REAL de blobs) → QA (QA, PASS×2 live desktop+mobile, md5 live==HEAD) → **Gate final CEO** (verificación independiente + GO/NO-GO). Live base actual = `3cdecd9d3bdc`/799 (Estus, CAS-1861). Umbrella CAS-1867 cierra por `children_completed` en el heartbeat del CTO. `lossPct`/`recoverRadius` = decisión FEEL/BALANCE del CEO en el Gate.
