// CAS-283 — Re-bake the 4 NON-WARRIOR class DYNAMIC strips (druid/mage/paladin/priest
// attack + death) into WIDE, body-centred cells so their attack/death FX + protruding
// accents (staff/orb, antlers, halo, raised arms, the collapsed death sprawl) are no
// longer clipped at the shared 140px (CLASS_FW) cell boundary. Same bug CAS-282 fixed
// for the warrior (Clarice); same fix, applied to the CAS-238 healer/clarice pipeline.
//
// THE BUG: CAS-238 sliced these classes into the SAME 140×166 cell idle/walk use, but the
// attack cast pose (raised staff, wide arms) and the death sprawl spill past the cell edge
// — and worse, the silhouette accents painted in CELL space (mage staff/orb, druid antlers)
// were bounds-clamped at 140 so the orb/tine got cut. Measured edge contact (rows touching
// a cell edge): druid_attack 3/6, druid_death 4/6, mage_attack 2/6, mage_death 5/6 (worst
// 104), paladin_death 4/6, priest_death 4/6.
//
// THE FIX: re-bake ONLY attack + death for the 4 classes into a per-state WIDE (and where
// needed TALLER) cell, figure centroid at the cell CENTRE (renderer anchor ax=fw/2 for
// fw>CLASS_FW) and feet on the SAME constant 3px bottom gap. IDENTICAL per-class internal
// SCALE as CAS-238 (FIGURE_H/maxFigH over the 4 base rows) so the figure is the exact same
// on-screen size. render.js (CAS-282) already auto-detects fw>140 → centre anchor + feet
// row = fh-BOTTOM_GAP, so NO render code change and idle/walk + every 140px strip untouched.
//
//   node tools/cas283-class-wide.mjs
// Rewrites assets/erw/hero/classes/{druid,mage,paladin,priest}{_attack,_death}.png as WIDE
// strips (centroid-centred, fw>140). idle/walk strips are left exactly as CAS-238 baked them.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const HEALER = join(ROOT, "assets", "packs", "healer", "healer", "1.png");
const CLARICE = join(ROOT, "assets", "clarice", "clarice_v1.png");

// MUST match render.js CLASS_FW/FH/AX/FOOT (the legacy cell) so the figure size + feet line
// up exactly with idle/walk. The wide cell keeps the SAME 3px bottom gap (BOTTOM_GAP) and
// the SAME per-class internal scale; only the cell footprint grows.
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 160, FRAME = 64;
const BOTTOM_GAP = CELL_H - FOOT;          // 3 — feet sit at cellH-3 in every cell
const SRC_FC = 6;

// Same recolor + accent recipe as CAS-238 (identical art identity), only attack+death rows.
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
const STATE_OUT = { attack: 6, death: 6 }; // the two states we re-bake wide (match render FC)

const srcB64 = {
  healer:  readFileSync(HEALER).toString("base64"),
  clarice: readFileSync(CLARICE).toString("base64"),
};

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const out = await page.evaluate(async (srcB64, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME, BOTTOM_GAP, SRC_FC, CLASSES, STATE_OUT } = CFG;

  // ===== color helpers (verbatim from CAS-238 so the recolor is byte-identical) =====
  function rgb2hsl(r,g,b){ r/=255;g/=255;b/=255; const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;
    let h=0,s=0,l=(mx+mn)/2; if(d){ s=l>0.5?d/(2-mx-mn):d/(mx+mn);
      h=mx===r?((g-b)/d+(g<b?6:0)):mx===g?((b-r)/d+2):((r-g)/d+4); h*=60; } return [h,s,l]; }
  function hue2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
  function hsl2rgb(h,s,l){ h=((h%360)+360)%360/360; let r,g,b; if(!s){r=g=b=l;}
    else{ const q=l<0.5?l*(1+s):l+s-l*s,p=2*l-q; r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3); }
    return [Math.round(r*255),Math.round(g*255),Math.round(b*255)]; }
  const lum=(r,g,b)=>0.299*r+0.587*g+0.114*b;
  const isSkin=(r,g,b)=> r>135 && r>=g && g>=b && (r-b)>28 && r<246;

  async function recoloredAtlas(b64, rc){
    const img=new Image(); img.src="data:image/png;base64,"+b64; await img.decode();
    const W=img.naturalWidth, H=img.naturalHeight;
    const c=document.createElement("canvas"); c.width=W; c.height=H;
    const cx=c.getContext("2d"); cx.imageSmoothingEnabled=false; cx.drawImage(img,0,0);
    const im=cx.getImageData(0,0,W,H); const d=im.data;
    for(let p=0;p<d.length;p+=4){ const a=d[p+3]; if(a<10) continue;
      const r=d[p],g=d[p+1],b=d[p+2], L=lum(r,g,b);
      if(L<52) continue; if(isSkin(r,g,b)) continue;
      if(rc.keepSteel){ const [,s]=rgb2hsl(r,g,b); if(s<0.20) continue; }
      let [,, l]=rgb2hsl(r,g,b);
      l=Math.min(1,Math.max(0,l+rc.dl/255));
      const [nr,ng,nb]=hsl2rgb(rc.hue, rc.sat, l);
      d[p]=nr; d[p+1]=ng; d[p+2]=nb;
    }
    cx.putImageData(im,0,0);
    return { canvas:c, W, H, data:cx.getImageData(0,0,W,H).data };
  }
  function frameBBox(data, AW, col, row){
    const ox=col*FRAME, oy=row*FRAME; let minx=FRAME,miny=FRAME,maxx=-1,maxy=-1;
    for(let j=0;j<FRAME;j++)for(let i=0;i<FRAME;i++){ if(data[((oy+j)*AW+(ox+i))*4+3]>16){
      if(i<minx)minx=i; if(i>maxx)maxx=i; if(j<miny)miny=j; if(j>maxy)maxy=j; } }
    return maxx<0?null:{minx,miny,maxx,maxy};
  }

  // ===== accent painters — parameterised on the cell W/H so they work in the WIDE cell.
  // (CAS-238 hard-coded CELL_W/CELL_H globals; here the cell is bigger, and crucially the
  // accents are no longer bounds-clamped at 140 — the orb/antler tip survives.) =====
  function headInfo(d, W, H){
    let top=-1; for(let j=0;j<H && top<0;j++) for(let i=0;i<W;i++){ if(d[(j*W+i)*4+3]>24){ top=j; break; } }
    if(top<0) return null;
    let lo=W,hi=0; const band=Math.min(H,top+18);
    for(let j=top;j<band;j++)for(let i=0;i<W;i++){ if(d[(j*W+i)*4+3]>24){ if(i<lo)lo=i; if(i>hi)hi=i; } }
    return { top, cx:Math.round((lo+hi)/2), half:Math.max(6,Math.round((hi-lo)/2)) };
  }
  function paintAccent(fctx, kind, W, H){
    const d=fctx.getImageData(0,0,W,H).data;
    const hi=headInfo(d, W, H); if(!hi) return; const { top, cx, half }=hi;
    const upright = top < (H-CELL_H) + 46;   // death heap-top sits low → suppress headgear
    if((kind==="wizard"||kind==="antlers") && !upright) return;
    const set=(i,j,c,a)=>{ i=Math.round(i); j=Math.round(j); if(i<0||j<0||i>=W||j>=H) return;
      fctx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${a==null?1:a})`; fctx.fillRect(i,j,1,1); };
    const line=(x0,y0,x1,y1,c)=>{ const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0))||1;
      for(let k=0;k<=n;k++){ set(x0+(x1-x0)*k/n, y0+(y1-y0)*k/n, c); } };
    const C={ HAT:[86,58,128], HATD:[46,30,72], BAND:[150,232,238], WOOD:[120,86,52], WOODD:[74,52,32],
      ORB:[150,236,240], ORBHI:[235,255,255], GOLD:[224,186,90], GOLDD:[150,120,44], WHITE:[236,236,224],
      ANT:[150,120,84], ANTD:[96,72,46], LEAF:[110,150,86] };
    const FOOTROW = H - BOTTOM_GAP;
    if(kind==="wizard"){
      const baseY=top+2, hgt=30, hwB=half+4;
      for(let j=baseY;j>=baseY-hgt;j--){ const t=(baseY-j)/hgt; const hw=Math.max(0,Math.round((1-t)*hwB));
        const lean=Math.round(t*t*4);
        for(let i=cx-hw+lean;i<=cx+hw+lean;i++) set(i,j,(i===cx-hw+lean||i===cx+hw+lean)?C.HATD:C.HAT); }
      for(let i=cx-hwB-2;i<=cx+hwB+2;i++){ set(i,baseY+1,C.HATD); set(i,baseY,C.HAT); }
      for(let i=cx-hwB+1;i<=cx+hwB-1;i++) set(i,baseY-2,C.BAND);
      set(cx+4,baseY-hgt+2,C.ORBHI); set(cx+5,baseY-hgt+3,C.BAND);
      const stx=cx+half+8;
      for(let j=top-6;j<Math.round(FOOTROW*0.92);j++){ set(stx,j,j%2?C.WOOD:C.WOODD); set(stx+1,j,C.WOODD); }
      for(let j=-4;j<=4;j++)for(let i=-4;i<=4;i++){ const dd=i*i+j*j; if(dd<=16) set(stx+i,top-9+j, dd<4?C.ORBHI:C.ORB); }
    } else if(kind==="antlers"){
      for(const s of [-1,1]){ const bx=cx+s*Math.round(half*0.5), by=top+1;
        line(bx,by, bx+s*7,by-12, C.ANT); line(bx,by, bx+s*8,by-11, C.ANTD);
        line(bx+s*4,by-6, bx+s*9,by-4, C.ANT);
        line(bx+s*5,by-9, bx+s*10,by-12, C.ANT);
        set(bx+s*9,by-5,C.LEAF); set(bx+s*10,by-13,C.LEAF);
      }
    } else if(kind==="halo"){
      const ry=3, rx=half+1, cyh=Math.max(ry+1, top-3);
      for(let a=0;a<360;a+=10){ const rad=a*Math.PI/180;
        set(cx+Math.cos(rad)*rx, cyh+Math.sin(rad)*ry, C.GOLD);
        set(cx+Math.cos(rad)*(rx+1), cyh+Math.sin(rad)*ry, C.GOLDD); }
    } else if(kind==="cross"){
      const chestY=top+Math.round((FOOTROW-top)*0.26);
      const ccx=cx, ccy=chestY+4;
      for(let j=ccy-5;j<=ccy+6;j++) for(let i=ccx-3;i<=ccx+3;i++) set(i,j,C.GOLDD);
      for(let j=ccy-4;j<=ccy+5;j++) set(ccx,j,C.WHITE);
      for(let i=ccx-2;i<=ccx+2;i++) set(i,ccy,C.WHITE);
      set(ccx,ccy-5,C.GOLD); set(ccx,ccy+6,C.GOLD); set(ccx-3,ccy,C.GOLD); set(ccx+3,ccy,C.GOLD);
    }
  }

  // Scratch cell big enough that figure + accents never touch its edge while we measure.
  const SCR_W = 280, SCR_H = 230, SCR_CX = SCR_W/2, SCR_FOOT = SCR_H - BOTTOM_GAP;

  // Bake one out-frame (figure + accent) into a scratch canvas, centroid at SCR_CX,
  // feet at SCR_FOOT. Returns the scratch canvas.
  function bakeFrameScratch(atlas, cfg, row, srcCol, SCALE){
    const ref = frameBBox(atlas.data, atlas.W, 0, row) || { minx:22,miny:36,maxx:41,maxy:49 };
    const cxSrc=(ref.minx+ref.maxx)/2, feetSrc=ref.maxy+1;
    const cv=document.createElement("canvas"); cv.width=SCR_W; cv.height=SCR_H;
    const cx=cv.getContext("2d"); cx.imageSmoothingEnabled=false;
    const ox=srcCol*FRAME, oy=row*FRAME, dW=FRAME*SCALE, dH=FRAME*SCALE;
    const dx=SCR_CX - cxSrc*SCALE, dy=SCR_FOOT - feetSrc*SCALE;
    cx.drawImage(atlas.canvas, ox,oy,FRAME,FRAME, dx,dy,dW,dH);
    paintAccent(cx, cfg.accent, SCR_W, SCR_H);
    return cv;
  }
  function unionBBox(cv){
    const d=cv.getContext("2d").getImageData(0,0,cv.width,cv.height).data;
    let minx=cv.width,miny=cv.height,maxx=-1,maxy=-1;
    for(let j=0;j<cv.height;j++)for(let i=0;i<cv.width;i++){ if(d[(j*cv.width+i)*4+3]>16){
      if(i<minx)minx=i; if(i>maxx)maxx=i; if(j<miny)miny=j; if(j>maxy)maxy=j; } }
    return maxx<0?null:{minx,miny,maxx,maxy};
  }

  function bakeStateWide(atlas, cfg, state, SCALE){
    const row=cfg.rows[state], outN=STATE_OUT[state];
    // pass 1 — bake every out-frame oversize, measure the combined opaque footprint
    const frames=[]; let minx=SCR_W,maxx=-1,miny=SCR_H;
    for(let j=0;j<outN;j++){
      const srcCol = outN===SRC_FC ? j : Math.floor(j*SRC_FC/outN);
      const cv=bakeFrameScratch(atlas, cfg, row, srcCol, SCALE); frames.push(cv);
      const bb=unionBBox(cv); if(!bb) continue;
      if(bb.minx<minx)minx=bb.minx; if(bb.maxx>maxx)maxx=bb.maxx; if(bb.miny<miny)miny=bb.miny;
    }
    if(maxx<0){ minx=SCR_CX-30; maxx=SCR_CX+30; miny=SCR_FOOT-100; }
    // pass 2 — size the final cell. Width symmetric about the figure centroid (SCR_CX) so
    // the render anchor (ax=fw/2) lands on the body; +pad each side. Height from content
    // top down to the fixed feet line, +pad. Never narrower/shorter than the legacy cell.
    const PAD_X=8, PAD_Y=6;
    let halfW=Math.max(SCR_CX-minx, maxx-SCR_CX)+PAD_X;
    let cellW=Math.ceil(halfW)*2; if(cellW%2)cellW++; if(cellW<=CELL_W)cellW=CELL_W+2;
    let cellH=(SCR_FOOT - miny) + PAD_Y + BOTTOM_GAP; cellH=Math.ceil(cellH);
    if(cellH<CELL_H)cellH=CELL_H;
    const AX=cellW/2, FEET=cellH-BOTTOM_GAP;
    // copy each scratch frame into its column, aligning centroid SCR_CX→AX and feet SCR_FOOT→FEET
    const strip=document.createElement("canvas"); strip.width=cellW*outN; strip.height=cellH;
    const sx=strip.getContext("2d"); sx.imageSmoothingEnabled=false;
    for(let j=0;j<outN;j++){
      sx.drawImage(frames[j], SCR_CX-AX, SCR_FOOT-FEET, cellW, cellH, j*cellW, 0, cellW, cellH);
    }
    console.log(`  [${state}] cell=${cellW}x${cellH} AX=${AX} FEET=${FEET}`);
    return { dataUrl: strip.toDataURL("image/png"), cellW, cellH, AX, FEET, outN };
  }

  const results={};
  for(const cls in CLASSES){
    const cfg=CLASSES[cls];
    const atlas=await recoloredAtlas(srcB64[cfg.src], cfg.recolor);
    // identical per-class internal scale to CAS-238 (tallest figure frame across all 4 base rows)
    let maxFigH=1;
    for(const st in cfg.rows){ const row=cfg.rows[st];
      for(let c=0;c<SRC_FC;c++){ const bb=frameBBox(atlas.data, atlas.W, c, row); if(bb) maxFigH=Math.max(maxFigH, bb.maxy-bb.miny+1); } }
    const SCALE=FIGURE_H/maxFigH;
    console.log(`  ${cls} scale=${SCALE.toFixed(3)} figH=${maxFigH}`);
    results[cls]={ scale:+SCALE.toFixed(3),
      attack:bakeStateWide(atlas,cfg,"attack",SCALE),
      death: bakeStateWide(atlas,cfg,"death",SCALE) };
  }
  return results;
}, srcB64, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, FRAME, BOTTOM_GAP, SRC_FC, CLASSES, STATE_OUT });

const FILES = { attack:"_attack", death:"_death" };
let total=0;
for(const cls in out){ const r=out[cls];
  for(const st in FILES){ const buf=Buffer.from(r[st].dataUrl.split(",")[1],"base64");
    writeFileSync(join(OUT, cls+FILES[st]+".png"), buf); total+=buf.length;
    console.log(`  ${(cls+FILES[st]).padEnd(16)} -> ${r[st].cellW}x${r[st].cellH} (${r[st].outN}f, AX=${r[st].AX})`); }
}
console.log("wrote 8 WIDE strips ("+(total/1024|0)+"KB) to", OUT);
await browser.close();
console.log("done.");
