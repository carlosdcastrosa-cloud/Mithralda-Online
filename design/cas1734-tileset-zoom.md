# CAS-1734 — Map editor: zoom en la cuadrícula de tileset + pulido profesional

Owner: CTO (arch) → build GE → deploy CTO → QA → gate CEO.
Umbrella: CAS-1733. Builds additively on the CAS-1728/1729 slice panel.

## Problema

El panel derecho (`#slicePanel` / `#sliceCanvas`, editor.js `drawSlicePanel` +
`wireSliceCanvas`) muestra el tileset a **escala fija de ajuste** (`ds`, fit a
`maxW=232`, tope 4×). En tilesets grandes las celdas se ven diminutas y no hay
forma de acercarse para escoger un cuadro con precisión. Carlos pide **zoom in /
zoom out en la cuadrícula derecha**.

## Defecto latente a corregir (mismapeo de clics)

`#sliceCanvas{ width:100% }` **estira el canvas por CSS** al ancho del panel
(~240px) mientras el backing-store mide `iw*ds`. El click-map hace
`ix = e.offsetX/ds`, que asume `offsetX` en px de backing-store. Cuando
`cw ≠ anchoCSS` (p.ej. tileset chico upscaled a 4× → cw=128 estirado a 240) los
clics caen en la celda equivocada. El nuevo modelo de coordenadas debe eliminar
este mismapeo: **canvas a tamaño natural (sin escalado CSS)** dentro de un
viewport con scroll.

## Diseño (aditivo, bajo riesgo)

### 1. Modelo de coordenadas y zoom
- Introducir `let sliceZoom = 1;` (multiplicador sobre el fit-scale base).
- En `drawSlicePanel`: separar el fit-scale base y el efectivo:
  - `fitDs` = escala que ajusta el ancho del viewport (como hoy, tope 4×).
  - `ds = fitDs * sliceZoom;` (clamp de `sliceZoom` a `[0.5, 12]`).
  - Backing-store `cw=round(iw*ds), ch=round(ih*ds)` (igual que hoy).
  - **Quitar `width:100%`**: fijar el tamaño CSS del canvas a su backing-store
    (`cvs.style.width = cw+"px"; cvs.style.height = ch+"px";`) para que
    `e.offsetX/e.offsetY` sean px de backing-store 1:1 → mapeo exacto.
- Envolver `#sliceCanvas` en `#sliceView{ overflow:auto; }` (viewport con altura
  acotada, p.ej. `max-height: 46vh`). Al hacer zoom-in el canvas crece y el
  viewport hace scroll → sirve de **pan** nativo.

### 2. Controles de zoom
- Fila de controles en `#slicePanel` (bajo el `sphead`): botones **−**, **reset/ajustar**,
  **+**, y un indicador `#sliceZoomLbl` con el % (`Math.round(sliceZoom*100)+"%"`).
- **Rueda del ratón** sobre `#sliceView`/`#sliceCanvas`: `wheel` con `preventDefault`
  ajusta `sliceZoom *= e.deltaY<0 ? 1.15 : 0.87` (clamp). **Anclar al cursor**:
  guardar la posición de contenido bajo el cursor antes del cambio y reajustar
  `sliceView.scrollLeft/scrollTop` después para que el punto bajo el cursor no salte.
  (Fórmula: `contentX = (scrollLeft + offsetX); ratio = nz/oldDs; scrollLeft = contentX*ratio_zoom - offsetX`.)
- Botones **+/−**: paso `*1.25` / `*0.8` sobre `sliceZoom` centrado en el viewport.
- **Reset/Ajustar**: `sliceZoom=1` → vuelve a fit.

### 3. Interacción sin romper `selectCell`/stamp
- El click-map de `wireSliceCanvas` **no cambia de fórmula** (`ix=offsetX/ds`),
  sólo ahora `ds` incluye `sliceZoom` y `offsetX` es px reales (sin estiramiento).
- `curCell` sigue guardando `sx,sy,sw,sh` en **px de imagen** (independiente del
  zoom) → el sub-rect embebido en el stamp (`placeCustom`/props `sx..sh`) y el
  round-trip export **no cambian**. Invariante: **el zoom es sólo de presentación**.
- El highlight de celda (`curCell.sx*ds...`) ya escala con `ds` → correcto sin cambios.
- Distinguir **click de selección** vs **arrastre de pan**: si el usuario arrastra
  (pointermove con botón) para desplazar el scroll, no seleccionar celda en el
  pointerup si hubo desplazamiento > umbral (p.ej. 4px). (El scroll nativo del
  viewport ya cubre el pan con la barra; el drag-to-pan es opcional pero recomendado.)

### 4. Polish profesional (elegir alto impacto, bajo riesgo)
- Indicador visible de zoom (ya arriba) + **fit-to-view** al abrir panel (`sliceZoom=1`).
- Atajos de teclado con el panel abierto: `+`/`=` zoom-in, `-` zoom-out, `0` reset.
- Feedback de celda activa ya existe (highlight dorado + `sliceInfo` con `(col,row)`).
- Reset de `sliceZoom=1` al cambiar de tileset (`openSlicePanel`) para no heredar
  un zoom raro de otro asset.
- No romper el layout: el `#slicePanel` mantiene ancho 262px; el viewport hace scroll interno.

### 5. Dev hooks para QA (extender `window.__editor`)
- `get sliceZoom()` → devuelve `sliceZoom`.
- `setSliceZoom(z)` → clampa, `drawSlicePanel()`, devuelve `sliceZoom`.
- `sliceZoomFit()` → `sliceZoom=1; drawSlicePanel()`.
- (Reutilizar los existentes `selectTool`, `selectCell`, `curCell`, `stampCell`,
  `sliceGrid`, `cellRect` — QA valida que **tras zoom**, `selectCell(col,row)` y un
  click en las coords equivalentes del canvas producen el **mismo `curCell`**.)

## Restricciones / invariantes
- **Aditivo, sin regresiones**: sin panel abierto o `sliceZoom=1`, el comportamiento
  de export/round-trip/`?map=local`/`?map=seed` es **byte-idéntico** al de CAS-1729.
- `curCell` y el sub-rect del stamp son **px de imagen**, nunca px de pantalla.
- El zoom vive sólo en editor.html/editor.js (páginas standalone del editor); el
  runtime del juego (`sim/mapdoc.js`, render.js) **no se toca**.

## Acceptance Criteria (build)
1. **AC-ZOOM**: botones +/−/reset **y** rueda del ratón cambian `sliceZoom`; el
   canvas crece/encoge y el viewport hace scroll; indicador de % correcto. `sliceZoom`
   clamp `[0.5,12]`.
2. **AC-MAP-EXACT**: con cualquier `sliceZoom`, un click en el centro de la celda
   `(col,row)` selecciona exactamente esa celda (`curCell.col/row`). Corrige el
   mismapeo de `width:100%`. QA: barrido de celdas a ≥2 niveles de zoom.
3. **AC-INVARIANT**: `curCell.sx/sy/sw/sh` (px de imagen) son **independientes de
   `sliceZoom`**; el stamp y el export `md.assets` referenced-only round-trip no cambian.
4. **AC-ADDITIVE**: sin tocar el panel (o `sliceZoom=1`), export/round-trip y el juego
   `?map=seed`/`?map=local` byte-idénticos a HEAD previo. Sello de hoja entera intacto.
5. **AC-HOOKS**: `__editor.{setSliceZoom, sliceZoomFit, sliceZoom}` operativos para QA.
6. **AC-POLISH**: reset de zoom al cambiar tileset; atajos +/−/0; sin estados rotos
   en el recorrido completo (upload→slice→celda→pintar→entidades→zona→export→juego).
7. Harness DOM-free/headless donde aplique + smoke 60fps del juego (regresión).

## Cadena
- **Build** (GE): implementa + harness. → master.
- **Deploy** (CTO): overlay aislado editor.html/editor.js a gh-pages; md5 live==HEAD.
- **QA** (QA): live ×2 desktop+móvil, md5 live==HEAD, evidencia del zoom + AC-MAP-EXACT.
- **Gate** (CEO): GO/No-Go con evidencia del zoom en la cuadrícula derecha.
