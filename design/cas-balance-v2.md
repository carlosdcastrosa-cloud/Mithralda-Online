# CAS-2065 — Balance & Cohesión v2 · pase COMPUESTO sobre 29 mecánicas Souls-like

**Owner:** CTO/GE. **Tipo:** config-tuning, $0 arte, RNG-neutral (0 draws nuevos), NO scope change.
**Build base:** live `d1043faa3064`/799. **Blob único tocable:** `sim/config.js` (todos los knobs viven ahí ⇒ deploy 1 blob, rollback = revert de ese blob).
**Predecesor:** CAS-2004 (Tier-1, 7 knobs, SHIPPED live). Este pase v2 = auditoría de INTERACCIONES COMPUESTAS que CAS-2004 no cubrió (armas/artes/resinas/two-hand/frenesí llegaron o crecieron después) + reevaluación de los diferidos #A (cap de daño) y #E (sustain de Estus).
**Input requerido:** QA Regression #51 (CAS-2064) — feed de FEEL/regresión. **Este doc = auditoría ESTÁTICA (lectura del sim real); los knobs NO se tocan hasta incorporar #51** (ver "Estado de entrega" al final).

---

## Método

Auditoría del sim REAL (no de los comentarios). Se rastrearon los DOS sinks donde todo el kit ofensivo/de-control converge, y se calculó el peor-caso COMPUESTO determinista (0 RNG) que un jugador puede montar a propósito.

### Sink de DAÑO melee — `sim/sim.js:2574` → `hitEnemy` (2643–2727) → crudo a `e.hp`
```
dmg = equippedDmg(h)
    × cfg.dmgMul                         // ataque base/ligero
    × (fin ? COMBO.finisherMul 1.6 : 1)  // 3er swing de cadena
    × (heavy ? COMBO.heavyDmgMul 1.7 : 1)
    × (th ? TWO_HAND.dmgMul 1.35 : 1)    // dos manos
    × archetype.dmgMul                   // greatsword 1.3 / dagger 0.85 / spear 1.0
    × art.dmgMul                         // Golpe de Carga 1.8 / Estocada 1.2 …
    × buffMul (resina)                   // whet 1.22 / ember 1.15 / frost 1.10
  — luego en hitEnemy —
    × PARRY.riposteMul 1.5   (ventana de 1 golpe tras parada con tempo)
    × CFG.riposteMult 2.0 × CRIT_BASE 1.6   (contra forzado-crit del riposte de CFG)
    × CRIT_BASE 1.6          (crit normal)
    × POISE.bonusDmg         (boss 1.6 / elite 1.5, si e.staggerT>0)
    × COMBO.staggerPunishMul 1.6  (si e.staggerT>0 && melee)
    × BACKSTAB.mult 1.8 × archetype.backstabMul (dagger 1.6 / greatsword 0.9)
    × (1 + FRENZY.dmgPct·stacks)  → 8 stacks = 1.24
```
**NO existe techo.** El único cap global del juego sigue siendo `ATKSPD_TOTAL_CAP 130` (velocidad, config.js:578). El daño se aplica crudo a `e.hp` (mismo hallazgo #A de CAS-2004, sigue abierto).

### Sink de POSTURA (poise-damage) — `sim/sim.js:2657–2667`
```
add = POISE.gain[light 12 / heavy 26 / ultimate 40]
    × (twoHand ? TWO_HAND.poiseMul 1.5 : 1)
    × archetype.poiseDmgMul   // greatsword 1.5 / dagger 0.6 / spear 1.0
    × art.poiseDmgMul         // Golpe de Carga 2.2 / Tajo 1.2 / Estocada — …
```
Techo de postura: `POISE.elite.max 100`, `POISE.boss.max 280`. Guardrail: `POISE.reStaggerCD 6.0s` (evita lock infinito).

---

## Hallazgos priorizados

Confianza = qué tan seguro estoy de que el fix mejora la cohesión sin efecto colateral. Riesgo = blast-radius del knob. **Regla del pase:** sólo se SHIPPEA lo ALTO-confianza + BAJO-riesgo y NO-compuesto; el resto se rutea al Gate CEO con recomendación (evitar nerfs compuestos a ciegas — baseline ×1 donde haya duda).

### F1 · Doble-dip de POSTURA: greatsword × two-hand × Arte (poise-stack) — **ALTA conf, riesgo BAJO-MEDIO**
El poise-damage multiplica TRES knobs sobre el MISMO swing (2660/2663/2666):
- `TWO_HAND.poiseMul 1.5` × `greatsword.poiseDmgMul 1.5` × `WEAPON_ARTS.greatsword.poiseDmgMul 2.2` = **4.95×**.
- Un "Golpe de Carga" a dos manos = `26 × 4.95 = 128.7` postura en UN swing.
- ⇒ **rompe un ÉLITE (max 100) de un solo botón**, y un JEFE (max 280) en ~2 golpes de Arte.
- Consecuencia de cohesión: staggerea tan rápido que abre la ventana de daño-bonus (F2) casi a voluntad ⇒ el loop greatsword+dosmanos+Arte se auto-refuerza y se vuelve el verbo DOMINANTE de control.

**Tweak propuesto (1 knob, NO compuesto):** `WEAPON_ARTS.classes.greatsword.poiseDmgMul 2.2 → 1.8`.
Es el multiplicador de postura OUTLIER (el resto de artes: sword 1.2, spear ausente ×1). Bajarlo: art gs = `26×1.5×1.5×1.8 = 105` postura ⇒ élite aún staggerable de 1 golpe (es su identidad de "rompe-postura"), jefe pasa de ~2 a ~3 golpes de Arte. **No toca daño, no toca las otras 3 armas, reversible.** Justificación: recorta SÓLO el outlier del doble-dip, no aplica un nerf-a-todo. Riesgo: FEEL — necesita confirmación de QA #51 de que el stagger de greatsword se siente "gratis" hoy. Confianza ALTA en la mecánica, MEDIA en el número exacto ⇒ candidato #1 a shippear tras #51.

### F2 · Ventana de stagger = doble-dip de DAÑO (POISE.bonusDmg × staggerPunishMul) — **YA mitigado por CAS-2004, MONITOR**
Ambos disparan sobre `e.staggerT>0` (2711 + 2717): boss `1.6 × 1.6 = 2.56×`. CAS-2004 ya lo bajó de 4.18× a 2.56× y lo aceptó como "recompensa fuerte, no delete". **No re-tocar** salvo que #51 reporte que sigue borrando jefes. Baja prioridad.

### F3 · Cola de daño SIN TECHO (#A, heredado de CAS-2004) — **estructural, fuera de config-only ⇒ Gate CEO**
El peor-caso realista concentrado: un FINISHER de cadena a dos manos (greatsword) que entra como BACKSTAB sobre un jefe STAGGEREADO, con whet + 8 frenesí + crit:
`1.6(fin)×1.35(2h)×1.3(gs)×1.22(whet)×1.6(crit)×1.6(poise-boss)×1.6(staggerPunish)×1.62(backstab·gs 0.9)×1.24(frenzy) ≈ 28× equippedDmg`.
Requiere setup de maestría (stagger + posición trasera + cadena + buff + frenesí + crit) ⇒ es una expresión de skill, no un exploit trivial. Pero la COLA es ilimitada: sin un `Math.min` detrás de un knob (`DAMAGE_STACK_CAP ~12–15×`) el techo teórico crece con cada arma/afijo nuevo. **Requiere un seam en sim.js ⇒ roza "nueva mecánica" ⇒ FUERA del alcance "SÓLO config" de esta umbrella.** Recomendación al CEO: ticket propio con decisión de scope (mismo veredicto que CAS-2004 #A; sigue siendo el fix estructural correcto). F1 ya recorta la FRECUENCIA con que se abre la ventana de stagger que habilita este pico.

### F4 · Two-handing casi estrictamente DOMINANTE para juego agresivo — **MEDIA conf, riesgo MEDIO ⇒ Gate CEO**
`TWO_HAND` da +35% daño (dmgMul 1.35) + +50% postura (poiseMul 1.5) + al envainar el escudo BAJA el peso de `EQUIP_LOAD` ⇒ puede subir de banda (fat→mid→fast) ⇒ **más i-frames y más distancia de rodada** (F6). Coste: sólo `stamMul 1.15` en power-swings + perder el bloqueo — que un jugador agresivo no usa. `moveMul 1.0` = 0 penalización de movilidad. ⇒ Para builds sin escudo es PURO upside. No es un bug (la sinergia peso↓ es intencional, CAS-1895), pero rompe la cohesión "toggle = tradeoff". Palancas posibles: `TWO_HAND.moveMul 1.0→0.95` o `stamMul 1.15→1.25`. **Ambos son compuestos/FEEL ⇒ NO swingear a ciegas.** Rutear a CEO; QA #51 debe reportar si dos-manos se siente "sin desventaja".

### F5 · Triple economía de recarga-gratis-por-zona (sustain, #E ampliado) — **MEDIA conf ⇒ Gate CEO**
TRES consumibles se rellenan gratis en CADA cambio de zona Y en cada hoguera: `FLASK.refillOnZone` (3 cargas, 40% HP c/u = 120% HP/zona), `WEAPON_BUFFS.refillOnZone` (resinas, incl. whet 1.22×), `THROWABLES.refillOnZone` (6+3 cargas). Con `BONFIRE.respawnEnemies` (world-reset) el ciclo descanso→farm→refill diluye la escasez que da tensión Souls-like. CAS-2004 ya bajó whet 1.35→1.22 por su uptime casi-permanente. Diferido #E original (Estus). Palancas: quitar `refillOnZone` de resinas/throwables (dejar sólo BONFIRE), o `FLASK.charges 3→2`. **One-way-door de FEEL ⇒ decisión CEO.** QA #51: reportar si el sustain se siente trivial.

### F6 · EQUIP_LOAD bandas vs DODGE i-frames — **COHERENTE, sin acción**
`DODGE.iframeMs 280` × banda (fast 1.15=322ms / fat 0.7=196ms / over 0=sin rodada). Es un tradeoff limpio y `overCanRoll:false` cierra el abuso. El loadout inicial (13/20=0.65) cae en MID (todo ×1) ⇒ feel base intacto. Única interacción a vigilar = F4 (two-hand baja peso). Sin tweak propio.

### F7 · FRENZY dmg/atkspd stack — **COHERENTE, sin acción**
8 stacks = +32 atkspd (ENTRA al `ATKSPD_TOTAL_CAP 130` ⇒ acotado) + `1.24×` daño. El daño 1.24× multiplica todo pero es modesto y la ventana (3.0s) exige mantener kills. No degenerado. Baseline ×1, no tocar.

### F8 · STATUS_BUILDUP bleed vs atk-speed — **COHERENTE, sin acción**
`bleed build 16 / threshold 100` ⇒ ~7 golpes físicos por proc de `0.11 maxHP`; jefes usan `bossProcPctHp 0.06` + `bossBuildMul 0.55` (acumulan más lento). CAS-2004 ya alineó élite↔jefe (0.14→0.11). Con frenesí+arma rápida procea más seguido pero el % es acotado. Sin tweak.

---

## Qué SHIPPEA este pase vs qué se DIFIERE al Gate CEO

| Item | Confianza | Riesgo | Disposición |
|------|-----------|--------|-------------|
| **F1** `WEAPON_ARTS.greatsword.poiseDmgMul 2.2→1.8` | ALTA (mec) / MEDIA (nº) | BAJO (1 knob, no-dmg, no-compuesto) | **SHIP tras incorporar QA #51** vía cadena Build/Deploy/QA/Gate |
| F2 stagger double-dip | — | — | Ya mitigado CAS-2004; MONITOR en #51 |
| F3 cap de daño (#A) | ALTA (existe) | ALTO (seam sim.js) | **Gate CEO** — ticket propio, fuera de config-only |
| F4 two-hand dominante | MEDIA | MEDIO (compuesto/FEEL) | **Gate CEO** con recomendación; QA-feel |
| F5 triple refill sustain (#E) | MEDIA | MEDIO (one-way FEEL) | **Gate CEO**; QA-feel |
| F6/F7/F8 | — | — | Coherentes, baseline ×1, sin acción |

**Guardrails (lentes citadas):**
- **Reversibilidad:** todo config-only, 1 blob; rollback = revert del blob. Cheap-to-reverse ⇒ apropiado shippear-luego-gate (el gate revisa el diff SERVIDO en vivo).
- **Evitar nerfs compuestos:** sólo se swingea F1 (UN knob, el outlier del doble-dip de postura). F4/F5 son compuestos/FEEL ⇒ se documentan y rutean, NO se tocan a ciegas.
- **RNG-neutral:** ningún knob candidato es una probabilidad; F1 es una magnitud determinista ⇒ `srand ON==OFF` para el mismo build. 0 draws nuevos.
- **Blast radius:** F1 no toca RNG/crit/daño; el harness de 29 sistemas debe seguir verde (ninguna mecánica se rompe, sólo cambia la magnitud de postura del Arte de greatsword).

---

## Cadena de entrega (tras incorporar QA #51)

1. **Build (GE)** — aplica F1 en `sim/config.js` (+ cualquier item que #51 promueva a ALTA-conf); extiende el harness go-forward para ASERTAR el valor nuevo en el config servido + 29 sistemas verdes + `srand ON==OFF` (0 draws) + `node --check`. Ship LIVE (knob de sistema ya vivo, sin flag `enabled`).
2. **Deploy (CTO)** — overlay 1 blob (`sim/config.js`) a gh-pages, 0-leak (`git show --stat` == EXACTAMENTE config.js + version.json), version flip, `md5 served==HEAD`.
3. **QA** — PASS×2 desktop+móvil vs LIVE: `md5 served==HEAD`, 29 sistemas verdes, boot 0 JS-err, 60fps + reporte cualitativo ANTES/DESPUÉS de FEEL sobre F1 (stagger de greatsword ya no "gratis") + observaciones F4/F5.
4. **Gate CEO** — verifica `version.json` live + diff SERVIDO == este doc + lee FEEL de QA ⇒ GO/NO-GO sobre F1, y decisión de scope sobre F3/F4/F5. Rollback = revert de 1 blob si NO-GO.

## Estado de entrega

**BLOQUEADO en CAS-2064 (QA Regression #51).** La umbrella exige incorporar sus hallazgos ANTES de tocar knobs; a la fecha #51 está `in_progress` sin reporte publicado. Este doc (auditoría estática, entregable #1) queda COMPLETO y committeado. Al resolverse #51 (wake `issue_blockers_resolved`): incorporar findings → implementar F1 (+ promovidos) → correr cadena → cerrar `in_review` apuntando al Gate CEO.
