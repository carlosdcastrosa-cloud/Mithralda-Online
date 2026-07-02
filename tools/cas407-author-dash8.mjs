// CAS-407 (CAS-344 Fase 3) — HAND-AUTHOR the warrior DASH (dodge-roll) in 8 directions
// from the canonical straw-hat Clarice dash strip (warrior_dash.png, 8 frames 400x167,
// wide cells for the dash-VFX trail — CAS-326). EXACT CAS-400/405 method: NO generative
// model — hat/cloak/palette copied pixel-for-pixel; direction = under-brim head-band
// slide + torch relocation; N = back view (grey nape, no face); 5 unique facings
// (S,SE,E,NE,N), SW/W/NW = hflip of SE/E/NE.
//
// Dash-specific anatomy (vs idle/walk):
//   F0-F1 = flash burst, F2-F3 = speed streak — PURE VFX, zero anatomy pixels
//   (verified: 0 hair-colored px). Copied unchanged into every facing (hflip on
//   mirror rows). No rotation/resample: a vertical streak can't fit the 167px cell
//   and the burst is omnidirectional anyway.
//   F4-F7 = Clarice re-materializing crouched->standing. Head band is WIDE (the
//   crouch smears hair+face across ~90px) and the torch flame is a free-floating
//   blob LEFT of the body inside a field of same-colored spark VFX, so:
//     * HEAD = hair-colored bbox + CAS-400 offsets (-2,-2,+2,0) — the whole band
//       (incl. the motion-whip left segment) slides as one unit.
//     * TORCH = flame/glow connected component(s) with bbox.x1 <= 140 (left of the
//       body, excludes the spark cloud). Lift is COLOR-KEYED (flame/glow px only,
//       not a rect), so zero anatomy pixels ever move -> cloak/arm byte-intact.
//     * E/NE torch dx = per-frame mirror about the hat centroid (2*(hatCx-flameCx)),
//       preserving the baked "torch approaches the body as she stands" motion.
//   node tools/cas407-author-dash8.mjs
import {load,frame,clone,get,set,img,hflip,scale,save} from './cas400-lib.mjs';
import fs from 'node:fs';

const FW=400, FH=167, NF=8;               // canonical dash strip = 8 frames 400x167
const src=load('assets/erw/hero/classes/warrior_dash.png');
const baseFrames=[]; for(let i=0;i<NF;i++) baseFrames.push(frame(src,i*FW,FW));

// ---- canonical palette samples (identical to CAS-400/405) ----
const SHADOW=[46,34,47,255];              // under-brim / face shadow (also cloak)
const HAIR=[169,178,162,255];             // grey hair
const DHAIR=[Math.round(HAIR[0]*0.72),Math.round(HAIR[1]*0.72),Math.round(HAIR[2]*0.72),255];

const isHair=p=>p[3]>20&&Math.abs(p[0]-HAIR[0])<30&&Math.abs(p[1]-HAIR[1])<30&&Math.abs(p[2]-HAIR[2])<30;
// dash flame family includes the dark-orange base [205,104,61] (g just under the
// idle/walk 110 cut) — widen g to >=100; still excludes maroon/hat/face (r<195).
const isFlame=p=>p[3]>20&&p[0]>195&&p[1]>=100&&p[2]<130;
const isGlow=p=>p[3]>20&&p[0]>200&&p[1]>170&&p[2]>=120&&p[2]<190;
const isTorchCol=p=>isFlame(p)||isGlow(p);
const isAnat=p=>p[3]>20&&!isTorchCol(p);

// flame/glow 8-connected components; torch = substantial comps whose centroid sits
// left of the body (hatCx-25) — the merged flame+base blob can reach x~168, while the
// spark-cloud comps all live right of the body and the stray near-hat embers are tiny.
function torchCells(im,hcx){
  const seen=new Set(); const torch=[];
  for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){
    const k=y*FW+x; if(seen.has(k)||!isTorchCol(get(im,x,y)))continue;
    const st=[k]; seen.add(k); const cells=[]; let sx=0;
    while(st.length){const q=st.pop(); const qy=(q/FW)|0,qx=q%FW;
      cells.push({x:qx,y:qy,p:get(im,qx,qy)}); sx+=qx;
      for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const nx=qx+dx,ny=qy+dy;if(nx<0||ny<0||nx>=FW||ny>=FH)continue;const nk=ny*FW+nx;
        if(!seen.has(nk)&&isTorchCol(get(im,nx,ny))){seen.add(nk);st.push(nk);}}}
    if(cells.length>=40 && sx/cells.length < hcx-25) torch.push(...cells);
  }
  return torch;
}
function featBbox(im,pred){let x0=999,y0=999,x1=-1,y1=-1;for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){if(pred(get(im,x,y))){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}return{x0,y0,x1,y1};}
function hatCx(im){ // anatomy centroid of the top 14 anatomy rows = hat apex center
  let top=999;for(let y=0;y<FH&&top===999;y++)for(let x=0;x<FW;x++)if(isAnat(get(im,x,y))){top=y;break;}
  let sx=0,n=0;for(let y=top;y<top+14;y++)for(let x=0;x<FW;x++)if(isAnat(get(im,x,y))){sx+=x;n++;}
  return Math.round(sx/n);
}
// per-frame regions: VFX frames (no hair) get null
const REG=baseFrames.map(bf=>{
  const h=featBbox(bf,isHair);
  if(h.x1<0) return null;                                   // F0-F3: pure VFX
  const hcx=hatCx(bf);
  const tc=torchCells(bf,hcx);
  let fx=0; for(const c of tc) fx+=c.x; fx=tc.length?Math.round(fx/tc.length):0;
  return {HEAD:{x0:h.x0-2,y0:h.y0-2,x1:h.x1+2,y1:h.y1}, torch:tc, flameCx:fx, hatCx:hcx};
});

function lift(im,r){const cells=[];for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++){const p=get(im,x,y);if(p[3]>20)cells.push({x,y,p});}return cells;}
function fillRect(im,r,col){for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++){const p=get(im,x,y);if(p[3]>20)set(im,x,y,col);}}
function paste(im,cells,dx,dy,dim){for(const c of cells){const p=c.p;const q=dim?[Math.round(p[0]*dim),Math.round(p[1]*dim),Math.round(p[2]*dim),p[3]]:p;set(im,c.x+dx,c.y+dy,q);}}

// Build one facing of one frame. spec={head:dx, back:bool, torch:{mode,dx,dy,dim}}
// torch.mode: 'keep' | 'shift' (fixed dx) | 'mirror' (per-frame 2*(hatCx-flameCx)+dx trim)
function facing(base,R,spec){
  const im=clone(base);
  if(!R) return im;                                          // VFX frame: canonical, untouched
  const HEAD=R.HEAD;
  if(spec.back){
    // BACK OF HEAD: no face, no mark. Same proportional split as CAS-400/405
    // (band h=29: hair from +17, dark hair from +23).
    const h=HEAD.y1-HEAD.y0+1, hs=HEAD.y0+Math.round(17/29*h), ds=HEAD.y0+Math.round(23/29*h);
    for(let y=HEAD.y0;y<=HEAD.y1;y++)for(let x=HEAD.x0;x<=HEAD.x1;x++){const p=get(base,x,y);if(p[3]<=20)continue;
      set(im,x,y, y>=hs ? (y>=ds?DHAIR:HAIR) : SHADOW);}
  } else if(spec.head){
    const hd=lift(base,HEAD);
    fillRect(im,HEAD,SHADOW);
    paste(im,hd,spec.head,0);
    const dir=Math.sign(spec.head);
    for(let y=HEAD.y0+2;y<=HEAD.y1-2;y++)for(let k=0;k<Math.abs(spec.head);k++){
      const x = dir>0 ? HEAD.x0+k : HEAD.x1-k; const p=get(im,x,y); if(p[3]>20) set(im,x,y,HAIR);
    }
  }
  // --- TORCH: color-keyed component lift (flame+glow px only — anatomy never moves) ---
  const t=spec.torch||{mode:'keep'};
  if(t.mode!=='keep' && R.torch.length){
    for(const c of R.torch) set(im,c.x,c.y,[0,0,0,0]);
    let dx = t.mode==='mirror' ? 2*(R.hatCx-R.flameCx)+(t.dx||0) : (t.dx||0);
    dx=Math.min(dx, FW-1-Math.max(...R.torch.map(c=>c.x)));   // never clip the cell edge
    paste(im,R.torch,dx,t.dy||0,t.dim);
  }
  return im;
}

// same direction language as CAS-400/405 (head dx>0 = face turns toward east)
const SPEC={
  S:  {head:0,        torch:{mode:'keep'}},
  SE: {head:6,        torch:{mode:'shift', dx:16, dy:-1}},
  E:  {head:12,       torch:{mode:'mirror', dx:0,  dy:0}},
  NE: {head:9,        torch:{mode:'mirror', dx:-10, dy:-8, dim:0.85}},
  N:  {back:true,     torch:{mode:'shift', dx:20, dy:-4, dim:0.5}},
};
const DIRS=["south","south-east","east","north-east","north","north-west","west","south-west"];
const UNIQUE={south:"S","south-east":"SE",east:"E","north-east":"NE",north:"N"};
const MIRROR={"north-west":"north-east","west":"east","south-west":"south-east"};

function buildDirFrames(dirName){
  if(UNIQUE[dirName]){const s=SPEC[UNIQUE[dirName]];return baseFrames.map((bf,i)=>facing(bf,REG[i],s));}
  const s=SPEC[UNIQUE[MIRROR[dirName]]];return baseFrames.map((bf,i)=>hflip(facing(bf,REG[i],s)));
}

const OUT='assets/erw/hero/gen/cas407'; fs.mkdirSync(OUT,{recursive:true});

// (1) per-direction animated 8-frame strips (full canonical dash cycle, 3200x167)
const dirFrames={};
for(const d of DIRS){
  const fr=buildDirFrames(d); dirFrames[d]=fr;
  const strip=img(FW*NF, FH);
  fr.forEach((f,i)=>{for(let y=0;y<FH;y++)for(let x=0;x<FW;x++)set(strip,i*FW+x,y,get(f,x,y));});
  save(strip, `${OUT}/warrior_dash_${d}.png`);
}
// (2) dash8 grid (3200x1336): row per direction (DIRS order = dir8FromAngle rows),
//     8 canonical cycle frames per row. Render-ready layout (fw=naturalWidth/fc,
//     fh=naturalHeight/rows are derived, no hard-coded 140), NOT wired this phase.
const dash8=img(FW*NF, FH*8);
DIRS.forEach((d,r)=>{dirFrames[d].forEach((f,i)=>{for(let y=0;y<FH;y++)for(let x=0;x<FW;x++)set(dash8,i*FW+x,r*FH+y,get(f,x,y));});});
save(dash8, `${OUT}/warrior_dash8.png`);

// (3) identity montage: the 8 facings side by side on the settle frame (F7), crop+2x
const MF=7;
const tiles=DIRS.map(d=>{const f=dirFrames[d][MF];const bb={x0:60,y0:30,x1:339,y1:166};const w=bb.x1-bb.x0+1,h=bb.y1-bb.y0+1;const t=img(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)set(t,x,y,get(f,bb.x0+x,bb.y0+y));return t;});
const gap=6, tw=tiles[0].W, th=tiles[0].H;
const mont=img((tw+gap)*4+gap, (th+gap)*2+gap);
for(let i=0;i<mont.W*mont.H;i++){mont.d[i*4]=24;mont.d[i*4+1]=26;mont.d[i*4+2]=32;mont.d[i*4+3]=255;}
tiles.forEach((tl,i)=>{const ox=gap+(tw+gap)*(i%4), oy=gap+(th+gap)*((i/4)|0);for(let y=0;y<th;y++)for(let x=0;x<tw;x++){const p=get(tl,x,y);if(p[3]>20)set(mont,ox+x,oy+y,p);}});
save(scale(mont,2), `${OUT}/warrior_dash8_montage.png`);

// (4) no-morph proof table — MASK-BASED (stronger than the CAS-405 row bands, which
//     don't fit the dash: F6's crouched head band sits BELOW the torch rows, so honest
//     torch writes would land "above the band"). Per direction, every diff vs the
//     canonical frame must fall inside the authorized op footprints:
//       head-op  = HEAD rect (band slide / back-view fill)
//       torch-op = torch source cells ∪ torch dest cells (color-keyed lift+paste)
//     outside(hat+cloak+sparks+VFX) MUST be 0. Mirrored dirs compare vs the hflipped
//     canonical frame with mirrored masks. VFX frames (REG=null): whole frame outside.
function torchDx(R,t){if(t.mode==='keep'||!R.torch.length)return null;
  let dx=t.mode==='mirror'?2*(R.hatCx-R.flameCx)+(t.dx||0):(t.dx||0);
  return Math.min(dx, FW-1-Math.max(...R.torch.map(c=>c.x)));}
console.log('dir          outside-ops(MUST 0)  head-op  torch-op');
for(const d of DIRS){
  const mirrored=!!MIRROR[d];
  const s=SPEC[UNIQUE[d]||UNIQUE[MIRROR[d]]];
  let out=0,head=0,torch=0;
  dirFrames[d].forEach((f,i)=>{
    const ref=mirrored?hflip(baseFrames[i]):baseFrames[i];
    const R=REG[i];
    const mask=new Uint8Array(FW*FH);                       // 0=outside 1=head 2=torch
    if(R){
      const mx=x=>mirrored?FW-1-x:x;
      const hdx=s.head||0;                                  // head dest spill: rect ∪ rect+dx
      for(let y=R.HEAD.y0;y<=R.HEAD.y1;y++)for(let x=R.HEAD.x0+Math.min(0,hdx);x<=R.HEAD.x1+Math.max(0,hdx);x++)mask[y*FW+mx(x)]=1;
      const dx=torchDx(R,s.torch), dy=s.torch.dy||0;
      if(dx!==null)for(const c of R.torch){mask[c.y*FW+mx(c.x)]=2;
        const nx=c.x+dx,ny=c.y+dy;if(nx>=0&&ny>=0&&nx<FW&&ny<FH&&mask[ny*FW+mx(nx)]!==1)mask[ny*FW+mx(nx)]=2;}
    }
    for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){
      const p=get(f,x,y),q=get(ref,x,y);
      if(p[0]===q[0]&&p[1]===q[1]&&p[2]===q[2]&&p[3]===q[3])continue;
      const m=mask[y*FW+x]; if(m===1)head++;else if(m===2)torch++;else out++;
    }
  });
  console.log(d.padEnd(12), String(out).padStart(8), String(head).padStart(12), String(torch).padStart(12));
}
console.log('✓ wrote 8 per-dir strips + warrior_dash8.png (3200x1336) + montage to '+OUT);
