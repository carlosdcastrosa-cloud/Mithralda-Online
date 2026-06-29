// CAS-238 — PRODUCE the 4 non-warrior class heroes at CLARICE FIDELITY from real
// hand-authored source art (CEO-approved HYBRID route, CAS-236/CAS-238). Replaces the
// CAS-167 procedural hooded-base recolors for mage/druid/priest/paladin with strips
// sliced from the same Drive packs that gave us Clarice (warrior), so every class is a
// real animated character (idle/walk/attack/death), not a recolored cowl.
//
// SOURCE per class (CEO directive, gasto $0):
//   priest  ← healer pack (robed caster, hand-authored)            recolor → cream/gold
//   druid   ← healer pack, palette variant + antler/leaf accent    recolor → forest green
//   mage    ← healer pack, recolored ARCANE + SILHOUETTE diff       recolor → purple/cyan
//             (CEO BINDING CONDITION: must NOT read as a recolored priest → differentiate
//              by SILHOUETTE not just palette: pointed hat + staff/orb + long robe.
//              Demonic `warlock` source REJECTED — CAS-199 risk.)
//   paladin ← Clarice atlas (already-accepted armored base)         recolor → holy gold + cross
//
// STYLE FORMULA: same head-to-body ratio + pixel density as Clarice (we reuse her exact
// CELL geometry + bake math from cas223). Class identity = HUE shift within the family +
// one silhouette accent. Dark outline + skin are PROTECTED from recolor so the figures
// keep their shading ramp and a readable face.
//
// Healer atlas = 384×512, 6×8 grid (64px): row0 idle, row2 walk, row3 death, row4 cast.
// Clarice atlas = 384×448, 6×7 grid (64px): row2 idle, row3 walk, row4 death, row5 attack.
//
//   node tools/cas238-class-strips.mjs
// Writes assets/erw/hero/classes/<cls>{,_walk,_attack,_death}.png for the 4 classes
// (840×166 idle/attack/death, 1120×166 walk) — drop straight into the cas223 render path.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const HEALER = join(ROOT, "assets", "packs", "healer", "healer", "1.png");
const CLARICE = join(ROOT, "assets", "clarice", "clarice_v1.png");

// MUST match render.js CLASS_FW/FH/AX/FOOT + classes.json.
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 160, FRAME = 64;

// Per-class production recipe. rows = source-atlas row index per state. recolor: HSL
// family for "robe/cloth" pixels (hue 0-360, sat 0-1, dl lightness add -255..255), plus
// a `keepSteel` flag (paladin: low-sat grey armour stays metallic). accent = silhouette
// signature painted per frame in CELL space.
const CLASSES = {
  priest:  { src: "healer",  rows: { idle:0, walk:2, death:3, attack:4 },
             recolor: { hue: 46,  sat: 0.18, dl: 78 },  accent: "halo" },
  druid:   { src: "healer",  rows: { idle:0, walk:2, death:3, attack:4 },
             recolor: { hue: 116, sat: 0.46, dl: 6 },   accent: "antlers" },
  mage:    { src: "healer",  rows: { idle:0, walk:2, death:3, attack:4 },
             recolor: { hue: 268, sat: 0.46, dl: -4 },  accent: "wizard" },
  paladin: { src: "clarice", rows: { idle:2, walk:3, death:4, attack:5 },
             recolor: { hue: 46,  sat: 0.62, dl: 34, keepSteel: true }, accent: "cross" },
};
const STATE_OUT = { idle: 6, walk: 8, death: 6, attack: 6 };  // out frame counts
const SRC_FC = 6;                                             // every source row has 6 frames

const srcB64 = {
  healer:  readFileSync(HEALER).toString("base64"),
  clarice: readFileSync(CLARICE).toString("base64"),
};

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (srcB64, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME, CLASSES, STATE_OUT, SRC_FC } = CFG;

  // ---- color helpers ----
  function rgb2hsl(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
    let h=0,s=0,l=(mx+mn)/2; if(d){ s=l>0.5?d/(2-mx-mn):d/(mx+mn);
      h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h*=60; } return [h,s,l]; }
  function hue2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
  function hsl2rgb(h,s,l){ h=((h%360)+360)%360/360; let r,g,b; if(!s){r=g=b=l;}
    else{ const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q; r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3); }
    return [Math.round(r*255),Math.round(g*255),Math.round(b*255)]; }
  const lum=(r,g,b)=>0.299*r+0.587*g+0.114*b;
  const isSkin=(r,g,b)=> r>135 && r>=g && g>=b && (r-b)>28 && r<246;   // protect a readable face

  // decode a source atlas into a recolored canvas (per class palette).
  async function recoloredAtlas(b64, rc){
    const img=new Image(); img.src="data:image/png;base64,"+b64; await img.decode();
    const W=img.naturalWidth, H=img.naturalHeight;
    const c=document.createElement("canvas"); c.width=W; c.height=H;
    const cx=c.getContext("2d"); cx.imageSmoothingEnabled=false; cx.drawImage(img,0,0);
    const im=cx.getImageData(0,0,W,H); const d=im.data;
    for(let p=0;p<d.length;p+=4){ const a=d[p+3]; if(a<10) continue;
      const r=d[p],g=d[p+1],b=d[p+2], L=lum(r,g,b);
      if(L<52) continue;                 // outline / dark interior — protected
      if(isSkin(r,g,b)) continue;        // face skin — protected
      if(rc.keepSteel){ const [,s]=rgb2hsl(r,g,b); if(s<0.20) continue; } // metal armour stays grey
      let [,, l]=rgb2hsl(r,g,b);
      l=Math.min(1,Math.max(0,l+rc.dl/255));
      const [nr,ng,nb]=hsl2rgb(rc.hue, rc.sat, l);
      d[p]=nr; d[p+1]=ng; d[p+2]=nb;
    }
    cx.putImageData(im,0,0);
    return { canvas:c, W, H, data:cx.getImageData(0,0,W,H).data };
  }

  // bbox of opaque pixels inside one frame sub-cell (col,row) of an atlas
  function frameBBox(data, AW, col, row){
    const ox=col*FRAME, oy=row*FRAME; let minx=FRAME,miny=FRAME,maxx=-1,maxy=-1;
    for(let j=0;j<FRAME;j++)for(let i=0;i<FRAME;i++){ if(data[((oy+j)*AW+(ox+i))*4+3]>16){
      if(i<minx)minx=i; if(i>maxx)maxx=i; if(j<miny)miny=j; if(j>maxy)maxy=j; } }
    return maxx<0?null:{minx,miny,maxx,maxy};
  }

  // ---- per-frame accent painters (CELL space) ----
  // detect head landmarks from a baked frame: top opaque row + centroid-x of the top band.
  function headInfo(fctx){
    const d=fctx.getImageData(0,0,CELL_W,CELL_H).data;
    let top=-1; for(let j=0;j<CELL_H && top<0;j++) for(let i=0;i<CELL_W;i++){ if(d[(j*CELL_W+i)*4+3]>24){ top=j; break; } }
    if(top<0) return null;
    let lo=CELL_W,hi=0; const band=Math.min(CELL_H,top+18);
    for(let j=top;j<band;j++)for(let i=0;i<CELL_W;i++){ if(d[(j*CELL_W+i)*4+3]>24){ if(i<lo)lo=i; if(i>hi)hi=i; } }
    return { top, cx:Math.round((lo+hi)/2), half:Math.max(6,Math.round((hi-lo)/2)) };
  }
  // opaque-pixel span [lo,hi] of a baked frame at row j (for body-tracking accents)
  function rowSpan(fctx, j){ const d=fctx.getImageData(0,j,CELL_W,1).data; let lo=CELL_W,hi=-1;
    for(let i=0;i<CELL_W;i++){ if(d[i*4+3]>24){ if(i<lo)lo=i; if(i>hi)hi=i; } } return hi<0?null:[lo,hi]; }
  function paintAccent(fctx, kind){
    const hi=headInfo(fctx); if(!hi) return; const { top, cx, half }=hi;
    // protruding head-gear (hat/staff/antlers) only makes sense on an UPRIGHT figure;
    // when the sprite collapses (death) the detected "head" is the heap-top, so the gear
    // would float above the corpse. Suppress it there — the robe colour still reads.
    const upright = top < 46;
    if((kind==="wizard"||kind==="antlers") && !upright) return;
    const set=(i,j,c,a)=>{ i=Math.round(i); j=Math.round(j); if(i<0||j<0||i>=CELL_W||j>=CELL_H) return;
      fctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${a==null?1:a})`; fctx.fillRect(i,j,1,1); };
    const line=(x0,y0,x1,y1,c)=>{ const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0))||1;
      for(let k=0;k<=n;k++){ set(x0+(x1-x0)*k/n, y0+(y1-y0)*k/n, c); } };
    const C={ HAT:[86,58,128], HATD:[46,30,72], BAND:[150,232,238], WOOD:[120,86,52], WOODD:[74,52,32],
      ORB:[150,236,240], ORBHI:[235,255,255], GOLD:[224,186,90], GOLDD:[150,120,44], WHITE:[236,236,224],
      ANT:[150,120,84], ANTD:[96,72,46], LEAF:[110,150,86] };
    if(kind==="wizard"){
      // tall pointed hat: apex above the crown, brim a touch wider than the head.
      const baseY=top+2, hgt=30, hwB=half+4;
      for(let j=baseY;j>=baseY-hgt;j--){ const t=(baseY-j)/hgt; const hw=Math.max(0,Math.round((1-t)*hwB));
        const lean=Math.round(t*t*4);                                  // slight rakish curve
        for(let i=cx-hw+lean;i<=cx+hw+lean;i++) set(i,j,(i===cx-hw+lean||i===cx+hw+lean)?C.HATD:C.HAT); }
      for(let i=cx-hwB-2;i<=cx+hwB+2;i++){ set(i,baseY+1,C.HATD); set(i,baseY,C.HAT); }   // brim
      for(let i=cx-hwB+1;i<=cx+hwB-1;i++) set(i,baseY-2,C.BAND);                          // cyan band
      set(cx+4,baseY-hgt+2,C.ORBHI); set(cx+5,baseY-hgt+3,C.BAND);                        // tip star
      // staff + orb on the right, anchored to the head so it tracks the figure.
      const stx=cx+half+8;
      for(let j=top-6;j<Math.round(CELL_H*0.74);j++){ set(stx,j,j%2?C.WOOD:C.WOODD); set(stx+1,j,C.WOODD); }
      for(let j=-4;j<=4;j++)for(let i=-4;i<=4;i++){ const dd=i*i+j*j; if(dd<=16) set(stx+i,top-9+j, dd<4?C.ORBHI:C.ORB); }
    } else if(kind==="antlers"){
      for(const s of [-1,1]){ const bx=cx+s*Math.round(half*0.5), by=top+1;
        line(bx,by, bx+s*7,by-12, C.ANT); line(bx,by, bx+s*8,by-11, C.ANTD);   // main beam
        line(bx+s*4,by-6, bx+s*9,by-4, C.ANT);                                  // lower tine
        line(bx+s*5,by-9, bx+s*10,by-12, C.ANT);                                // upper tine
        set(bx+s*9,by-5,C.LEAF); set(bx+s*10,by-13,C.LEAF);
      }
    } else if(kind==="halo"){
      // bright gold ring floating just above the crown (kept fully on-canvas).
      const ry=3, rx=half+1, cyh=Math.max(ry+1, top-3);
      for(let a=0;a<360;a+=10){ const rad=a*Math.PI/180;
        set(cx+Math.cos(rad)*rx, cyh+Math.sin(rad)*ry, C.GOLD);
        set(cx+Math.cos(rad)*(rx+1), cyh+Math.sin(rad)*ry, C.GOLDD); }
    } else if(kind==="cross"){
      // white tabard band + bold outlined gold cross, tracked to the TORSO centre of
      // this frame (Clarice leans/steps), so the holy signifier reads at every pose.
      const chestY=top+Math.round((FOOT-top)*0.26);
      const ccx=cx, ccy=chestY+4;
      // dark backing patch → the holy cross reads against the gold chest plate
      for(let j=ccy-5;j<=ccy+6;j++) for(let i=ccx-3;i<=ccx+3;i++) set(i,j,C.GOLDD);
      for(let j=ccy-4;j<=ccy+5;j++) set(ccx,j,C.WHITE);                                 // vertical bar
      for(let i=ccx-2;i<=ccx+2;i++) set(i,ccy,C.WHITE);                                 // horizontal bar
      set(ccx,ccy-5,C.GOLD); set(ccx,ccy+6,C.GOLD); set(ccx-3,ccy,C.GOLD); set(ccx+3,ccy,C.GOLD); // gold tips
    }
  }

  // bake one state strip for a class: scale source frames into the cell (cas223 math),
  // resample to STATE_OUT frames, then paint the class accent on each frame.
  function bakeState(atlas, cls, state, GLOBAL_SCALE){
    const cfg=CLASSES[cls]; const row=cfg.rows[state]; const outN=STATE_OUT[state];
    const ref=frameBBox(atlas.data, atlas.W, 0, row) || { minx:22,miny:36,maxx:41,maxy:49 };
    const cxSrc=(ref.minx+ref.maxx)/2, feetSrc=ref.maxy+1;
    const strip=document.createElement("canvas"); strip.width=CELL_W*outN; strip.height=CELL_H;
    const sx=strip.getContext("2d"); sx.imageSmoothingEnabled=false;
    for(let j=0;j<outN;j++){
      const srcCol = outN===SRC_FC ? j : Math.floor(j*SRC_FC/outN);
      const ox=srcCol*FRAME, oy=row*FRAME;
      const dW=FRAME*GLOBAL_SCALE, dH=FRAME*GLOBAL_SCALE;
      const dx=j*CELL_W + ANCHOR_X - cxSrc*GLOBAL_SCALE;
      const dy=FOOT - feetSrc*GLOBAL_SCALE;
      sx.drawImage(atlas.canvas, ox,oy,FRAME,FRAME, dx,dy,dW,dH);
      // paint accent into just this frame's sub-canvas region
      const fcv=document.createElement("canvas"); fcv.width=CELL_W; fcv.height=CELL_H;
      const fctx=fcv.getContext("2d"); fctx.imageSmoothingEnabled=false;
      fctx.drawImage(strip, j*CELL_W,0,CELL_W,CELL_H, 0,0,CELL_W,CELL_H);
      paintAccent(fctx, cfg.accent);
      sx.clearRect(j*CELL_W,0,CELL_W,CELL_H);
      sx.drawImage(fcv, j*CELL_W,0);
    }
    return strip.toDataURL("image/png");
  }

  const results={};
  for(const cls in CLASSES){
    const cfg=CLASSES[cls];
    const atlas=await recoloredAtlas(srcB64[cfg.src], cfg.recolor);
    // ONE global scale per class across all states (no size pulse) — tallest figure frame.
    let maxFigH=1;
    for(const st in cfg.rows){ const row=cfg.rows[st];
      for(let c=0;c<SRC_FC;c++){ const bb=frameBBox(atlas.data, atlas.W, c, row); if(bb) maxFigH=Math.max(maxFigH, bb.maxy-bb.miny+1); } }
    const SCALE=FIGURE_H/maxFigH;
    results[cls]={ scale:+SCALE.toFixed(3), figH:maxFigH,
      idle:bakeState(atlas,cls,"idle",SCALE), walk:bakeState(atlas,cls,"walk",SCALE),
      attack:bakeState(atlas,cls,"attack",SCALE), death:bakeState(atlas,cls,"death",SCALE) };
  }
  return results;
}, srcB64, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME, CLASSES, STATE_OUT, SRC_FC });

const FILES = { idle:"", walk:"_walk", attack:"_attack", death:"_death" };
let total=0;
for(const cls in out){ const r=out[cls];
  for(const st in FILES){ const buf=Buffer.from(r[st].split(",")[1],"base64");
    writeFileSync(join(OUT, cls+FILES[st]+".png"), buf); total+=buf.length; }
  console.log(`  ${cls.padEnd(8)} scale=${r.scale} figH=${r.figH}px → idle/walk/attack/death`);
}
console.log("wrote 16 strips ("+(total/1024|0)+"KB) to", OUT);
await browser.close();
console.log("done.");
