# CAS-1808 — Fix z-order: personaje pasa por debajo con tileset completo (CAS-1807)

**Bug (board, Carlos):** al colocar un **tileset COMPLETO** (relleno total de celdas) en el editor de mapas,
el sprite del personaje se dibuja **por debajo** de los tiles y queda oculto. Bug de **draw-order / z-order** puro.

## Repro confirmada (lectura de código)

- Los sellos del editor (`kind:"custom"`) — incluidas las **celdas de tileset recortadas** (CAS-1729, llevan `d.sw`) —
  se insertan en `world.deco` (`sim/mapdoc.js:207-219`).
- En render, cada deco `custom` se empuja como closure a `order`→`G._decoOrder` **anclado al fondo en `y:d.y`**
  (`render/render.js:568-600`).
- `renderEntities` fusiona `_decoOrder` con las entidades y **ordena por `y`** (`render/render.js:641-647`);
  el héroe entra en `y:h.y` (línea 645).
- Con un **tileset completo**, las celdas de suelo colocadas en filas por debajo del héroe tienen `y > h.y`
  ⇒ ordenan **después** del héroe ⇒ el héroe se dibuja **debajo** del tile. Síntoma exacto reportado.

## Decisión de arquitectura (CTO)

**Las celdas de tileset recortadas (`d.sw` presente) se dibujan como CAPA DE SUELO** — en la pasada de terreno,
**antes** de las entidades — de modo que héroe y mobs siempre quedan **encima**. Los sellos de **hoja entera**
(CAS-1716, sin `d.sw`) **conservan** su y-sort actual, para que un prop-oclusor intencional siga tapando por profundidad.

Lentes:
- **Blast radius**: cambio SÓLO de timing de dibujo; los sellos no-tileset quedan **byte-idénticos**. Aislado.
- **Reversibility**: fix de render puro, barato de revertir; no toca modelo de datos ni `mapdoc`/save (export byte-id).
- **YAGNI**: heurística `d.sw` (celda de tileset = suelo) resuelve el repro real sin UI de capas nueva; una capa
  explícita "suelo/prop" en el editor queda para después si aparece el caso de una celda de tileset que deba ocluir.
- **Determinism**: 0-RNG, $0 arte. `mapdoc.js` intacto ⇒ save.v1 y byte-id de export sin cambio.

## Implementación (seam único, `render/render.js`)

En el loop de deco (≈línea 568), cuando `d.kind==="custom" && d.sw`: **dibujar la celda inline en el acto**
(la pasada de deco corre en la fase de suelo, antes de `renderEntities`) usando el MISMO blit de 9-args
(`ctx.drawImage(img, d.sx,d.sy,d.sw,d.sh, x-w/2, y-h, w, h)`), en vez de empujar un closure a `order`.
Los sellos `custom` **sin** `d.sw` siguen empujándose a `order` (y-sort) como hoy.

Resultado: todas las celdas de tileset quedan **bajo** todas las entidades y deco y-sorted (capa de suelo);
los props hoja-entera conservan su profundidad.

## DoD → cadena estándar

1. Repro confirmada (arriba). ✅ (CTO)
2. **Build (GE)**: seam en `render/render.js`; celdas de tileset (`d.sw`) → capa suelo bajo entidades.
   Harness DOM-free/headless: sello de celda con `y > hero.y` ⇒ el orden de dibujo emite la celda ANTES del héroe.
   Regresión: sello hoja-entera sin `d.sw` sigue y-sorted (byte-id). `mapdoc`/export byte-id, 0-RNG. PASS×2.
3. **Deploy (CTO)**: overlay aislado a gh-pages, md5 live==HEAD del/los blob(s) tocados.
4. **QA (QA)**: PASS×2 LIVE — colocar tileset completo bajo el héroe y verificar que el héroe se dibuja ENCIMA
   (grep del fix en el bundle servido, screenshot in-game si posible), md5 live==HEAD.
5. **Gate CEO**: GO/NO-GO final.

## Acceptance criteria (compartidos)

- AC1 (repro/fix): con un relleno de celdas de tileset cubriendo la posición del héroe, el héroe (y mobs) se
  dibujan **encima** de las celdas; el personaje ya no desaparece.
- AC2 (regresión props): un sello `custom` de **hoja entera** (sin `d.sw`) mantiene y-sort — un prop colocado por
  debajo del héroe sigue tapándolo por profundidad (comportamiento byte-idéntico a HEAD).
- AC3 (neutralidad): 0-RNG (srand ON==OFF), $0 arte, `sim/mapdoc.js` intacto ⇒ export/save byte-idéntico.
- AC4 (perf): sin regresión de frame budget (≥ ~59fps live).
