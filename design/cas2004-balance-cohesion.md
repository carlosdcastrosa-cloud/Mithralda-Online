# CAS-2004 — Pase de Balance & Cohesión del kit Souls-like (24 mecánicas + Boss Rush)

**Owner:** CTO. **Tipo:** config-tuning, $0 arte, RNG-neutral, NO scope change.
**Build base:** live `c7cfc0e489e8`/799. **Blob tocado:** `sim/config.js` (ÚNICO — todos los knobs viven ahí ⇒ deploy de 1 blob, rollback = revert de ese blob).
**Determinismo:** 0 draws nuevos. Ningún knob tocado es una probabilidad (crit/proc-chance): todos son magnitudes deterministas ⇒ `srand ON==OFF` se preserva para el MISMO build. (El save byte-cambia respecto a HEAD por diseño — el punto del pase ES cambiar números de combate; la garantía RNG-neutral es "sin draws nuevos", no "byte-id al HEAD viejo".)

---

## Diagnóstico (auditoría del sim REAL, no de los comentarios)

Todo el daño melee del héroe embudo en **UN solo producto multiplicativo sin techo** en `sim/sim.js:2427` → post-multiplicadores en `hitEnemy` (`sim.js:2477–2582`) → aplicado crudo a `e.hp` en `sim.js:2583`. El único cap global del juego es `ATKSPD_TOTAL_CAP=130` (velocidad de ataque, `config.js:578`) — **no existe cap equivalente para daño.**

El stack determinista peor-caso que un jugador puede montar a propósito (0 RNG) alcanza **~47× daño base** antes de crit. El sub-stack más concentrado y realista en combate real es la **ventana de stagger de jefe**, donde DOS knobs se disparan sobre la MISMA condición `e.staggerT>0` y multiplican en el mismo golpe:

- `POISE.boss.bonusDmg = 1.9` (`sim.js:2563`)
- `COMBO.staggerPunishMul = 2.2` (`sim.js:2569`)
- ⇒ **4.18× combinado** sólo por abrir el stagger — convierte la ventana-clímax en un botón de borrado en vez de una recompensa.

Ese doble-dip es la **estrategia dominante #1** del kit (exactamente lo que la umbrella pide eliminar). Junto a él, tres afinaciones de presión de recurso/poise que hacen que el kit "muerda" como Souls-like en vez de sentirse gratis.

---

## TIER 1 — Cambios que SHIPPEAN en este pase (7 knobs, config-only, alta confianza)

| # | Knob | Archivo:línea | ANTES | DESPUÉS | Porqué (lente) |
|---|------|---------------|-------|---------|----------------|
| 1 | `COMBO.staggerPunishMul` | config.js:1132 | `2.2` | `1.6` | Doble-dip con POISE.boss sobre la misma condición stagger. Blast-radius: la ventana de stagger es la apertura dominante. |
| 2 | `POISE.boss.bonusDmg` | config.js:1107 | `1.9` | `1.6` | Mismo doble-dip. #1×#2: **4.18× → 2.56×** — el stagger de jefe sigue siendo una recompensa fuerte, deja de ser un delete. |
| 3 | `CFG.riposteMult` | config.js:62 | `2.4` | `2.0` | Ruta riposte = `2.4 × CRIT_BASE 1.6 = 3.84×` determinista, y apila con backstab/stagger. Trim mantiene el contragolpe satisfactorio sin one-shot. |
| 4 | `WEAPON_BUFFS.whet.dmgMul` | config.js:1407 | `1.35` | `1.22` | Piedra de Afilar: 1.35× por 25 s con 3 cargas + refill gratis por zona ⇒ uptime casi permanente ⇒ se lee como un +35% de daño BASE, no una decisión de preparación. Bajarlo lo devuelve a "prep vs jefe". |
| 5 | `STAMINA.regen` | config.js:1157 | `22` | `17` | Pool lleno regenera en ~4.5 s ⇒ rodar/pesados apenas se sienten limitados (el propósito entero del Pilar Estamina). 17/s hace morder la economía sin ahogar. |
| 6 | `HYPERARMOR.poiseThreshold` | config.js:1316 | `34` | `24` | Casi todo el daño de trash tier1–4 es 10–28, todo <34 ⇒ los swings comprometidos tienen inmunidad-a-interrupción casi total vs trash. A 24, los golpes ≥24 (medios/pesados) sí rompen; el chip no. La superarmadura sigue premiando el commit del pesado/finisher. |
| 7 | `STATUS_BUILDUP.bleed.procPctHp` | config.js:1430 | `0.14` | `0.11` | 14% maxHP por proc es fuerte en élites de HP alto (los jefes ya usan `bossProcPctHp 0.06`; los élites usan el 0.14 completo). Alinea la consistencia élite↔jefe. Determinista (procPctHp es un %, no una chance). |

**Efecto agregado sobre el stack peor-caso:** el sub-stack de stagger concentrado cae **4.18× → 2.56×**; el pico determinista de ~47× baja a ~29× y los outliers de burst (riposte/whet) se recortan. El techo teórico sin-cap sigue existiendo — se aborda en Tier-2 #A.

**Guardrails (lentes citadas):**
- **Reversibilidad:** config-only, 1 blob; rollback = `git revert` del blob de config. Cheap-to-reverse ⇒ apropiado shippear-luego-gate (patrón DoD #5 de la umbrella: el gate revisa el diff SERVIDO en vivo).
- **Blast radius:** ningún knob toca RNG/crit; ningún cambio añade/quita un draw; el harness de 24 sistemas debe seguir verde (ninguna mecánica se rompe, sólo cambian magnitudes).
- **YAGNI / load-bearing:** se recorta lo degenerado (el embudo de daño es lo que TODO el kit de combate apalanca) y no se toca lo que ya está balanceado (elite.bonusDmg 1.5, parry.riposteMul 1.5, backstab 1.8 en solitario, summon 0.55×, poison/frost buildup).

---

## TIER 2 — FLAGGED, NO se cambia en este pase → decisión del Gate CEO

Estos son one-way-doors subjetivos-de-feel o rozan "nueva mecánica"; los ruteo al owner (CEO) con recomendación en vez de swingearlos a ciegas. QA debe reportar FEEL cualitativo sobre A/B/C para informar la decisión.

- **#A — Cap global de daño (recomendado como follow-up separado).** El embudo de `sim.js:2583` no tiene techo (a diferencia de `ATKSPD_TOTAL_CAP`). El fix real sería un `Math.min` detrás de un knob `DAMAGE_STACK_CAP` (~12–15×). Requiere un *seam* en sim.js ⇒ roza "nueva mecánica" ⇒ **fuera del alcance "SÓLO valores de config" de esta umbrella.** Recomiendo: ticket propio con decisión de scope del CEO. Tier-1 #1–#4 ya recortan el sub-stack realista; el cap ataca la cola teórica.
- **#B — Inversión de curva Caldera vs Abismo.** El jefe de Caldera (Corazón de Magma `hp:1020/dmg:38`, config.js:408 + :765) está gateado MÁS ALTO que el Abismo (`CALDERA_POWER_REQ 10 > ABYSS_POWER_REQ 8`) pero es más débil que el jefe del Abismo (`hp:1500/dmg:48`, config.js:751). A nivel stat-crudo la curva se invierte. **PERO** calderatyrant recibe tratamiento `SIGNATURE_BOSS` (fase-2) que puede compensar la dificultad efectiva ⇒ no swingear +53% HP a ciegas. QA: reporta si Caldera *se siente* más suave que Abismo. Si sí ⇒ follow-up subiendo `ETPL.calderatyrant` + `HUNTS.caldera.boss` a `~1560/50` (mirror, ambos) — el cambio más reversible (2 valores).
- **#C — Orden de dificultad en Boss Rush.** `sequence=[caves,swamp,abyss,caldera]` con `hpStep 0.10`: el finale (caldera 1020) es más blando que el Abismo escalado de ronda-2 (1500×1.10=1650). El pico de HP está a mitad del gauntlet, no al final. Subir `hpStep` AMPLIFICA la inversión (no la arregla); el fix es reordenar la secuencia (poner abyss al final) — cambio de estructura del modo ⇒ decisión del CEO. QA: reporta la sensación de escalada.
- **#D — `HYPERARMOR.twoHandBonus = 1.0` (knob muerto, no-op).** Wired-neutral por diseño (config.js:1317, "el CEO lo sube sin rebuild"). Se deja parkeado intencionalmente; no es un bug.
- **#E — Sustain de Estus casi-infinito.** `FLASK.refillOnZone` + `BONFIRE.refillFlasks` recargan las 3 cargas gratis en cada cambio de zona. Es un staple Souls-like (rest = refill), pero el refill-por-swap-de-zona (sin descansar) diluye la economía. Monitor de QA-feel; potencial follow-up (quitar `refillOnZone` o `charges 3→2`) si el sustain se siente trivial.

---

## Cadena de entrega (blockedByIssueIds NO settable via PATCH ⇒ gate documentado aquí y en cada child)

1. **Build (GE)** — aplica el diff Tier-1 (7 knobs) en `sim/config.js`; extiende el harness go-forward para ASERTAR los 7 valores nuevos en el config servido + 24 sistemas verdes + `srand ON==OFF` (0 draws) + `node --check`. Ships los valores LIVE (no dark: son knobs de sistemas ya vivos, sin flag `enabled`).
2. **Deploy (CTO)** — overlay 1 blob (`sim/config.js`) a gh-pages, 0-leak (`git show --stat` toca EXACTAMENTE config.js + version.json), version flip, `md5 served==HEAD`.
3. **QA (QA)** — PASS×2 desktop+móvil vs LIVE: `md5 served==HEAD` de config.js, 24 sistemas verdes, boot 0 JS-err, 60fps, **+ reporte cualitativo ANTES/DESPUÉS de FEEL** sobre los 7 cambios (sin dominante/muerto obvio) y observaciones Tier-2 #B/#C/#E.
4. **Gate CEO** — verifica `version.json` live, diff de balance SERVIDO == este doc, lee el reporte de FEEL de QA ⇒ GO/NO-GO. Rollback = revert de 1 blob (config.js) si NO-GO.
