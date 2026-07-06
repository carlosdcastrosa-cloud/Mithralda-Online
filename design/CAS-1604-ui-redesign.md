# CAS-1604 — Rediseño UI: auditoría, análisis competitivo y dirección recomendada

**Autor:** Art Director · **Fase:** 1 (diseño) · **Umbrella:** CAS-1603 "MEJORAR LA UI"
**Estado del código auditado:** live `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` build `7a680ce4d3c9` (stamp CAS-1594) — estructura HUD idéntica a HEAD.
**Alcance:** UI-only, RNG-neutral, sin cambios de gameplay/sim. Presupuesto arte ~$0 (CSS/canvas + reuso; assets nuevos sólo vía PixelLab y marcados).

Esta es UNA dirección elegida, no un menú. El board delegó la decisión: la tomamos y la justificamos.

---

## PASO 0 — Reconciliación (qué ya existe, NO romper)

Trabajo UI shippeado y verificado que este rediseño **preserva por contrato**:

| Sistema | Ref | Ubicación código | Disposición |
|---|---|---|---|
| HUD arrastrable + persistencia `mithralda.uiLayout.v1` + Reset | CAS-413/418 | `ui/layout.js`, `hud.js:341`, `render.js:2714` | **CONSERVAR** (motor de layout es la base del rediseño) |
| Inventario rejilla 30 celdas + scroll + íconos + rarity pips + drag/dbl-click-equip | CAS-1578/1593/1594/1595 | `hud.js:301`, escena `inventory` | **CONSERVAR** (no regresionar) |
| HUD habilidades activas + cooldown radial | CAS-1539/1570 | `render.js:1693` | **CONSERVAR** (mecánica), **MEJORAR** (posición) |
| Barras vida/maná/xp | palette.js | `render.js:1797` | **MEJORAR** (jerarquía/posición) |
| Minimapa canvas | CAS-466 | `render.js:1843` | **MEJORAR** (mover a top-right) |
| Draft de boons | CAS-272/392 | `render.js:2488` | **CONSERVAR** (patrón ya es best-in-class) |
| Altar de Esencia | CAS-1557+ | `render.js:2843` | **CONSERVAR** |
| Paneles PixelLab (statframe/paperdoll/backpack/console) | CAS-286/314/316 | `assets/pixellab/ui/cas286/` | **REEMPLAZAR parcial** (ver §6) |
| Floating damage numbers (pop, lanes, colorblind) | CAS-127/265/273 | `render.js:573` | **CONSERVAR**, **MEJORAR** legibilidad |

**Lección CAS-435 aplicada:** el motor `uiLayout` + persistencia es el activo más valioso. El rediseño **reposiciona defaults dentro de ese motor**, no lo reescribe.

---

## 1. Auditoría de la UI actual — hallazgos priorizados

**P0 — Problemas que más dañan la lectura/feel (arreglar primero):**

1. **Tipografía `Courier New` monoespaciada en TODO el UI (255 usos).** Es el problema #1. Una typewriter monospace lee como "prototipo/terminal", choca frontalmente con la STYLE FORMULA ("chunky 32px pixel art, near-black outlines"). Ningún ARPG de referencia usa monospace de máquina de escribir. **Es el cambio de mayor impacto y más barato.**
2. **Dos sistemas HUD compitiendo** (sidebar canvas Tibia de 216px en `render.js` + overlay DOM en `hud.js`). Duplica lógica, duplica mantenimiento, y en pantallas anchas el sidebar fijo **come 216px de ancho de juego** — anti-patrón para un top-down de acción rápida donde el espacio de juego central es sagrado.
3. **Atención fragmentada a la esquina derecha.** Vitales, minimapa y botones viven en el sidebar derecho; la barra de hechizos abajo-centro; el inventario a la derecha. El ojo salta entre 3 zonas. Los ARPG modernos **anclan el comando abajo-centro y los recursos en las esquinas inferiores** (un solo arco de mirada).
4. **Minimapa abajo-derecha** — rompe convención universal (top-right). Fricción de aprendizaje gratuita.

**P1 — Jerarquía y consistencia:**

5. **Barras HP/MP/XP delgadas y apiladas dentro de un frame** — bajo peso visual para la stat más importante del juego. En acción rápida el jugador debe leer su vida sin fijar la vista.
6. **Escala de recurso vs. comando descompensada:** slots de habilidad ~44-46px pero barras de vida ~16px de alto. La vida debería dominar.
7. **Densidad de chrome:** PixelLab statframe (688×256) + paperdoll (288×512) + backpack (320×320) + console (512×256) siempre visibles = mucho marco ornamental por poco dato. Bello aislado, ruidoso en conjunto (viola "el conjunto se pule igual").

**P2 — Pulido:**

8. **Damage numbers** en `Courier New` bold 10-13px con outline 1px — legibles pero se pierden en combate denso; sin jerarquía crit vs normal más allá de tamaño.
9. **XP** casi invisible (9px de alto, dentro del frame). Progreso = dopamina en roguelite; debe ser inequívoco.
10. **Móvil:** HUD colapsa a overlay pero hereda la misma tipografía y densidad; los botones táctiles (55% alpha) tienen contraste bajo sobre terreno claro.

---

## 2. Análisis competitivo — patrones → qué adoptar

| Juego | Patrón concreto | ¿Adoptar? | Cómo en Mithralda ($0) |
|---|---|---|---|
| **Diablo IV** | Barra de acción **abajo-centro** como único hub de comando; globos HP/MP flanqueándola; minimapa top-right | **SÍ (núcleo)** | Consolidar spellbar + abilities + poción en UNA fila abajo-centro; vitales a los flancos |
| **Diablo IV** | Globos orbe HP/MP | Parcial | Mantener barras (orbes = arte); **engrosar** y anclar como "hombreras" del action bar |
| **Path of Exile** | Barra XP **full-width en el borde inferior** siempre visible | **SÍ** | Tira XP de 1 tile de alto pegada al borde inferior del canvas |
| **Hades** | HUD mínimo, tipografía display fuerte, cast/dash con affordance clarísima | **SÍ** | Fuente display pixel para títulos/números; cooldown radial ya lo tenemos |
| **Hades** | Iconos de boons activos en fila superior | **SÍ** | Fila de chips de boons activos arriba-izquierda (ya hay data `boons().list`) |
| **Vampire Survivors** | HUD in-run casi vacío: **barra XP full-width arriba + HP + nivel + timer**; todo lo demás diferido al modal de level-up | **SÍ (disciplina)** | Diferir inventario/paperdoll a panel toggled; in-run sólo vitales+comando+minimapa |
| **Brotato** | Números de daño grandes con color por tipo, alta legibilidad a velocidad | **SÍ** | Subir a bold 14-16px display, sombra 2px, crit con escala + color dedicado |
| **Last Epoch** | Skill bar con iconos claros + coste + cooldown numérico y radial | Ya lo tenemos | Mantener; unificar en el action bar central |
| **Tibia** | Sidebar-todo derecho | **NO (rechazar)** | Es la causa raíz del hallazgo #2/#3; lo retiramos como default |

**Síntesis del insight:** Mithralda es un híbrido **ARPG + survivors + roguelite top-down en tiempo real**. Los dos polos de referencia coinciden en una cosa: **el espacio de juego central manda, el comando se ancla abajo-centro, los recursos a las esquinas inferiores, el minimapa top-right, y todo lo no-esencial se difiere a modales/toggles.** El sidebar Tibia va justo en contra de eso.

---

## 3. LA dirección recomendada — "Console-ARPG Hybrid"

> **Un action bar abajo-centro como hub único de comando, vitales ancladas como hombreras a sus flancos, XP full-width en el borde inferior, minimapa top-right, y todo lo demás (inventario, paperdoll, talentos) diferido a paneles toggled — todo dentro del motor `uiLayout` existente, con la tipografía pixel reemplazando a Courier New.**

**Layout mental (desktop):** el borde inferior es una "consola" horizontal → `[HP orbe/barra] [ ACTION BAR: básico · 3 hechizos · 2 habilidades · poción ] [MP orbe/barra]`, con la tira de XP full-width pegada bajo todo. Esquinas superiores: chips de boons/estados (izq), minimapa (der). El 100% del resto de la pantalla es juego.

### Por qué ES la mejor para Mithralda (rationale)

1. **Resuelve los 4 hallazgos P0 de un golpe:** elimina el sidebar de 216px (recupera espacio de juego), unifica el comando en una zona (un arco de mirada), mueve el minimapa a la convención, y el cambio de fuente arregla el "look de prototipo".
2. **Encaja con el género real (survivors + ARPG), no con MMO.** El combate es rápido y top-down: el jugador mira al centro, no al sidebar. Diablo/Hades/PoE/VS/Brotato **convergen** en este layout; Tibia es el outlier.
3. **Barato de verdad (~$0).** Es reposicionamiento de defaults en `uiLayout` + reemplazo de fuente + reglas de tamaño. No requiere arte nuevo obligatorio; la fuente pixel se hornea gratis vía PixelLab (`create_font`). Los orbes son opcionales (fase 2b).
4. **Cero riesgo de regresión.** El motor arrastrable/persistente, el inventario 30-celdas, el draft, el altar y el cooldown radial **se conservan intactos**; sólo cambian coordenadas por defecto y estilo de texto. RNG-neutral por construcción (UI-only).
5. **Escala a móvil sin rediseño aparte.** El action bar abajo-centro ya es donde viven los pulgares en móvil; vitales a los flancos y XP en el borde son igual de válidos en vertical. Una sola mentalidad de layout para ambos.

### Alternativas consideradas y rechazadas

- **A) "Pulir el Tibia sidebar actual"** (mantener sidebar, sólo mejorar arte). *Rechazada:* no arregla el hallazgo raíz (espacio de juego + atención fragmentada); pule el problema en vez de resolverlo. Además duplica el trabajo de mantener dos HUDs.
- **C) "Full Vampire-Survivors" (HUD casi cero, sólo HP+XP+timer).** *Rechazada:* Mithralda tiene equipo, clases, hechizos drafteables y habilidades — más profundidad que un survivors puro. Esconder el comando penalizaría la capa ARPG. Tomamos su *disciplina* (diferir), no su minimalismo extremo.
- **D) "Globos orbe Diablo como pieza central de arte".** *Aplazada, no rechazada:* buena estética pero requiere arte (2 orbes + máscaras de llenado). Va a fase 2b opcional; el default arranca con barras engrosadas para respetar el ~$0.

---

## 4. Layout anotado — Desktop y Móvil

### DESKTOP (VW ≥ 900px) — coordenadas por defecto en `uiLayout`

```
┌───────────────────────────────────────────────────────────────┐
│ [Boons/estados chips]                          [ MINIMAPA ]    │  ← top-left: fila chips (arriba-izq)
│  ✦ ✦ ☠ ❄  (18px glyphs)                        160×160, top-8  │     top-right: minimapa (mover aquí)
│                                                    der-12        │
│                                                                 │
│                     Z O N A   D E   J U E G O                   │  ← 100% ancho útil (sin sidebar)
│                      (objetivo/zona: centro-arriba)             │
│                                                                 │
│                                                                 │
│                                                                 │
│                                                                 │
│  ┌──────┐   ┌───────────────────────────────────┐   ┌──────┐  │
│  │  HP  │   │  [1][2][3]  [4]  [Z][X]  [poción]  │   │  MP  │  │  ← ACTION BAR abajo-centro
│  │ 150/ │   │  básico·hechizos · habilidades · Q │   │ 80/  │  │     HP hombrera izq, MP hombrera der
│  │ 200  │   └───────────────────────────────────┘   │ 80   │  │     slots 48px, cooldown radial
│  └──────┘                                            └──────┘  │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ XP full-width (borde inferior, ~10px) ▓▓▓▓░░ │  ← XP tira pegada al borde
└───────────────────────────────────────────────────────────────┘
   Toggles (no siempre visibles): [I] Inventario 30-celdas · [T] Talentos · [C] Paperdoll/Wardrobe · [M] Mapa grande
   Chat/console: colapsable, esquina inf-izquierda, 2 líneas, auto-fade (no ocupa barra fija de 94px)
```

**Anclas por defecto (para el CTO, todas en `uiLayout` → arrastrables/reset):**
- `actionbar`: centro horizontal, `y = VH - 8 - h`. Alto ~56px. Contiene básico+3 hechizos+2 habilidades+poción en una fila (slot 48px, gap 6px).
- `vitals_hp`: pegado al borde izquierdo del actionbar. Barra vertical u horizontal engrosada (alto ≥ 22px si horizontal).
- `vitals_mp`: espejo, borde derecho del actionbar.
- `xpbar`: full-width, `y = VH - barH`, alto 8-10px, sin frame ornamental.
- `minimap`: `x = VW - mw - 12`, `y = 12` (top-right). *(hoy está bottom-right → mover default)*
- `boonchips`: `x = 12`, `y = 12` (top-left), fila horizontal.
- `console`: colapsable, `x=12`, `y = VH - 8 - actionbarH - lines`, fade tras 6s sin mensaje.

### MÓVIL / vertical (VW < 640px)

```
┌─────────────────────────┐
│ ✦☠   [Nv 15]  [MINIMAP] │  ← chips + nivel (izq), minimapa pequeño (der, 96px)
│ ▓▓▓▓▓▓▓▓ XP ▓▓▓▓▓▓░░░░░ │  ← XP full-width bajo la barra superior (VS-style)
│                         │
│      ZONA DE JUEGO      │
│                         │
│                         │
│   ◐ joystick            │  ← joystick abajo-izq (ya existe)
│                  [básico]│  ← acción principal abajo-der (grande, 20px)
│  HP▓▓▓▓▓▓  [Z][X][hech] │  ← HP barra + botones habilidad/hechizo abajo-der
│  MP▓▓▓▓    [poción][roll]│
└─────────────────────────┘
   Top-right iconos: [inv] [pausa] (abren paneles fullscreen toggled)
```

**Reglas móvil:** XP full-width arriba (siempre visible, VS-style). HP/MP barras horizontales sobre el cluster de botones abajo-derecha. Botones táctiles subir a **≥ 65% alpha + outline 2px** para contraste sobre terreno claro. Inventario/paperdoll = overlay fullscreen (no caben inline). Target táctil mínimo 44px (ya se respeta).

---

## 5. Guía de color / contraste / tipografía

**Tipografía (el cambio de mayor impacto):**
- **REEMPLAZAR `Courier New` en los 255 usos.** Adoptar un sistema de 2 pesos de una **fuente bitmap pixel** que respete la STYLE FORMULA ("chunky 32px, near-black outlines"):
  - **Display/títulos/números de daño:** fuente pixel chunky horneada vía **PixelLab `create_font`** (~$0, en pipeline). Marcada como asset nuevo barato.
  - **Cuerpo/labels pequeños:** una pixel-font legible a 8-10px (misma fuente o una segunda ligera). Si el CTO prefiere no depender de webfont en canvas: fallback a `monospace` genérico del sistema es aceptable, pero **NO `Courier New`** — se ve a máquina de escribir.
- **Regla de tamaños (jerarquía):** vida/números de daño > comando > secundario.
  - Números de daño: **bold 14-16px** (crit 20px+), sombra 2px near-black `#0a0c10`.
  - Vida/maná texto: 13-14px bold cream.
  - Labels de slot/coste: 9-10px.
  - Títulos de escena (draft/altar): 20-24px display.

**Color — respetar la paleta congelada (`palette.js`), NO inventar:**
- **Chrome UI:** `panel #12141b`, borde `panelB #3a3f49` / `panelB2 #22262e`. Fondos de panel a **`rgba(*, 0.82)`** (translúcidos, dejan ver el juego — clave para no comer espacio visual).
- **Recursos (sin cambio de hue, sí de peso):** HP `#b3242a`/`#2e1012`, MP `#3f6bd0`/`#101a30`, XP `#d0aa44`/`#231d0e`.
- **Texto:** `cream #d8d3c4` (brillante), `textGold #d8b25e` (primario), `textDim #8a8678` (secundario). Oro acento `#e0b94a`, oro brillante `#ffe39a`.
- **Señales (reservadas a hazard/estado, NO chrome):** poison `#8be04a`, slow `#7fd0ff`, stun `#ffe066`, burn `#ff8a3a`, heal `#4fbf6a`, rune `#5a8aff`. Ya es disciplina correcta — mantener.

**Contraste / accesibilidad (mantener lo existente, endurecer):**
- Todo texto sobre juego lleva **sombra/outline near-black 1-2px** (ya se hace en floaters; extender a todo el HUD flotante).
- Fondos de panel translúcidos **siempre con 1px borde `panelB2`** para separar del terreno.
- Mantener modo colorblind (glyphs ☠/❄/✦/♨) y reduce-motion (ya implementados — NO regresionar).
- Móvil: botones táctiles ≥ 65% alpha, outline 2px color-key.

**Espaciado:** gap base 6px entre slots, 12px margen a bordes de viewport, 14px entre cards de draft (ya es correcto). Ritmo de 4px.

---

## 6. CONSERVAR / MEJORAR / REEMPLAZAR — lista 1:1 para el CTO

### ✅ CONSERVAR (no tocar — riesgo de regresión)
1. Motor `ui/layout.js` + persistencia `mithralda.uiLayout.v1` + Reset (CAS-413/418). **Es la base; el rediseño sólo cambia coordenadas por defecto.**
2. Inventario 30 celdas + scroll + rarity pips + drag + dbl-click-equip (`hud.js`, escena inventory) — **verificar no-regresión explícita en QA.**
3. Cooldown radial de habilidades/hechizos (CAS-1539/1570) — sólo se reubica el bloque, la mecánica no cambia.
4. Escena de draft de boons (CAS-272/392) y sus animaciones/reroll/banish — patrón ya best-in-class.
5. Escena de altar de Esencia (CAS-1557+).
6. Damage floaters: pooling, lanes (CAS-273), colorblind (CAS-265), pop (CAS-127) — mecánica intacta.
7. Modos accesibilidad: colorblind glyphs + reduce-motion.
8. Paleta congelada `palette.js` (STYLE FORMULA) — colores por rol, no cambiar hues.

### 🔧 MEJORAR (reubicar/reescalar, sin reescribir)
9. **Barra de acción abajo-centro:** consolidar en UNA fila `actionbar`: básico + 3 hechizos + 2 habilidades + poción. Slot 48px. (Hoy: spellbar y ability-bar y poción en piezas separadas — unificar el ancla.)
10. **Vitales como hombreras del action bar:** HP a la izquierda, MP a la derecha, **engrosadas** (≥22px). Mover default de `vitals` fuera del sidebar.
11. **XP full-width en el borde inferior** (`xpbar`), 8-10px, sin frame — reemplaza la barra XP de 9px enterrada en el statframe.
12. **Minimapa → top-right** (cambiar default `minimap` de bottom-right a `x=VW-mw-12, y=12`).
13. **Chips de boons + estados → top-left** en fila horizontal (usar `boons().list`).
14. **Damage numbers:** subir a bold 14-16px (crit 20px+), sombra 2px, color por tipo (ya hay data).
15. **Chat/console:** de barra fija de 94px a widget colapsable con auto-fade — recupera espacio.
16. **Móvil:** botones táctiles a ≥65% alpha + outline 2px; XP full-width arriba; vitales sobre cluster de botones.

### ♻️ REEMPLAZAR
17. **Tipografía `Courier New` → fuente pixel bitmap** en los 255 usos. *(mayor impacto, ~$0 vía PixelLab `create_font`; marcar asset nuevo barato).*
18. **Retirar el sidebar fijo Tibia de 216px como default** (`render.js:1780-1832`). El comando pasa al action bar central; los botones de inventario/talentos/mapa pasan a **toggles** (I/T/C/M) + iconos flotantes top-right en móvil. *(No borrar el código de golpe: el CTO puede dejarlo tras un flag off-por-defecto para no perder el trabajo, pero el layout enviado usa el nuevo default.)*
19. **Paneles PixelLab siempre-visibles (statframe/paperdoll/backpack/console):** paperdoll y backpack pasan a panel **toggled** (no chrome permanente). Statframe se retira a favor de las hombreras HP/MP. **Los PNGs se conservan en repo** y se reutilizan dentro del panel de inventario/paperdoll toggled → cero arte perdido, cero gasto.

### 💸 Assets nuevos propuestos (baratos, marcados)
- **1 fuente pixel bitmap** vía PixelLab `create_font` (display + cuerpo). **Único asset nuevo necesario.** ~$0 (pipeline existente). Todo lo demás es CSS/canvas + reuso de PNGs existentes.
- **(Opcional fase 2b, NO en el default):** 2 orbes HP/MP estilo Diablo + máscara de llenado, si el CEO quiere subir el nivel estético. Requiere arte → lo coteizo aparte si se prioriza.

---

## Contrato de implementación para la Fase 2 (CTO)

- **UI-only, RNG-neutral, cero cambios de sim/gameplay.** Verificable: `npm test` verde + build stamp sin drift de lógica.
- **No regresionar:** drag+persistencia (CAS-413), inventario 30-celdas (CAS-1593/1595), cooldown radial (CAS-1570), draft, altar. QA debe cubrir cada uno.
- **Todo el reposicionamiento vive en defaults de `uiLayout`** → el usuario sigue pudiendo arrastrar y Reset restaura los NUEVOS defaults.
- **Orden sugerido de PRs:** (1) fuente pixel — mayor impacto aislado; (2) action bar unificado + vitales hombreras; (3) XP full-width + minimapa top-right + chips; (4) diferir paneles a toggles + retirar sidebar default; (5) pase de contraste móvil. Cada PR es shippeable y QA-able por separado.

**Disposición:** este issue es el entregable de diseño → **done**. El CTO (Fase 2, CAS-1603) se desbloquea automáticamente.
