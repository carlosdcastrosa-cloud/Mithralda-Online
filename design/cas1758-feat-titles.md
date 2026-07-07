# CAS-1758 — Títulos de Gesta (Feat Titles)

**Arch owner:** CTO · **Type:** EVO read-side · **Cost:** $0 art · **RNG:** neutral (read-only, touches no stream)

Compañero natural del **Códice de Botín** ([CAS-1751](/CAS/issues/CAS-1751), `design/cas1751-codex.md`).
Un sistema de **títulos de cuenta** desbloqueables por hitos que el jugador YA acumula. Puro
read-side sobre contadores existentes ⇒ cero riesgo de determinismo. Mirrorea 1:1 la
arquitectura del Códice (own-key store, reconcile seam, knob de apagado byte-idéntico, panel
read-only). **Reversible**: `TITLES.enabled=false` restaura el juego exacto de antes.

---

## 1. Contrato de datos

### Store propio — `mithralda.titles.v1` (NUNCA en `save.v1`)
```js
{ v:1, unlocked:{ "<titleId>": 1, ... }, equipped:"<titleId>"|null }
```
- `unlocked` = **set append-only** de ids de título cruzados (idempotente, una vía). Nunca se
  borra un id ya presente aunque el contador subyacente baje (p.ej. `hero.kills` se resetea en
  "Nueva partida") — el hito ya se logró.
- `equipped` = título activo elegido por el jugador; se muestra junto al nombre del héroe.
  Debe validar contra `unlocked` en cada lectura (si el título equipado no está desbloqueado,
  cae a `null`).
- Mirror EXACTO del ciclo Códice: `titlesDefault()`, `serializeTitles()`, `loadTitles()`,
  flag `G.titlesDirty`, boot `persist.bootTitles()` **antes** de `persist.boot()`, flush en el
  mismo `unload` que meta/arena/codex (`persist.js:136`).

### `save.v1` — **byte-idéntico**. Ningún seam nuevo en `serializeSave`/`loadSave`.

---

## 2. Tabla de títulos (config, fija — NO nuevos sistemas)

Definir en `sim/config.js` junto a `CODEX` (L876):
```js
export const TITLES = { enabled:true, defs:[
  // id, label (texto ES), y condición leída de contadores YA persistidos.
  // `src` nombra la fuente; `n` el umbral. El evaluador (sim) mapea src→contador live.
  { id:"codex_uniq_5",   label:"Cazador de Leyendas",     src:"codex.uniq",     n:5  },
  { id:"codex_uniq_15",  label:"Maestro de Reliquias",    src:"codex.uniq",     n:15 },
  { id:"codex_set_3",    label:"Coleccionista",           src:"codex.set",      n:3  },
  { id:"codex_rune_4",   label:"Rúnico",                  src:"codex.rune",     n:4  },
  { id:"arena_wave_5",   label:"Superviviente de la Arena", src:"arena.bestWave", n:5  },
  { id:"arena_wave_10",  label:"Gladiador Eterno",        src:"arena.bestWave", n:10 },
  { id:"arena_boss_3",   label:"Verdugo de Coloso",       src:"arena.bestBossWave", n:3 },
  { id:"asc_1",          label:"Ascendido",               src:"meta.ascension", n:1  },
  { id:"asc_3",          label:"Conquistador de Ascensión", src:"meta.ascension", n:3 },
]};
```
- Etiquetas son texto plano ES; **$0 arte** — sólo glyphs/paleta existentes (mismo estilo que
  `renderCodex`). Umbrales tunables sin bump de schema.
- Contadores fuente (leídos LIVE, nunca horneados):
  - `codex.uniq/set/rune` → `codexCounts()` (`sim/sim.js:840`) = `Object.keys(G.codex.*).length`
  - `arena.bestWave` → `G.arena.best`; `arena.bestBossWave` → `G.arena.bestBossWave` (`sim/sim.js:810`)
  - `meta.ascension` → `ensureMeta().ascension.level` (`sim/sim.js:1041 ascLevel()`)

> **YAGNI**: tabla fija en config, NO un sistema de reglas genérico. Si Carlos pide más
> títulos o fuentes (kills totales, conquest.tier), es un follow-up de 1 línea por entrada.

---

## 3. Seams (mirror de `applyCodex`)

- **`evalTitles()`** (nuevo, sim): itera `TITLES.defs`, resuelve `src`→contador live, y para
  cada def con contador `>= n` **inserta** `id` en `G.titles.unlocked` si falta ⇒ marca
  `G.titlesDirty=true`. Idempotente, **0 RNG**, sin efectos de juego.
- **`applyTitles(h)`** (nuevo, sim): llama `evalTitles()` y cachea `h.title = <label del
  equipped si sigue unlocked, si no "">`. Puramente derivado — para lectura del HUD.
- **Wiring**: llamar `applyTitles(h)` dentro de `reconcileMeta()` (`sim/sim.js:~1101`), justo
  **después** de `applyCodex(h)`. Mismos seams de héroe que ya usa Códice: `createHero()`,
  `loadSave()`, `respawn()`. Además reevaluar al descubrir un hito en vivo (Códice ya llama
  `recordCodex`→podemos reevaluar títulos ahí; y al cerrar oleada de arena / ascender).
  El coste es O(#defs) trivial por seam; NO en el loop de frame.

## 4. HUD + Panel (read-only)

- **HUD nombre**: en `hud.js:417` (`nodes.name.textContent=s.name||"Héroe"`) añadir el título
  activo como sufijo/subtexto: `s.title ? s.name+" · "+s.title : s.name`. El snapshot del HUD
  expone `title` (derivado de `h.title`). Sin título equipado ⇒ sólo el nombre (aditivo).
- **Panel**: mirror de `renderCodex` (`render/render.js:2504`). Lista títulos **desbloqueados**
  (label + condición cumplida) vs **bloqueados** mostrados como `???` con su condición
  (`n × <fuente legible>`). Permite **elegir** el título equipado (tap sobre uno desbloqueado
  ⇒ `G.titles.equipped=id`, `G.titlesDirty=true`). Snapshot puro vía `titlesSnap()`.
- **Afordancia**: botón/atajo propio (p.ej. `◈` + tecla `T`), registrado igual que el Códice en
  `input.js:333/341/361`, gated por `TITLES.enabled`.

## 5. Gate de apagado (AC-RNG-STRONG)

Con `TITLES.enabled=false`:
- `bootTitles()` no-op, ningún store leído/escrito, `applyTitles` no-op, sin afordancia HUD/panel,
  `h.title` ausente ⇒ HUD idéntico.
- **Build byte-idéntico**: `md5(dist) == HEAD` con la feature apagada, y `save.v1` byte-idéntico
  con la feature encendida o apagada (títulos derivan, nunca se hornean). Ídem determinismo del
  sim: `srand` byte-id ON==OFF (mismo AC que Códice AC5).

---

## 6. ACs de aceptación (para QA LIVE)

- **AC1 Own-key**: `mithralda.titles.v1` roundtrip (serialize/load), append-only, `equipped`
  valida contra `unlocked`.
- **AC2 Idempotente**: reevaluar N veces no duplica ni revierte unlocks.
- **AC3 Hitos live**: cruzar un umbral (p.ej. descubrir 5º unique / limpiar oleada 5 de arena /
  ascender) desbloquea el título, persiste al recargar, y aparece en el panel.
- **AC4 HUD + elegir**: equipar un título desbloqueado lo muestra junto al nombre; persiste
  recarga; equipar uno bloqueado es imposible.
- **AC5 RNG-neutral fuerte**: `TITLES.enabled=false` ⇒ md5 dist==HEAD; `save.v1` byte-idéntico;
  `srand` byte-id ON==OFF sobre una secuencia de draws.
- **AC-PERF**: 60fps; evaluación O(#defs) fuera del frame loop.
- **AC-REG**: regresión Códice ([CAS-1752](/CAS/issues/CAS-1752)) + arena limpias.

---

## 7. Pipeline (EVO estándar)

Build (GE) → Deploy gh-pages (CTO) → QA LIVE PASS×2 (md5 live==HEAD, AC5 OFF byte-idéntico) →
Gate CEO. **Coordinación deploy**: serializar push a gh-pages; Zone5 ([CAS-1744](/CAS/issues/CAS-1744))
board-gated, lane libre ahora.
