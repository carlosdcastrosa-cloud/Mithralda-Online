// ===========================================================================
// render/customize.js — CAS-169 character-customization BAKE pipeline.
//
// The sim owns the chosen look (h.palette {hood,cloak,sash,legs} + h.variation
// {headwear,cape}); THIS module turns that look into the two offscreen strip
// canvases render.js already draws (clshero_<cls> idle 6f + clswalk_<cls> walk 8f),
// reusing the WHOLE existing drawHeroClass path with ZERO hot-path cost — the bake
// runs only when the look changes (render.js dirty-checks a signature), never per
// frame.
//
// HOW (the CAS-167 phase-2 recipe, art-reference/main-character.png split into
// value-normalised gray+alpha part masks under assets/erw/hero/parts/):
//   1) TINT a mask by a chosen RGB: out = min(255, color*(gray/165)) per pixel, alpha
//      kept — the canonical shading ramp survives, only the hue moves.
//   2) COMPOSITE the slots in z-order (longcape behind → legs → cloak|nocape → sash →
//      hood|helmet) at the figure anchor, scaled into the 140×166 cell at the SAME
//      geometry as CAS-167 (anchorX 65, foot 163, figureH 160) → on-screen size +
//      CLASS_ANIM_SCALE unchanged.
//   3) ANIMATE with the identical CAS-167 model: the body group (cape+torso+sash+head)
//      bobs; the legs split at their centroid and swing — so even the static masks
//      yield a real walk/idle WITHOUT waiting on per-part animated strips. When the
//      Art Director ships parts/<part>_idle/_walk.png the per-part frames drop in here.
//   4) BAKE into a strip canvas (clshero_/clswalk_), tagged complete/naturalWidth so the
//      existing draw accepts a canvas exactly like a loaded <img>.
//
// Browser-only (canvas + Image). Guarded so a node-side sim import never touches it.
// ===========================================================================

// Cell geometry — MUST match render.js CLASS_FW/FH/AX/FOOT + parts.json.figure.
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 160;
const FIG_W = 58, FIG_H = 158;                 // native part-mask figure dims
const IDLE_FC = 6, WALK_FC = 8;
const MID = 165;                               // tint mid-reference (value-normalised masks)
const PART_DIR = "./assets/erw/hero/parts/";
const PART_NAMES = ["hood", "cloak", "sash", "legs", "helmet", "nocape", "longcape"];

const _doc = (typeof document !== "undefined") ? document : null;
const _masks = {};            // name -> HTMLImageElement
let _loadStarted = false, _loadVer = "";

// Kick off the mask loads once. Cache-bust with the same build id the asset graph uses.
export function ensureMasks(){
  if(!_doc || _loadStarted) return masksReady();
  _loadStarted = true;
  const v = (typeof globalThis !== "undefined" && globalThis.__BUILD) ? ("?v=" + globalThis.__BUILD) : "";
  _loadVer = v;
  for(const n of PART_NAMES){ const im = new Image(); im.onerror = ()=>{ /* keep going; bake checks readiness */ }; im.src = PART_DIR + n + ".png" + v; _masks[n] = im; }
  return masksReady();
}
export function masksReady(){
  for(const n of PART_NAMES){ const im = _masks[n]; if(!im || !im.complete || !im.naturalWidth) return false; }
  return true;
}

function mk(w, h){ const c = _doc.createElement("canvas"); c.width = w; c.height = h; return c; }

// Tint a part mask by [r,g,b] into a fresh FIG_W×FIG_H canvas (out = min(255, color*gray/165)).
function tint(maskImg, color){
  const c = mk(FIG_W, FIG_H), cx = c.getContext("2d"); cx.imageSmoothingEnabled = false;
  cx.drawImage(maskImg, 0, 0, FIG_W, FIG_H);
  const id = cx.getImageData(0, 0, FIG_W, FIG_H), d = id.data;
  const cr = color[0], cg = color[1], cb = color[2];
  for(let i = 0; i < d.length; i += 4){
    const a = d[i + 3]; if(a < 4){ d[i + 3] = 0; continue; }
    const g = d[i] / MID;                                  // gray ramp (masks are gray, R==G==B)
    d[i]   = Math.min(255, (cr * g) | 0);
    d[i+1] = Math.min(255, (cg * g) | 0);
    d[i+2] = Math.min(255, (cb * g) | 0);
  }
  cx.putImageData(id, 0, 0); return c;
}

// Scale a native FIG canvas into a CELL_W×CELL_H layer (feet on FOOT, centroid ANCHOR_X).
function toCell(figCanvas){
  const scale = FIGURE_H / FIG_H, dw = Math.round(FIG_W * scale), dh = FIGURE_H;
  const dx = Math.round(ANCHOR_X - dw / 2), dy = FOOT - dh;
  const c = mk(CELL_W, CELL_H), cx = c.getContext("2d"); cx.imageSmoothingEnabled = false;
  cx.drawImage(figCanvas, 0, 0, FIG_W, FIG_H, dx, dy, dw, dh);
  return c;
}

// Split a CELL-space legs layer into legL/legR at the opaque horizontal centroid,
// so a walk cycle can swing the two legs in opposition (CAS-167 model).
function splitLegs(legCell){
  const cx = legCell.getContext("2d"), d = cx.getImageData(0, 0, CELL_W, CELL_H).data;
  let sum = 0, n = 0;
  for(let j = 0; j < CELL_H; j++) for(let i = 0; i < CELL_W; i++){ const o = (j*CELL_W+i)*4; if(d[o+3] > 24){ sum += i; n++; } }
  const splitX = n ? Math.round(sum / n) : ANCHOR_X;
  const legL = mk(CELL_W, CELL_H), legR = mk(CELL_W, CELL_H);
  const lx = legL.getContext("2d"), rx = legR.getContext("2d");
  const li = lx.createImageData(CELL_W, CELL_H), ri = rx.createImageData(CELL_W, CELL_H);
  for(let j = 0; j < CELL_H; j++) for(let i = 0; i < CELL_W; i++){
    const o = (j*CELL_W+i)*4; if(d[o+3] < 8) continue; const t = (i < splitX) ? li : ri;
    t.data[o] = d[o]; t.data[o+1] = d[o+1]; t.data[o+2] = d[o+2]; t.data[o+3] = d[o+3];
  }
  lx.putImageData(li, 0, 0); rx.putImageData(ri, 0, 0);
  return { legL, legR };
}

// Resolve which masks the chosen variation uses (z-ordered).
function resolveMasks(variation){
  const head = variation.headwear === "helmet" ? "helmet" : variation.headwear === "none" ? null : "hood";
  const torso = variation.cape === "cape" ? "cloak" : "nocape";   // front torso (no short cape when long/none)
  const back = variation.cape === "longcape" ? "longcape" : null; // back drape only for the long cape
  return { head, torso, back };
}

// Tag a baked canvas so drawHeroClass's <img>-shaped checks (complete/naturalWidth) pass.
function asImage(canvas){ canvas.complete = true; canvas.naturalWidth = canvas.width; canvas.naturalHeight = canvas.height; return canvas; }

// Bake the idle + walk strips for one look. Returns {idle, walk} canvases or null
// until the masks are loaded. Pure: no sim/RNG, deterministic for a given look.
export function bakeHero(cls, palette, variation){
  if(!_doc || !masksReady()) return null;
  const m = resolveMasks(variation);

  // --- pre-build the CELL-space animation layers (tinted once) ---
  // body group = back? + front torso + sash + head, all bob together → merge to ONE canvas
  const body = mk(CELL_W, CELL_H), bx = body.getContext("2d"); bx.imageSmoothingEnabled = false;
  bx.drawImage(toCell(tint(_masks[m.torso], palette.cloak)), 0, 0);
  bx.drawImage(toCell(tint(_masks.sash, palette.sash)), 0, 0);
  if(m.head) bx.drawImage(toCell(tint(_masks[m.head], palette.hood)), 0, 0);
  const back = m.back ? toCell(tint(_masks[m.back], palette.cloak)) : null;  // drawn BEHIND legs
  const { legL, legR } = splitLegs(toCell(tint(_masks.legs, palette.legs)));

  const R = Math.round, TAU = Math.PI * 2;
  const frame = (bodyDX, bodyDY, lDX, lDY, rDX, rDY) => {
    const c = mk(CELL_W, CELL_H), cx = c.getContext("2d"); cx.imageSmoothingEnabled = false;
    if(back) cx.drawImage(back, bodyDX, bodyDY);
    cx.drawImage(legL, lDX, lDY); cx.drawImage(legR, rDX, rDY);
    cx.drawImage(body, bodyDX, bodyDY);
    return c;
  };
  const strip = (frames) => { const c = mk(CELL_W * frames.length, CELL_H), cx = c.getContext("2d"); cx.imageSmoothingEnabled = false;
    frames.forEach((f, k) => cx.drawImage(f, k * CELL_W, 0)); return asImage(c); };

  // IDLE: gentle breathing — torso bobs/sways, feet planted.
  const idle = [];
  for(let f = 0; f < IDLE_FC; f++){ const p = f / IDLE_FC * TAU;
    idle.push(frame(R(Math.sin(p) * 0.6), R(-(Math.sin(p) * 0.5 + 0.5) * 1.2), 0, 0, 0, 0)); }
  // WALK: alternating leg swing+lift + body footfall bob (2 footfalls / cycle).
  const walk = [];
  for(let f = 0; f < WALK_FC; f++){ const p = f / WALK_FC * TAU;
    const bodyDY = R(-Math.abs(Math.sin(p)) * 3);
    walk.push(frame(0, bodyDY, R(Math.sin(p) * 4), R(-Math.max(0, Math.sin(p)) * 3),
                              R(Math.sin(p + Math.PI) * 4), R(-Math.max(0, Math.sin(p + Math.PI)) * 3))); }

  return { idle: strip(idle), walk: strip(walk) };
}
