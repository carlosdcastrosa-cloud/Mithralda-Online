# CAS-1734 — Tileset picker zoom + editor polish (architecture spec)

Umbrella: CAS-1733. Parent: CAS-1734 (this decomposition).
Board (Carlos): *"mejora el map editor como profesional, agrega zoom in y zoom out en la cuadrícula derecha para poder escoger cuadros."*

## The load-bearing invariant (read first)

Zoom is a **pure viewport transform on the right tileset picker** (`#sliceCanvas`). It is
render-only + input-mapping. It MUST NOT change:

- `curCell.{sx,sy,sw,sh}` — the sub-rect embedded into a stamped prop (`editor.js:277-279`).
- `sliceGrid / cellRect / normSlice / autoSlice` in `sim/mapdoc.js` (pure geometry, CAS-1728).
- MapDoc export (`docToMapDoc`) or the game-side blit (`render.js` 9-arg draw).

If a reviewer diffs `sim/mapdoc.js` or `render.js` and sees changes, the design was violated.
With zoom at any level, `__editor.selectCell(asset,col,row)` and a manual click on the same
cell MUST produce byte-identical `curCell`. That is the QA anchor (AC-ZOOM-NEUTRAL).

## Current picker (CAS-1728/1729, `editor.js:319-352`, `560-585`)

`drawSlicePanel()` computes a single fit scale:
```
const maxW=232; const ds = iw>maxW ? maxW/iw : Math.min(4, maxW/iw);
```
Canvas is sized `iw*ds × ih*ds`; grid lines and highlight drawn at `*ds`; the pointer handler
maps `ix = e.offsetX/ds`. Everything keys off one scalar `ds`. That is the whole seam.

## Design: introduce `sliceZoom` (multiplier over the fit scale)

1. **State**: `let sliceZoom = 1;` module-scoped. `1` == current "fit width" behavior (so with
   zoom untouched the panel is byte-identical to today — additive, no regression).
2. **Effective scale**: `const dsFit = <existing formula>; const ds = dsFit * sliceZoom;` Everything
   downstream (`cvs.width/height`, grid, highlight, `cvs._ds=ds`) already uses `ds` → they all
   scale correctly for free. `e.offsetX/ds` still maps click→image coords correctly because
   `offsetX` is element-relative and unaffected by scroll. **This is why selection stays correct.**
3. **Overflow / pan**: when `sliceZoom>1` the canvas grows past the 232px column. Wrap
   `#sliceCanvas` in a fixed-size viewport `#sliceView { overflow:auto; max-height: … }` so the
   browser gives scrollbars. Add drag-to-pan (pointer drag on empty canvas area with a modifier,
   or middle/space-drag) as polish — but scrollbars alone satisfy "escoger cuadros diminutos".
   Keep pan and cell-pick from fighting: a click that doesn't move (< a few px) = select cell; a
   drag = pan. Reuse the same "moved?" threshold pattern already in the map canvas.
4. **Controls** (add to `#slicePanel` header/row, HTML + wiring):
   - `＋` / `−` buttons: multiply/divide `sliceZoom` by 1.25 (or step through a fixed ladder
     e.g. [0.5,1,1.5,2,3,4,6,8]). Clamp to a sane range (e.g. dsFit*zoom between ~0.25× and 16×
     of native, and never let the canvas exceed a memory cap ~4096px on a side).
   - Zoom-level indicator (e.g. `120%` relative to fit, or `×2.0`).
   - `Ajustar` (fit/reset) button → `sliceZoom=1`, scroll to 0.
   - Ctrl+wheel (and/or plain wheel) over the picker → zoom in/out; `preventDefault` so the page
     doesn't scroll. Zoom-toward-cursor is nice polish but optional; centered zoom is acceptable.
5. **Persistence**: `sliceZoom` is a UI-only view pref. Do NOT write it into the asset record,
   MapDoc, or IndexedDB `slice` config. Reset (or keep) per session is fine; simplest = reset to
   fit when the panel opens for a new asset. Never serialize it.

## Dev hooks (extend `__editor`, for the QA harness)

Add render-only probes; do NOT change existing hook return shapes:
- `setSliceZoom(z)` → clamps and redraws, returns effective `sliceZoom`.
- `get sliceZoom()` → current multiplier.
- `pickAtCanvasPx(x,y)` (optional) → returns the `{col,row}` the pointer handler would resolve
  for canvas-space `(x,y)` at the current zoom, so QA can prove click-mapping across zoom levels
  without synthesizing DOM pointer events. If cheap, expose it; otherwise QA drives real clicks.

## Polish (pick highest-impact, low-risk — NOT all)

Recommended, in priority order (do the top 2–3):
1. Zoom + pan of the picker (the ask). **Must-have.**
2. Active-cell visual feedback already exists (gold highlight) — ensure it stays visible/scrolled
   into view after selecting at high zoom.
3. Keyboard nudge of the selected cell in the picker (arrows move col/row within grid bounds) —
   cheap, high value for precision picking.
4. Guard broken states: empty tileset, 1×1 grid, huge sheet (clamp canvas size), `sliceZoom`
   surviving an input change to tw/th (re-clamp, keep zoom).

Explicitly OUT of scope this ticket (flag as follow-up if Carlos wants): full undo/redo stack,
NxM range brush, map-canvas redesign. Keep the change additive and inside the picker.

## Acceptance criteria (for Build harness + QA)

- **AC1 [byte-safe]**: with `sliceZoom==1` and no zoom interaction, `drawSlicePanel` output +
  `curCell` for a given click are identical to pre-change (additive; existing CAS-1731 harness
  still passes).
- **AC2 [zoom]**: `+`/`−`, wheel, and `Ajustar` change the effective scale; indicator reflects it;
  canvas grows/shrinks; scrollbars/pan let you reach any cell of a large sheet.
- **AC3 [AC-ZOOM-NEUTRAL]**: for zoom ∈ {fit, 2×, 4×, min}, selecting cell (c,r) via click and via
  `__editor.selectCell` yields the SAME `curCell.{sx,sy,sw,sh}`; stamping then exports the SAME
  sub-rect regardless of zoom (round-trip unchanged).
- **AC4 [no-touch]**: `git diff` shows NO changes to `sim/mapdoc.js` geometry or `render.js`.
- **AC5 [regression]**: full editor flow (upload tileset → slice → pick → paint → entities →
  zones → export → `?map=local` in game) works; `?map=seed` unchanged; 60fps; 0 console errors.
- **AC6 [defects]**: any bug found during the pro walkthrough is documented and fixed (or ticketed
  if out of scope) in the Build comment.

## Decomposition

Build (GE) → Deploy gh-pages (CTO) → QA live ×2 (QA, md5 live==HEAD) → Gate CEO (evidence: zoom
working in the right grid). Chain via `blockedByIssueIds`.
