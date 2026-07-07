# CAS-1728 — Tileset slicing + cell selector (Tiled-style)

**Author:** CTO · **Status:** decomposition / architecture decision
**Context:** Carlos rechazó el sign-off de CAS-1713 (build `414f297a3bf1`). Hoy cada
imagen importada se coloca como UN solo asset (la hoja entera). Carlos quiere trocear
cada tileset en su grilla y elegir CELDAS individuales, como el panel de tilesets de Tiled.

> "quiero escoger cuadros dentro de cada tile set … al seleccionar uno se abra en una
> ventana cuadriculada del lado derecho y escoger el cuadro que quieras como en tiled"

## Decisión de arquitectura

Esto es una **capa de slicing ADITIVA** encima de la infra ya entregada (CAS-1716):
upload de carpeta, paleta, `sim/customassets.js` (IndexedDB), hooks
`ingestAsset/listAssets/stampCustom`, embed `md.assets`, render `kind:"custom"`.
**No es un rework.** Lentes: *Reversibility* (formato aditivo, cheap-to-reverse),
*Blast radius* (guardas por-presencia ⇒ el camino sin celdas es byte-idéntico),
*YAGNI* (una sub-celda por prop; sin editor de colisión por-celda).

### Contrato de datos (todo OPCIONAL ⇒ byte-safe)

**1. Prop `kind:"custom"` (editor doc + MapDoc export).** Se añaden campos de sub-rect
OPCIONALES. El destino (w,h) por defecto = tamaño de la celda (sw,sh).

```
{ x, y, kind:"custom", asset:<id>, w, h, solid, r,
  sx?, sy?, sw?, sh? }   // sub-rect en px dentro de la imagen fuente
```

- `sw` presente ⇒ prop recortado (dibuja el rect fuente).
- `sw` ausente ⇒ hoja entera (comportamiento CAS-1716 actual) ⇒ **AC6 byte-safe**.

**2. Registro de asset (`sim/customassets.js` / IndexedDB) — config de slicing por-tileset.**
Campo OPCIONAL `slice`, persistido con el asset (keyPath `id`). El JUEGO nunca lo lee
(editor-only); `referencedAssets()` NO lo embebe (solo `path,name,type,dataUrl`).

```
{ id, path, name, type, dataUrl, w, h,
  slice?: { tw, th, margin, spacing, ox, oy } }   // tile w/h + margin/spacing/offset
```

**3. Export `md.assets`.** Forma SIN cambios: `{ id: {path,name,type,dataUrl} }`. La
hoja fuente se embebe UNA vez por tileset; muchas celdas referencian el mismo `id`
(eficiente). La sub-celda vive en el prop, no en el asset. El round-trip preserva
`sx,sy,sw,sh` porque `docFromMapDoc`/`docToMapDoc` copian props tal cual.

### Puntos de enganche (seams)

| Archivo | Cambio |
|---|---|
| `editor.html` | Panel derecho `#slicePanel` (oculto por defecto): `<img>`/canvas fuente + overlay de grilla + inputs tw/th/margin/spacing/offset. |
| `editor.js` | (a) al seleccionar asset en paleta con tool `stamp` ⇒ abrir panel, dibujar grilla desde `slice`. (b) click en celda ⇒ `curCell={asset,sx,sy,sw,sh}` resaltado = pincel activo. (c) `placeCustom` usa `curCell` (prop con sx..sh, w=sw,h=sh); sin celda ⇒ hoja entera (fallback actual). (d) `draw()` preview del prop dibuja sub-rect con drawImage 9-arg. (e) inputs escriben `rec.slice` + `putAsset` (persistencia AC5). (f) auto-detección de celda por defecto (divisor: 32 si w%32==0, si no 16, si no hoja entera). |
| `render/render.js` (~L560) | Guarda `if(d.sw)` ⇒ drawImage 9-arg con rect fuente; else camino actual. Ausente ⇒ byte-idéntico. |
| `sim/mapdoc.js` (~L175) | `docToWorld`: copiar `sx,sy,sw,sh` al deco cuando `pr.sw` presente. |

### Grilla / selección de celda (AC1–3)

- Celda `(col,row)` → `sx = ox + col*(tw+spacing) + margin`, `sy = oy + row*(th+spacing) + margin`, `sw=tw, sh=th`.
- Nº de columnas = `floor((imgW - 2*margin + spacing) / (tw+spacing))`; filas análogo.
- Click = un cell activo resaltado (must). **Opcional/recomendado:** arrastrar un rango
  rectangular ⇒ un solo prop con sub-rect que cubre NxM celdas (mega-pincel). Si se
  descarta por scope, dejarlo documentado (no silenciar).
- Grid-snap: al colocar en el mapa, `stamp` respeta el snap ya existente (clic=1, arrastra=serie).

### Hooks headless para QA (editor.js `__editor`)

Añadir (no romper los existentes):
- `setSlice(assetId, {tw,th,margin,spacing,ox,oy})` — define + persiste config.
- `cellRect(assetId, col, row)` → `{sx,sy,sw,sh}` (deriva de `slice`).
- `selectCell(assetId, col, row)` — fija pincel de celda activo.
- `stampCell(assetId, col, row, px, py)` — coloca prop recortado (headless, sin picker).
- exponer el pincel activo para aserciones.

Juego: `customImgReady(id)` ya existe; QA lee `world` deco para confirmar `sx..sh`.

## Criterios de aceptación (heredan del DoD del issue)

1. Panel derecho con imagen + grilla al seleccionar un tileset importado.
2. Controles tw/th (+margin/spacing/offset), default sensato, editable, recordado por-tileset.
3. Click en celda = pincel activo resaltado; cambiar de celda; (opcional rango).
4. Export embebe la referencia a la SUB-CELDA (fuente + x,y,w,h), NO la hoja; round-trip +
   juego (`?map=`) renderizan el recorte correcto.
5. Persistencia IndexedDB del tileset + su config de slicing.
6. **Byte-safe:** sin celdas, export idéntico a antes; no rompe subir-carpeta (aditivo).
7. Deploy gh-pages + QA live x2 + md5 live==HEAD + build id.
8. Gate CEO fresco con QA PASS x2 + build id.

## Cadena de entrega (Conway: un ingeniero por eslabón)

- **Build** (GE) — todo el contrato de datos + UI + hooks + harness DOM-free.
- **Deploy** (CTO) — overlay aislado a gh-pages, 0-leak, build id.
- **QA** (QA) — live x2: importar tileset → panel grilla → definir celda → elegir →
  colocar → export → reimport round-trip → juego renderiza el recorte (no la hoja).
- **Gate** (CEO) — GO / re-entrega a Carlos con build id.
