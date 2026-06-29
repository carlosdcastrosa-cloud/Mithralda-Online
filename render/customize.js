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
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 142; // CAS-199 v2: headroom for tall per-class headgear (matches tools/cas167-build-classes.mjs)
const FIG_W = 58, FIG_H = 158;                 // native part-mask figure dims
const IDLE_FC = 6, WALK_FC = 8;
const MID = 165;                               // tint mid-reference (value-normalised masks)
const SKIN = [226, 196, 162];                  // CAS-199 fixed face tone (class-independent → "same person, different role")
const PART_DIR = "./assets/erw/hero/parts/";
const PART_NAMES = ["hood", "cloak", "sash", "legs", "helmet", "nocape", "longcape", "face"];

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

// CAS-199 v2: bold per-class CLOTHING + ACCESSORIES drawn in CELL space on the body
// canvas (so they ride the bob/animation). Same hooded main-character figure → shared
// style, distinct class. Verbatim mirror of tools/cas167-build-classes.mjs paintClassCell
// so the in-world hero matches the class-select strip exactly.
function paintClassAccessories(layer, cls){
  const W=CELL_W, H=CELL_H, cx=layer.getContext("2d"); const im=cx.getImageData(0,0,W,H); const d=im.data;
  const set=(i,j,c)=>{ i=Math.round(i); j=Math.round(j); if(i<0||j<0||i>=W||j>=H) return; const o=(j*W+i)*4; d[o]=c[0]; d[o+1]=c[1]; d[o+2]=c[2]; d[o+3]=255; };
  const span=(j)=>{ let lo=W,hi=-1; for(let i=0;i<W;i++) if(d[(j*W+i)*4+3]>20){ if(i<lo)lo=i; if(i>hi)hi=i; } return hi<0?null:[lo,hi]; };
  const headBand=Math.round(H*0.34); let minx=W,miny=H,maxx=0,maxy=0,found=false;
  for(let j=0;j<headBand;j++)for(let i=0;i<W;i++){ const o=(j*W+i)*4; if(d[o+3]<20) continue;
    const r=d[o],g=d[o+1],b=d[o+2]; if(r>150 && r-b>20 && g>=b){ found=true; if(i<minx)minx=i;if(i>maxx)maxx=i;if(j<miny)miny=j;if(j>maxy)maxy=j; } }
  let top=0; for(let j=0;j<H;j++){ if(span(j)){ top=j; break; } }
  const hcx=found?Math.round((minx+maxx)/2):Math.round(W/2);
  const faceTop=found?miny:top+8, faceBot=found?maxy:top+22, headHalf=found?Math.max(5,Math.round((maxx-minx)/2)+2):9;
  const chest=span(faceBot+14)||[hcx-13,hcx+13], figL=chest[0], figR=chest[1];
  const C={OUT:[18,20,26],STEEL:[150,166,186],STEELD:[92,102,118],STEELL:[206,218,234],
    GOLD:[220,182,86],GOLDD:[150,120,44],WOOD:[120,86,52],WOODD:[74,52,32],WHITE:[228,228,218],
    WHITED:[150,152,148],LEAF:[96,136,76],LEAFD:[56,86,48],FUR:[156,138,104],CYAN:[128,228,232],
    PURP:[132,96,196],PURPD:[78,54,122],RED:[180,52,58]};
  const fillCrown=(bdy,edge)=>{ for(let j=top;j<faceTop;j++){ const s=span(j); if(!s)continue;
    for(let i=s[0];i<=s[1];i++) set(i,j,(i===s[0]||i===s[1])?edge:bdy); } };
  const pads=(col,edge)=>{ for(let k=0;k<8;k++){ const j=faceBot+1+k; const s=span(j); if(!s)continue;
    const w=k<5?3:2; for(let t=0;t<w;t++){ set(s[0]+t,j,t===w-1?edge:col); set(s[1]-t,j,t===w-1?edge:col); } } };
  const disc=(ccx,ccy,R,fill,rim,gem)=>{ for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){ const dd=i*i+j*j;
    if(dd<=R*R) set(ccx+i,ccy+j, dd>(R-1)*(R-1)?rim : (gem&&dd<4?gem:fill)); } };
  const cone=(brimY,hgt,halfW,bdy,edge,shape)=>{ for(let j=brimY;j>=brimY-hgt;j--){ const t=(brimY-j)/hgt;
    const f=shape==="round"?(1-t*t):(1-t); const hw=Math.max(0,Math.round(f*halfW));
    for(let i=hcx-hw;i<=hcx+hw;i++) set(i,j,(i===hcx-hw||i===hcx+hw)?edge:bdy); } };

  if(cls==="warrior"){
    fillCrown(C.STEEL,C.OUT);
    for(let i=hcx-headHalf;i<=hcx+headHalf;i++) set(i,faceTop,C.STEELD);
    for(let j=top;j>=top-13;j--){ set(hcx,j,(j%2)?C.STEELL:C.STEEL); set(hcx-1,j,C.STEELD); }
    pads(C.STEEL,C.STEELD);
    const bx=figR+3, by=faceBot+12;
    for(let s=0;s<30;s++){ const i=bx+s*0.42, j=by-s; set(i,j,C.STEELL); set(i+1,j,C.STEEL); set(i+2,j,C.STEELD); }
    for(let i=-3;i<=3;i++) set(bx+i,by+1,C.GOLD); set(bx,by+2,C.WOOD); set(bx,by+3,C.WOOD); set(bx,by+4,C.GOLD);
  } else if(cls==="paladin"){
    fillCrown(C.STEELL,C.OUT);
    for(let i=hcx-headHalf;i<=hcx+headHalf;i++) set(i,faceTop,C.GOLD);
    for(let j=top;j>=top-15;j--){ const w=(top-j)<4; set(hcx,j,(j%2)?C.RED:[214,84,84]); if(w)set(hcx+1,j,C.RED); }
    set(hcx,top,C.GOLD); set(hcx-1,top,C.GOLD); set(hcx+1,top,C.GOLD);
    pads(C.STEELL,C.GOLDD);
    for(let j=faceBot+4;j<Math.round(H*0.62);j++){ const s=span(j); if(!s)continue; const c=Math.round((s[0]+s[1])/2);
      for(let i=c-1;i<=c+1;i++) set(i,j,i===c?C.WHITE:C.GOLDD); }
    set(hcx,faceBot+9,C.GOLD); for(let i=hcx-1;i<=hcx+1;i++) set(i,faceBot+10,C.GOLD); set(hcx,faceBot+11,C.GOLD);
    disc(figL-6, faceBot+18, 8, C.STEEL, C.GOLD, C.RED);
  } else if(cls==="mage"){
    cone(faceTop-1, 18, headHalf+2, C.PURP, C.PURPD, "lin");
    for(let i=hcx-headHalf-3;i<=hcx+headHalf+3;i++){ set(i,faceTop,C.GOLD); set(i,faceTop-1,C.PURPD); }
    set(hcx+1,faceTop-12,C.GOLD); set(hcx+1,faceTop-11,C.CYAN);
    const stx=figR+5; for(let j=faceTop-4;j<Math.round(H*0.66);j++){ set(stx,j,j%2?C.WOOD:C.WOODD); set(stx+1,j,C.WOODD); }
    disc(stx, faceTop-6, 4, C.CYAN, [180,255,255], [240,255,255]);
  } else if(cls==="druid"){
    for(const dir of [-1,1]){ let x=hcx+dir*3; for(let s=0;s<14;s++){ const y=top-s; set(x,y,(s%2)?C.WOOD:C.WOODD);
      if(s===4||s===8){ set(x+dir,y,C.WOOD); set(x+dir*2,y-1,C.WOOD); } x+=dir*0.28; } }
    for(let k=0;k<9;k++){ const j=faceBot+1+k; const s=span(j); if(!s)continue;
      for(let t=0;t<3;t++){ set(s[0]+t,j,(t+j)%2?C.LEAF:C.FUR); set(s[1]-t,j,(t+j)%2?C.LEAFD:C.FUR); } }
    const bx=figL-5; for(let j=faceTop-2;j<Math.round(H*0.66);j++){ const t=(j-(faceTop-2))/(H*0.66-(faceTop-2));
      const off=Math.round(Math.sin(t*Math.PI)*6); set(bx-off,j,C.WOOD); set(bx-off+1,j,C.WOODD); }
    const t0=faceTop-2, t1=Math.round(H*0.66); for(let j=t0;j<t1;j++) set(bx,j,[210,200,170]);
  } else if(cls==="priest"){
    cone(faceTop, 15, headHalf+1, C.WHITE, C.WHITED, "round");
    for(let j=faceTop;j>=faceTop-15;j--) set(hcx,j,C.GOLD);
    for(let a=0;a<20;a++){ const ang=a/20*Math.PI*2; set(hcx+Math.cos(ang)*6, faceTop-17+Math.sin(ang)*2, C.GOLD); }
    pads(C.WHITE,C.WHITED);
    const rx=figR+5; for(let j=faceBot+4;j<faceBot+17;j++){ set(rx,j,C.GOLD); set(rx+1,j,C.GOLDD); }
    for(let i=rx-2;i<=rx+2;i++) set(i,faceBot+8,C.GOLD); disc(rx,faceBot+2,2,C.CYAN,[230,255,255],null);
  }
  cx.putImageData(im,0,0);
}

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
  // CAS-199: the face under the cowl — fixed skin tone, never the class palette, so
  // the hero stops reading as a headless cloak. The helmet has its own visor → no face.
  if(m.head !== "helmet" && _masks.face) bx.drawImage(toCell(tint(_masks.face, SKIN)), 0, 0);
  // CAS-199 v2: per-class clothing + accessories so each class reads distinct in-world
  // (mirrors tools/cas167-build-classes.mjs paintClassCell → menu and game match).
  paintClassAccessories(body, cls);
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
