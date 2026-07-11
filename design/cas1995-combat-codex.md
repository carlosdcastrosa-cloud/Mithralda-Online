# CAS-1995 — EVO Discoverability: Códice de Combate + Hints Contextuales

**Owner:** CTO (decomp) · **Umbrella:** Gameplay Evolution / Player Experience (NO-gated, CEO-directed 07-10)
**Pattern:** 25ª cosecha del kit. `enabled:false` DARK a live, QA arma runtime, Gate CEO flip (mirror los 24 pilares).
**Constraint core:** $0 arte · RNG-neutral STRONG · save aislado · 1 knob · 0 regresión.

---

## 0. Tesis arquitectónica — BORROW, no invent (Build-vs-Borrow lens)

El motor YA tiene TRES paneles read-only, gated, toggle-por-tecla-fija que son la **misma especie** que el Códice de Combate:

| Panel existente | scene | tecla fija | knob gate | render fn | store |
|---|---|---|---|---|---|
| Códice de Botín (CAS-1751) | `codex` | `KeyK` | `CODEX.enabled` | `renderCodex()` | `mithralda.codex.v1` |
| Títulos de Gesta (CAS-1758) | `titles` | `KeyY` | `TITLES.enabled` | `renderTitles()` | `mithralda.titles.v1` |
| Pactos de Poder (CAS-1763) | `pacts` | `KeyL` | `PACTS.enabled` | `renderPacts()` | `mithralda.pacts.v1` |

El **Códice de Combate se clona de este patrón exacto.** Los hints contextuales se clonan del primitivo `toast(str,secs)` (sim.js, ya usado ~15 veces) gateado tras un store aislado nuevo. Cero infra nueva.

**Decisiones CTO cerradas (no re-litigar en Build):**

1. **Nombre del knob = `COMBAT_CODEX`.** `CODEX` YA está tomado (config.js:930 = sistema de bonus de loot uniques/sets/runes; NADA que ver con un códice de referencia). El ticket ya pide `COMBAT_CODEX` — correcto.
2. **`codexKey` = `"Backquote"` (la tecla `` ` `` / `~`).** El ticket sugería `KeyH` pero **KeyH YA es la Parada con Tempo/Parry** (config.js:1018/1027) — colisión de la misma clase que mordió a Summon/BossRush. **Las 26 letras están ocupadas** (20 en REBINDS settings.js:26-51 + `KeyH` Parry + `KeyN` heavy/summon + `KeyU` flask + `KeyK`/`KeyY`/`KeyL` los tres paneles). `Backquote` está LIBRE (grep-verificado: no aparece en input.js/settings.js/config.js) y se maneja en el mismo fixed-handler de la escena play que KeyK. **CTO-tunable.** Alternativa documentada si `Backquote` incomoda en algún layout: `F1` (window-level + preventDefault, precedente overlay.js:F9) — pero el pick es `Backquote`.
3. **Ship `enabled:false` DARK.** Blast-radius=0 en deploy, rollback trivial, mirror de los 24 pilares. QA arma `enabled:true` en runtime (bytes==HEAD). Gate CEO decide el flip live. Recomendación CTO al gate: **FLIP GO** (UX pura, $0 arte, 0 balance, save aislado, RNG-neutral ⇒ riesgo mínimo; la profundidad sin descubribilidad = valor perdido).
4. **Un solo Build (GE hace A+B).** A y B comparten el mismo knob y tocan los mismos 5 blobs; están acoplados (Conway: un módulo, un dueño). Partirlos añade coordinación sin beneficio.

---

## 1. COMPONENTE A — Códice de Combate (panel de referencia data-driven)

### SEAM A1 — knob `COMBAT_CODEX` (config.js, al FINAL del archivo tras `BOSS_RUSH` ~L1679)
```js
export const COMBAT_CODEX = {
  enabled: false,           // ships DARK; Gate CEO flip (mirror SUMMON/BOSS_RUSH). enabled:false ⇒ TODO inerte, byte-id HEAD.
  codexKey: "Backquote",    // CODE fijo NO rebindable (KeyH=Parry ⇒ tomado; 26 letras ocupadas; ` libre). CTO-tunable.
  showContextHints: true,   // sub-toggle: apaga SÓLO los hints (B); el códice (A) sigue funcionando.
  toastSecs: 4.5,           // duración del toast de hint (reusa toast(str,secs); 0 RNG).
  showHudHint: true,        // afordancia HUD "[`] Códice" (discoverability del propio códice). $0 arte.
};
```

### SEAM A2 — tabla DATA-DRIVEN `COMBAT_CODEX_ENTRIES` (config.js, al FINAL tras el knob — DEBE ir después de que todos los knobs referenciados existan)
La tabla NO hardcodea teclas: cada entrada lee el knob VIVO por getter, de modo que si el CTO retunea un binding, el códice se actualiza solo. Cada entrada:
```js
// { group, label, keyOf:()=>KNOB.key|throwKey|..., desc, gate:()=>KNOB.enabled }
export const COMBAT_CODEX_ENTRIES = [
  // MOVIMIENTO
  { group:"Movimiento", label:"Rodar (i-frames)",  keyOf:()=>"Rodar",              desc:"Esquiva con fotogramas de invulnerabilidad; cuesta STAMINA.", gate:()=>DODGE.enabled },
  { group:"Movimiento", label:"Fijar objetivo",    keyOf:()=>LOCK_ON.key,          desc:"Lock-on: fija la cámara/orientación al enemigo; cicla objetivos.", gate:()=>LOCK_ON.enabled },
  { group:"Movimiento", label:"Postura a 2 manos", keyOf:()=>TWO_HAND.key,         desc:"Alterna a dos manos: +daño/poise, -velocidad.", gate:()=>TWO_HAND.enabled },
  // DEFENSA
  { group:"Defensa",    label:"Parada con Tempo",  keyOf:()=>PARRY.key,            desc:"Parry: pulsa con timing para anular el golpe y abrir riposte.", gate:()=>PARRY.enabled },
  { group:"Defensa",    label:"Bloqueo con escudo",keyOf:()=>SHIELD_BLOCK.key,     desc:"Mantén para levantar la guardia y reducir daño (consume stamina).", gate:()=>SHIELD_BLOCK.enabled },
  { group:"Defensa",    label:"Poise / Hiperarmor",keyOf:()=>"—",                  desc:"Aguante: no te interrumpen mientras dure el poise/hiperarmor.", gate:()=>(POISE.enabled||HYPERARMOR.enabled) },
  // OFENSIVA
  { group:"Ofensiva",   label:"Ataque pesado",     keyOf:()=>COMBO.heavyKey,       desc:"Golpe cargado; rompe poise y encadena combos.", gate:()=>COMBO.enabled },
  { group:"Ofensiva",   label:"Puñalada por la espalda", keyOf:()=>"Espalda",      desc:"Backstab: golpea desde el arco trasero para daño masivo.", gate:()=>BACKSTAB.enabled },
  { group:"Ofensiva",   label:"Arte de Arma",      keyOf:()=>WEAPON_ARTS.key,      desc:"Ejecuta el Arte del arquetipo de arma equipado.", gate:()=>WEAPON_ARTS.enabled },
  { group:"Ofensiva",   label:"Arrojar",           keyOf:()=>THROWABLES.throwKey,  desc:"Lanza el consumible arrojadizo seleccionado; cicla el tipo.", gate:()=>THROWABLES.enabled },
  { group:"Ofensiva",   label:"Aplicar resina",    keyOf:()=>WEAPON_BUFFS.applyKey,desc:"Unta el arma con una resina para buff temporal de daño/estado.", gate:()=>WEAPON_BUFFS.enabled },
  // RECURSOS
  { group:"Recursos",   label:"Beber Estus",       keyOf:()=>FLASK.key,            desc:"Cura por carga; se recarga en zona/hoguera.", gate:()=>FLASK.enabled },
  { group:"Recursos",   label:"STAMINA",           keyOf:()=>"—",                  desc:"Sin stamina no puedes rodar ni lanzar pesados; se regenera.", gate:()=>STAMINA.enabled },
  { group:"Recursos",   label:"Invocar espíritu",  keyOf:()=>SUMMON.key,           desc:"Cenizas de Espíritu: invoca un aliado que divide la aggro del jefe.", gate:()=>SUMMON.enabled },
  { group:"Recursos",   label:"Hoguera",           keyOf:()=>BONFIRE.key,          desc:"Descansa: cura, recarga Estus y fija checkpoint.", gate:()=>BONFIRE.enabled },
  { group:"Recursos",   label:"Mancha de sangre",  keyOf:()=>"—",                  desc:"Al morir sueltas la Esencia; recupérala en el punto de muerte.", gate:()=>BLOODSTAIN.enabled },
  // JEFES
  { group:"Jefes",      label:"Jefe de Firma",     keyOf:()=>"—",                  desc:"Jefes de 2 fases con ventana de vulnerabilidad tras romper poise.", gate:()=>true },
  { group:"Jefes",      label:"Modo Boss Rush",    keyOf:()=>BOSS_RUSH.key+" (menú)",desc:"Gauntlet finito de jefes encadenados; récord = mejor ronda.", gate:()=>BOSS_RUSH.enabled },
  { group:"Jefes",      label:"Arena de Oleadas",  keyOf:()=>ARENA.key+" (menú)",  desc:"Oleadas infinitas con jefes periódicos; récord = mejor oleada.", gate:()=>ARENA.enabled },
];
```
> Build: la lista final de entradas la ajusta el GE para cubrir las 24 mecánicas vivas; el REQUISITO DURO es que la tecla salga de un getter sobre el knob real (nada hardcodeado que pueda mentir). Entradas con `keyOf` textual ("Rodar"/"Espalda"/"—") son mecánicas sin tecla dedicada (roll usa dirección+stamina; backstab es posicional; poise/stamina/bloodstain/signature son pasivas) — se etiquetan honestamente, NO se inventa un binding.

### SEAM A3 — `ACTIONS.combatCodex` (input.js, mirror `ACTIONS.codex` L72)
```js
combatCodex:()=>{ if(COMBAT_CODEX.enabled) G.scene="combatcodex"; },
```

### SEAM A4 — alias de tecla fija en el handler de play (input.js, mirror KeyK L253)
```js
if(COMBAT_CODEX.enabled && code===COMBAT_CODEX.codexKey){ ACTIONS.combatCodex(); return; }
```
Gated ⇒ `enabled:false` ⇒ la rama nunca corre ⇒ tecla inerte ⇒ byte-id.

### SEAM A5 — cierre + scroll de la escena (input.js, mirror L230)
```js
if(G.scene==="combatcodex"){
  if(code===COMBAT_CODEX.codexKey||code==="Escape"){ G.scene="play"; return; }
  if(code==="ArrowUp") G.ccScroll=Math.max(0,(G.ccScroll||0)-1);
  else if(code==="ArrowDown") G.ccScroll=(G.ccScroll||0)+1;   // clamp al alto en render
  return;
}
```
Añadir `COMBAT_CODEX.codexKey` a la lista de `preventDefault` de play (input.js:129) para que `` ` `` no dispare el default del navegador (mirror del tratamiento Tab/ShiftLeft).

### SEAM A6 — `renderCombatCodex()` (render/render.js, clona `renderCodex`)
Panel scrollable, fuente `MithraldaPixel` (FF), primitivas de panel YA usadas (fillRect semitransparente + borde + texto), **$0 arte** (0 carga de assets). Itera `COMBAT_CODEX_ENTRIES.filter(e=>e.gate())` agrupado por `group` en el orden Movimiento·Defensa·Ofensiva·Recursos·Jefes. Cada fila: `[tecla]  Etiqueta — descripción`. Aplica `G.ccScroll` como offset vertical y clampa. Header: "CÓDICE DE COMBATE  ([`] cerrar)".

### SEAM A7 — dispatch de escena (render/render.js:305, junto a codex/titles/pacts)
```js
if(G.scene==="combatcodex") renderCombatCodex();
```

### SEAM A8 — afordancia HUD (hud.js, opcional, gated `COMBAT_CODEX.enabled && showHudHint`)
Texto minúsculo en esquina: `` [`] Códice `` — resuelve la descubribilidad del propio códice. $0 arte, sólo texto MithraldaPixel. Puramente presentacional, cero sim.

---

## 2. COMPONENTE B — Hints contextuales de primer-encuentro (toasts one-time)

### SEAM B1 — store AISLADO `mithralda.hints.v1`
- **sim.js**: `serializeHints()` / `loadHints()` (mirror `serializeCodex`/`loadCodex`); estado `G.hintsSeen={}` (mapa id→true). Ausencia de clave ⇒ default previo ⇒ byte-id.
- **persist.js**: `const KEY_HINTS="mithralda.hints.v1"` + `readHints`/`writeHints` + flush `hintsDirty` (mirror `KEY_CODEX`/`codexDirty` L38,111-113). `save.v1`/`meta`/`arena`/`codex`/`titles`/`pacts`/`bloodstain` INTACTOS — nunca comparten clave.

### SEAM B2 — `fireHint(id, text)` (sim.js)
```js
function fireHint(id, text){
  if(!COMBAT_CODEX.enabled || !COMBAT_CODEX.showContextHints) return;  // gate DURO
  if(G.hintsSeen[id]) return;                                          // one-time
  G.hintsSeen[id]=true; hintsDirty=true;                              // persistir en mithralda.hints.v1
  toast(text, COMBAT_CODEX.toastSecs);                                 // primitivo existente, 0 RNG
}
```
**RNG-neutral STRONG:** `toast` sólo escribe `G.toast`/`G.toastT` (no toca ninguna corriente RNG). `fireHint` no hace draws. Con `enabled:false` ⇒ retorno temprano ⇒ 0 estado, 0 store I/O, 0 toast ⇒ save+srand byte-id a HEAD.

### SEAM B3 — ≥4 puntos de disparo cableados a eventos sim EXISTENTES (0 draws nuevos)
| id | evento existente | texto (data-driven la tecla vía el knob) |
|---|---|---|
| `hint_stamina` | 1ª vez stamina agotada / roll denegado por stamina (STAMINA `spendStam`) | "Sin STAMINA no puedes rodar ni lanzar pesados — espera a que regenere." |
| `hint_boss` | 1er jefe enganchado (spawn/aggro de jefe) | `` `${LOCK_ON.key}`: fija objetivo (Lock-On) · Parada con tempo · rueda para i-frames." `` |
| `hint_bonfire` | 1ª hoguera en proximidad/vista (BONFIRE) | `` `${BONFIRE.key}`: descansa, cura y recarga Estus." `` |
| `hint_flask` | 1ª carga de Estus disponible / 1er HP bajo | `` `${FLASK.key}`: bebe Estus para curarte." `` |
| `hint_codex` (5º, cierra el loop) | 1ª entrada a la escena play | `` `Pulsa \`${COMBAT_CODEX.codexKey==='Backquote'?'`':COMBAT_CODEX.codexKey}\` para el Códice de Combate." `` |

> Textos con la tecla interpolada desde el knob real (misma filosofía data-driven que A). Los puntos de disparo se cablean tocando SÓLO ramas ya existentes con una llamada `fireHint(...)`; ninguna rama nueva de daño/RNG.

### SEAM B4 — gate global
Todos los fire-points ⇒ inertes si `!COMBAT_CODEX.enabled` (ya cubierto por B2). `showContextHints:false` ⇒ hints OFF pero el códice (A) sigue vivo.

---

## 3. RNG-neutralidad & aislamiento (la barra dura)

- **enabled:false ⇒ byte-id HEAD:** ninguna rama de A ni B corre. `mithralda.hints.v1` NO se crea. `save.v1`+srand byte-idénticos.
- **0 draws nuevos incluso enabled:true:** códice sólo LEE config/estado; hints sólo llaman `toast` (no-RNG). srand ON==OFF.
- **Save append-only:** store propio aislado; los 8 stores existentes intactos.

## 4. Deploy (blobs)
Overlay estimado **5 blobs**: `sim/config.js` · `sim/sim.js` · `input.js` · `render/render.js` · `persist.js` (+ `hud.js` SI se hace A8). **El set REAL lo fija Build** vía `git diff --stat <base-src> HEAD` (patrón cas1988/cas1954). Harness dev-only NO se despliega. Tool = clon de `tools/cas1988-deploy.mjs`. DoD deploy: version flip poll, md5 served==HEAD por-blob http200, 0-leak (commit toca EXACTAMENTE los N blobs+version.json), servido `COMBAT_CODEX.enabled:false` byte-id DARK.

## 5. Criterios de aceptación (QA — OBSERVABLE driving el loop real, PASS×2)
- **AC0** knob OFF ⇒ `save.v1`+srand byte-idénticos a HEAD; `mithralda.hints.v1` NO existe; codexKey inerte.
- **AC1** codexKey abre `scene==="combatcodex"` (enabled:true); codexKey/Escape cierran a play.
- **AC2** el códice lista las mecánicas VIVAS agrupadas (Movimiento·Defensa·Ofensiva·Recursos·Jefes), cada una con keybind + 1 línea.
- **AC3** DATA-DRIVEN: retunear un binding en config (p.ej. `FLASK.key`) ⇒ el texto del códice muestra la tecla NUEVA. QA asserta `textoCodex(FLASK) === FLASK.key`. Nada hardcodeado.
- **AC4** el códice sólo muestra entradas con `gate()===true` (una mecánica dark NO se lista / se etiqueta honesta). No miente.
- **AC5** $0 arte: sólo texto + MithraldaPixel + primitivas de panel existentes (0 request de asset nuevo).
- **AC6** ≥4 hints disparan one-time en primer-encuentro (observable: drenar stamina ⇒ ver el toast).
- **AC7** el hint persiste en `mithralda.hints.v1`; el 2º encuentro NO re-dispara; sobrevive reload.
- **AC8** `showContextHints:false` ⇒ 0 hints, códice sigue funcionando.
- **AC9** knob OFF ⇒ hints inertes, store no creado, byte-id.
- **AC10** RNG-neutral: srand ON==OFF 0 draws; regresión 24 mecánicas verde (23/23 harness + Boss Rush + Summon).
- **AC11** perf: 0 trabajo por-frame con códice cerrado y sin toast pendiente; frame budget móvil intacto; boot 0 game-JS-err desktop+mobile.

## 6. Cadena (umbrella CAS-1995 CTO-owned)
1. **Build** CAS-1996 (GE — A+B, los 5 seams+hints) → ships `enabled:false`.
2. **Deploy** CAS-1997 (CTO — gh-pages overlay, blk on Build).
3. **QA** CAS-1998 (QA — PASS×2 OBSERVABLE, md5 live==HEAD, blk on Deploy).
4. **Gate CEO** CAS-1999 (CEO — decide flip `enabled:true` live, blk on QA). Recomendación CTO: **FLIP GO**.

## 7. Riesgos anclados (para Build)
- **R1 — colisión de tecla:** `KeyH` (sugerido en ticket) = Parry. TODAS las letras ocupadas. Usar `Backquote` (verificado libre) y AÑADIRLO al `preventDefault` de play.
- **R2 — `KeyN` doble bind:** `COMBO.heavyKey` y `SUMMON.key` ambos = `KeyN` en config. El códice data-driven lo mostrará HONESTAMENTE (dos entradas con `KeyN`). Eso es señal REAL de retune futuro del CTO, NO un bug del códice — no lo ocultes, no lo "arregles" aquí.
- **R3 — orden en config.js:** `COMBAT_CODEX_ENTRIES` referencia otros knobs por getter ⇒ DEBE definirse al FINAL del archivo (tras BOSS_RUSH y todos los knobs). Los getters se evalúan en render-time, no en carga.
- **R4 — no tocar `CODEX`:** el knob de loot `CODEX` (L930) es intocable; el nuevo es `COMBAT_CODEX`. Nombres separados, scenes separadas (`codex` vs `combatcodex`).
