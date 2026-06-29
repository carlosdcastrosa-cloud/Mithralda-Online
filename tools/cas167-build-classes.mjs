// ===========================================================================
// tools/cas167-build-classes.mjs — CAS-167: derive the 5 playable class heroes
// from the EXACT canonical Main Character (art-reference/main-character.png, the
// Drive sprite the CEO pointed to) and bake a real WALK cycle + breathing idle
// for each — "no personajes estáticos".
//
// WHY THIS REPLACES THE OLD ART: the previous in-game class sprites (full-plate
// warrior w/ cape, pointy-hat wizard) drifted completely off the canonical
// hooded silhouette — the CEO did not recognise them as "the same character".
// STYLE FORMULA law: class variants shift HUE/ACCENT within the family, never
// the silhouette/proportion/pixel-density. So every class here is the identical
// hooded figure; only the cloak hue + sash accent change:
//   warrior steel-blue (canonical) · paladin holy-gold · mage arcane-purple ·
//   druid forest-green · priest cream-white. Black hood-interior/outline/legs
//   are PROTECTED so all five stay one family.
//
// PIPELINE (browser canvas, same dep as slice-hero-anim/recolor-class):
//   1) decode canonical PNG (already a clean transparent cutout), trim to bbox.
//   2) per class: HSL recolor of the cloak ramp + accent recolor of the red sash
//      (lightness preserved → shading ramp intact). Dark base kept.
//   3) nearest-scale the figure to figureH=160 into CELL space (140×166) so the
//      on-screen size + CLASS_ANIM_SCALE=0.32 match the existing geometry exactly
//      (render.js CLASS_FW/FH/AX/FOOT unchanged → zero render edits).
//   4) split body vs the two legs (legs = dark pixels below the cloak hem).
//   5) bake clshero_<cls>.png  = 6-frame breathing idle (torso bob, feet planted)
//      and clswalk_<cls>.png   = 8-frame walk (alt-leg swing+lift + body footfall
//      bob), animated in CELL space so the motion is visible at game scale.
//
// Emits assets/erw/hero/classes/{clshero base}.png is NOT touched — we write the
// render-consumed names: <cls>.png (idle, 6f) + <cls>_walk.png (walk, 8f), the
// same files render.js already loads as clshero_*/clswalk_*. Plus a preview
// contact sheet tools/cas167-preview.png. Run: node tools/cas167-build-classes.mjs
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(ROOT, "art-reference", "main-character.png");
const OUT = join(ROOT, "assets", "erw", "hero", "classes");
const b64 = readFileSync(SRC).toString("base64");

// Cell geometry — MUST match render.js CLASS_FW/FH/AX/FOOT + classes.json.
const CELL_W = 140, CELL_H = 166, ANCHOR_X = 65, FOOT = 163, FIGURE_H = 142; // CAS-199: shorter figure → headroom for tall class headgear (hats/mitres/antlers/plumes)
const IDLE_FC = 6, WALK_FC = 8;

// Per-class palette: cloak {hue 0-360, sat 0-1, light add -255..255} + sash accent.
// warrior = canonical steel-blue (near-identity). The rest shift within the family.
const CLASSES = {
  warrior: { cloak: { hue: 212, sat: 0.34, dl: 0 },  sash: { hue: 350, sat: 0.78, dl: 0 } },
  paladin: { cloak: { hue: 44,  sat: 0.55, dl: 14 }, sash: { hue: 350, sat: 0.80, dl: -4 } },
  mage:    { cloak: { hue: 264, sat: 0.42, dl: 2 },  sash: { hue: 188, sat: 0.72, dl: 8 } },
  druid:   { cloak: { hue: 122, sat: 0.40, dl: 0 },  sash: { hue: 32,  sat: 0.66, dl: 0 } },
  priest:  { cloak: { hue: 210, sat: 0.08, dl: 30 }, sash: { hue: 45,  sat: 0.80, dl: 6 } },
};

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", m => console.log("  [page]", m.text()));

const result = await page.evaluate(async (b64, CFG) => {
  const { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, IDLE_FC, WALK_FC, CLASSES } = CFG;

  // ---- color helpers ----
  function rgb2hsl(r, g, b) {
    r/=255; g/=255; b/=255;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
    let h=0, s=0, l=(mx+mn)/2;
    if(d){ s=l>0.5? d/(2-mx-mn): d/(mx+mn);
      h = mx===r ? ((g-b)/d+(g<b?6:0)) : mx===g ? ((b-r)/d+2) : ((r-g)/d+4);
      h*=60; }
    return [h,s,l];
  }
  function hue2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
  function hsl2rgb(h,s,l){ h=((h%360)+360)%360/360; let r,g,b;
    if(!s){ r=g=b=l; } else { const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
      r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3); }
    return [Math.round(r*255),Math.round(g*255),Math.round(b*255)];
  }

  // ---- decode + trim canonical ----
  const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const sc = document.createElement("canvas"); sc.width=W; sc.height=H;
  const sx = sc.getContext("2d"); sx.imageSmoothingEnabled=false; sx.drawImage(img,0,0);
  const src = sx.getImageData(0,0,W,H);
  const sd = src.data;
  let minx=W,miny=H,maxx=0,maxy=0;
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){ if(sd[(j*W+i)*4+3]>10){ if(i<minx)minx=i;if(i>maxx)maxx=i;if(j<miny)miny=j;if(j>maxy)maxy=j; } }
  const fw=maxx-minx+1, fh=maxy-miny+1;

  // classify a pixel: 'sash' (red dominant) | 'dark' (hood/outline/legs, protected) | 'cloak'
  function classify(r,g,b){
    if(r>130 && r>g*1.55 && r>b*1.35) return "sash";
    if(Math.max(r,g,b) < 78) return "dark";
    return "cloak";
  }

  // build one recolored NATIVE figure (fw×fh) ImageData for a class
  function recolor(cls){
    const p = CLASSES[cls];
    const c = document.createElement("canvas"); c.width=fw; c.height=fh;
    const cx = c.getContext("2d"); const id = cx.createImageData(fw,fh); const od=id.data;
    for(let j=0;j<fh;j++)for(let i=0;i<fw;i++){
      const so=((j+miny)*W+(i+minx))*4, oo=(j*fw+i)*4;
      const a=sd[so+3]; od[oo+3]=a; if(a<10) continue;
      let r=sd[so], g=sd[so+1], b=sd[so+2];
      const kind=classify(r,g,b);
      if(kind==="dark"){ od[oo]=r; od[oo+1]=g; od[oo+2]=b; continue; }
      const spec = kind==="sash"? p.sash : p.cloak;
      let [h,s,l]=rgb2hsl(r,g,b);
      l = Math.min(1, Math.max(0, l + spec.dl/255));
      const [nr,ng,nb]=hsl2rgb(spec.hue, spec.sat, l);
      od[oo]=nr; od[oo+1]=ng; od[oo+2]=nb;
    }
    cx.putImageData(id,0,0);
    return c;
  }

  // CAS-199: paint a face into the hood's dark cavity so the static class strips
  // (used on the CLASS-SELECT screen, before the part-mask bake runs) stop reading
  // as a headless cowl. Mirrors tools/cas167-parts.mjs makeFace; SKIN is the same
  // fixed class-independent tone, applied directly in RGB (value v → SKIN*(v/165)).
  function paintFace(nat){
    const SKIN=[226,196,162], MID=165, lum=(r,g,b)=>0.299*r+0.587*g+0.114*b;
    const cx=nat.getContext("2d"); const im=cx.getImageData(0,0,fw,fh); const d=im.data;
    const headBand=Math.round(fh*0.26);
    let minx=fw,miny=fh,maxx=0,maxy=0,found=false;
    for(let j=0;j<headBand;j++)for(let i=0;i<fw;i++){ const o=(j*fw+i)*4; if(d[o+3]<20) continue;
      if(lum(d[o],d[o+1],d[o+2])<78){ found=true; if(i<minx)minx=i;if(i>maxx)maxx=i;if(j<miny)miny=j;if(j>maxy)maxy=j; } }
    if(!found){ return; }
    const cw=maxx-minx+1, ch=maxy-miny+1, fcx=(minx+maxx)/2;
    const faceTop=miny+Math.round(ch*0.06), faceH=Math.max(7,Math.round(ch*0.60)), faceCy=faceTop+faceH/2;
    const rx=Math.max(3,cw*0.44), ry=faceH/2;
    const put=(i,j,v)=>{ if(i<0||j<0||i>=fw||j>=fh) return; const o=(j*fw+i)*4;
      d[o]=Math.min(255,SKIN[0]*v/MID); d[o+1]=Math.min(255,SKIN[1]*v/MID); d[o+2]=Math.min(255,SKIN[2]*v/MID); d[o+3]=255; };
    for(let j=faceTop;j<=faceTop+faceH;j++)for(let i=Math.round(fcx-rx)-1;i<=Math.round(fcx+rx)+1;i++){
      const nx=(i-fcx)/rx, ny=(j-faceCy)/ry; if(nx*nx+ny*ny>1) continue;
      const ty=(j-faceTop)/faceH; let v=178; if(ty<0.26)v=118; else if(ty>0.70)v=132;
      if(Math.abs(i-fcx)<0.7 && ty>0.34 && ty<0.74) v=Math.min(214,v+26);
      put(i,j,v);
    }
    const eyeY=Math.round(faceTop+faceH*0.40), eyeDX=Math.max(1,Math.round(rx*0.55));
    for(const ex of [Math.round(fcx-eyeDX),Math.round(fcx+eyeDX)]){ put(ex,eyeY,74); put(ex,eyeY+1,250); }
    cx.putImageData(im,0,0);
  }

  // CAS-199 (CEO v2): per-class CLOTHING + ACCESSORIES, drawn on the SAME main-character
  // hooded figure so every class shares the style but reads distinct: headgear over the
  // hood crown (face stays visible below), shoulder pieces, and a side prop. Pixel colours
  // are the main-char steel/leather/gold family. Runs AFTER recolor+face, BEFORE cell-scale.
  // CAS-199 (CEO v2): bold per-class CLOTHING + ACCESSORIES drawn in CELL space (140px
  // wide → room for side-props that extend the silhouette, which is what actually reads
  // at game scale). Same hooded main-character figure underneath → shared style, distinct
  // class. Headgear recolours the hood crown; props (sword/shield/staff/bow/relic) stick
  // out; shoulders bulk up. Runs on the cell layer BEFORE leg-split, so it rides the body.
  function paintClassCell(layer, cls){
    const W=CELL_W, H=CELL_H, cx=layer.getContext("2d"); const im=cx.getImageData(0,0,W,H); const d=im.data;
    const set=(i,j,c)=>{ i=Math.round(i); j=Math.round(j); if(i<0||j<0||i>=W||j>=H) return; const o=(j*W+i)*4; d[o]=c[0]; d[o+1]=c[1]; d[o+2]=c[2]; d[o+3]=255; };
    const span=(j)=>{ let lo=W,hi=-1; for(let i=0;i<W;i++) if(d[(j*W+i)*4+3]>20){ if(i<lo)lo=i; if(i>hi)hi=i; } return hi<0?null:[lo,hi]; };
    // head landmarks from the SKIN face (warm pixels) — excludes hood (blue) and sash (g<b)
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
    const fillCrown=(body,edge)=>{ for(let j=top;j<faceTop;j++){ const s=span(j); if(!s)continue;
      for(let i=s[0];i<=s[1];i++) set(i,j,(i===s[0]||i===s[1])?edge:((j-top)<2?body:body)); } };
    const pads=(col,edge)=>{ for(let k=0;k<8;k++){ const j=faceBot+1+k; const s=span(j); if(!s)continue;
      const w=k<5?3:2; for(let t=0;t<w;t++){ set(s[0]+t,j,t===w-1?edge:col); set(s[1]-t,j,t===w-1?edge:col); } } };
    const disc=(ccx,ccy,R,fill,rim,gem)=>{ for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){ const dd=i*i+j*j;
      if(dd<=R*R) set(ccx+i,ccy+j, dd>(R-1)*(R-1)?rim : (gem&&dd<4?gem:fill)); } };

    // tall cone helper (point at top → wide at brimY); shape 'lin' or 'round'
    const cone=(brimY,hgt,halfW,body,edge,shape)=>{ for(let j=brimY;j>=brimY-hgt;j--){ const t=(brimY-j)/hgt;
      const f=shape==="round"?(1-t*t):(1-t); const hw=Math.max(0,Math.round(f*halfW));
      for(let i=hcx-hw;i<=hcx+hw;i++) set(i,j,(i===hcx-hw||i===hcx+hw)?edge:body); } };

    if(cls==="warrior"){                         // steel helm + tall fin crest + pauldrons + sword
      fillCrown(C.STEEL,C.OUT);
      for(let i=hcx-headHalf;i<=hcx+headHalf;i++) set(i,faceTop,C.STEELD);                  // brow ridge / visor
      for(let j=top;j>=top-13;j--){ set(hcx,j,(j%2)?C.STEELL:C.STEEL); set(hcx-1,j,C.STEELD); } // mohawk fin crest
      pads(C.STEEL,C.STEELD);
      const bx=figR+3, by=faceBot+12;
      for(let s=0;s<30;s++){ const i=bx+s*0.42, j=by-s; set(i,j,C.STEELL); set(i+1,j,C.STEEL); set(i+2,j,C.STEELD); } // 3px blade up-right
      for(let i=-3;i<=3;i++) set(bx+i,by+1,C.GOLD); set(bx,by+2,C.WOOD); set(bx,by+3,C.WOOD); set(bx,by+4,C.GOLD); // guard+grip+pommel
    } else if(cls==="paladin"){                  // gilded helm + tall plume + tabard + shield
      fillCrown(C.STEELL,C.OUT);
      for(let i=hcx-headHalf;i<=hcx+headHalf;i++) set(i,faceTop,C.GOLD);
      for(let j=top;j>=top-15;j--){ const w=(top-j)<4; set(hcx,j,(j%2)?C.RED:[214,84,84]); if(w)set(hcx+1,j,C.RED); } // plume
      set(hcx,top,C.GOLD); set(hcx-1,top,C.GOLD); set(hcx+1,top,C.GOLD);
      pads(C.STEELL,C.GOLDD);
      for(let j=faceBot+4;j<Math.round(H*0.62);j++){ const s=span(j); if(!s)continue; const c=Math.round((s[0]+s[1])/2);
        for(let i=c-1;i<=c+1;i++) set(i,j,i===c?C.WHITE:C.GOLDD); }                          // tabard
      set(hcx,faceBot+9,C.GOLD); for(let i=hcx-1;i<=hcx+1;i++) set(i,faceBot+10,C.GOLD); set(hcx,faceBot+11,C.GOLD); // cross
      disc(figL-6, faceBot+18, 8, C.STEEL, C.GOLD, C.RED);                                  // shield (left)
    } else if(cls==="mage"){                     // TALL pointed wizard hat + glowing staff
      cone(faceTop-1, 18, headHalf+2, C.PURP, C.PURPD, "lin");
      for(let i=hcx-headHalf-3;i<=hcx+headHalf+3;i++){ set(i,faceTop,C.GOLD); set(i,faceTop-1,C.PURPD); } // wide brim
      set(hcx+1,faceTop-12,C.GOLD); set(hcx+1,faceTop-11,C.CYAN);                            // star on the hat
      const stx=figR+5; for(let j=faceTop-4;j<Math.round(H*0.66);j++){ set(stx,j,j%2?C.WOOD:C.WOODD); set(stx+1,j,C.WOODD); } // staff
      disc(stx, faceTop-6, 4, C.CYAN, [180,255,255], [240,255,255]);                        // big orb
    } else if(cls==="druid"){                    // tall branching antlers + fur mantle + bow
      for(const dir of [-1,1]){ let x=hcx+dir*3; for(let s=0;s<14;s++){ const y=top-s; set(x,y,C.WOOD); set(x,y,(s%2)?C.WOOD:C.WOODD);
        if(s===4||s===8){ set(x+dir,y,C.WOOD); set(x+dir*2,y-1,C.WOOD); } x+=dir*0.28; } }                  // antlers w/ prongs
      for(let k=0;k<9;k++){ const j=faceBot+1+k; const s=span(j); if(!s)continue;
        for(let t=0;t<3;t++){ set(s[0]+t,j,(t+j)%2?C.LEAF:C.FUR); set(s[1]-t,j,(t+j)%2?C.LEAFD:C.FUR); } }     // fur/leaf mantle
      const bx=figL-5; for(let j=faceTop-2;j<Math.round(H*0.66);j++){ const t=(j-(faceTop-2))/(H*0.66-(faceTop-2));
        const off=Math.round(Math.sin(t*Math.PI)*6); set(bx-off,j,C.WOOD); set(bx-off+1,j,C.WOODD); }         // thick bow limb
      const t0=faceTop-2, t1=Math.round(H*0.66); for(let j=t0;j<t1;j++) set(bx,j+0,[210,200,170]);            // bowstring
    } else if(cls==="priest"){                   // tall white mitre + halo + mantle + relic
      cone(faceTop, 15, headHalf+1, C.WHITE, C.WHITED, "round");
      for(let j=faceTop;j>=faceTop-15;j--) set(hcx,j,C.GOLD);                               // mitre gold band
      for(let a=0;a<20;a++){ const ang=a/20*Math.PI*2; set(hcx+Math.cos(ang)*6, faceTop-17+Math.sin(ang)*2, C.GOLD); } // halo ring
      pads(C.WHITE,C.WHITED);
      const rx=figR+5; for(let j=faceBot+4;j<faceBot+17;j++){ set(rx,j,C.GOLD); set(rx+1,j,C.GOLDD); }        // relic staff
      for(let i=rx-2;i<=rx+2;i++) set(i,faceBot+8,C.GOLD); disc(rx,faceBot+2,2,C.CYAN,[230,255,255],null);    // crossbar + gem
    }
    cx.putImageData(im,0,0);
  }

  // scale a native figure into CELL space at FIGURE_H, feet on FOOT, centroid on ANCHOR_X.
  // returns {canvas: figureLayer(CELL_W×CELL_H), legTopY} — legTopY in cell rows.
  function toCellLayer(nativeCanvas){
    const scale = FIGURE_H / fh;
    const dw = Math.round(fw*scale), dh = FIGURE_H;
    const dx = Math.round(ANCHOR_X - dw/2), dy = FOOT - dh;
    const c = document.createElement("canvas"); c.width=CELL_W; c.height=CELL_H;
    const cx = c.getContext("2d"); cx.imageSmoothingEnabled=false;
    cx.drawImage(nativeCanvas, 0,0,fw,fh, dx,dy,dw,dh);
    return { canvas:c, dx, dy, dw, dh, scale };
  }

  // From a cell-space figure layer, find the leg region: scan rows bottom-up; a
  // "leg row" is one whose opaque pixels are all dark and span <55% of figure width.
  function findLegTop(layer, dx, dw){
    const cx = layer.getContext("2d"); const d = cx.getImageData(0,0,CELL_W,CELL_H).data;
    let legTop = CELL_H;
    for(let j=CELL_H-1;j>=0;j--){
      let cnt=0, dark=0, lo=CELL_W, hi=0;
      for(let i=0;i<CELL_W;i++){ const o=(j*CELL_W+i)*4; if(d[o+3]<24) continue; cnt++; if(i<lo)lo=i;if(i>hi)hi=i; if(Math.max(d[o],d[o+1],d[o+2])<90) dark++; }
      if(!cnt) continue;
      const span=hi-lo+1;
      const isLeg = dark>=cnt*0.7 && span < dw*0.62;
      if(isLeg) legTop=j; else break;
    }
    return legTop;
  }

  // split a cell-space figure into body (above legTop) and legL/legR canvases.
  function split(layer, legTop){
    const cx0 = layer.getContext("2d"); const d = cx0.getImageData(0,0,CELL_W,CELL_H).data;
    // leg horizontal centroid → split point
    let sum=0,n=0;
    for(let j=legTop;j<CELL_H;j++)for(let i=0;i<CELL_W;i++){const o=(j*CELL_W+i)*4; if(d[o+3]>24){sum+=i;n++;}}
    const splitX = n? Math.round(sum/n): ANCHOR_X;
    const mk=()=>{ const c=document.createElement("canvas"); c.width=CELL_W;c.height=CELL_H; return c; };
    const body=mk(), legL=mk(), legR=mk();
    const bx=body.getContext("2d"), lx=legL.getContext("2d"), rx=legR.getContext("2d");
    const bi=bx.createImageData(CELL_W,CELL_H), li=lx.createImageData(CELL_W,CELL_H), ri=rx.createImageData(CELL_W,CELL_H);
    for(let j=0;j<CELL_H;j++)for(let i=0;i<CELL_W;i++){
      const o=(j*CELL_W+i)*4; if(d[o+3]<8) continue;
      let t;
      if(j<legTop) t=bi; else t=(i<splitX)?li:ri;
      t.data[o]=d[o];t.data[o+1]=d[o+1];t.data[o+2]=d[o+2];t.data[o+3]=d[o+3];
    }
    bx.putImageData(bi,0,0); lx.putImageData(li,0,0); rx.putImageData(ri,0,0);
    return { body, legL, legR, splitX };
  }

  // compose a frame from body+legs with offsets, into a CELL_W×CELL_H canvas
  function frame(parts, bodyDX, bodyDY, lDX, lDY, rDX, rDY){
    const c=document.createElement("canvas"); c.width=CELL_W;c.height=CELL_H;
    const cx=c.getContext("2d"); cx.imageSmoothingEnabled=false;
    cx.drawImage(parts.legL, lDX, lDY);
    cx.drawImage(parts.legR, rDX, rDY);
    cx.drawImage(parts.body, bodyDX, bodyDY);
    return c;
  }

  // assemble a horizontal strip from N frame canvases
  function strip(frames){
    const c=document.createElement("canvas"); c.width=CELL_W*frames.length; c.height=CELL_H;
    const cx=c.getContext("2d"); cx.imageSmoothingEnabled=false;
    frames.forEach((f,k)=>cx.drawImage(f,k*CELL_W,0));
    return c.toDataURL("image/png");
  }

  const TAU=Math.PI*2, R=Math.round;
  const out={};
  const previewRows=[];
  for(const cls of Object.keys(CLASSES)){
    const nat=recolor(cls); paintFace(nat);   // CAS-199: head
    const { canvas:layer, dx, dw } = toCellLayer(nat);
    paintClassCell(layer, cls);   // CAS-199: per-class clothing/accessories (bold, in cell space)
    const legTop=findLegTop(layer, dx, dw);
    const parts=split(layer, legTop);

    // IDLE: gentle breathing — torso bobs up 0..1px, feet planted, tiny cloak sway.
    const idleFrames=[];
    for(let f=0; f<IDLE_FC; f++){
      const p=f/IDLE_FC*TAU;
      const bodyDY=R(-(Math.sin(p)*0.5+0.5)*1.2);   // 0..-1.2
      const bodyDX=R(Math.sin(p)*0.6);               // ±0.6 sway
      idleFrames.push(frame(parts, bodyDX, bodyDY, 0,0, 0,0));
    }
    out["idle_"+cls]=strip(idleFrames);

    // WALK: alternating leg swing+lift + body footfall bob (2 footfalls / cycle).
    const walkFrames=[];
    for(let f=0; f<WALK_FC; f++){
      const p=f/WALK_FC*TAU;
      const bodyDY=R(-Math.abs(Math.sin(p))*3);                 // 0..-3 footfall hop (no side-sway → torso stays planted)
      const lDX=R(Math.sin(p)*4),       lDY=R(-Math.max(0,Math.sin(p))*3);
      const rDX=R(Math.sin(p+Math.PI)*4), rDY=R(-Math.max(0,Math.sin(p+Math.PI))*3);
      walkFrames.push(frame(parts, 0, bodyDY, lDX,lDY, rDX,rDY));
    }
    out["walk_"+cls]=strip(walkFrames);

    previewRows.push({cls, legTop, splitX:parts.splitX});
  }
  return { out, fw, fh, previewRows };
}, b64, { CELL_W, CELL_H, ANCHOR_X, FOOT, FIGURE_H, IDLE_FC, WALK_FC, CLASSES });

// write the strips render.js consumes: <cls>.png (idle) + <cls>_walk.png (walk)
function writeDataUrl(name, dataUrl){
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(join(OUT, name), buf);
  return buf.length;
}
let total=0;
for(const cls of Object.keys(CLASSES)){
  total += writeDataUrl(cls+".png", result.out["idle_"+cls]);
  total += writeDataUrl(cls+"_walk.png", result.out["walk_"+cls]);
}
console.log("trimmed figure:", result.fw+"x"+result.fh);
console.log("per-class leg detection:", JSON.stringify(result.previewRows));
console.log("wrote 10 strips ("+(total/1024|0)+"KB) to", OUT);

await browser.close();
