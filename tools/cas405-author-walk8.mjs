// CAS-405 (CAS-344 Fase 2) — HAND-AUTHOR the warrior WALK in 8 directions from the
// canonical straw-hat Clarice walk cycle (warrior_walk.png, 8 frames 140x166).
// EXACT CAS-400 method: NO generative model — hat/cloak/palette copied pixel-for-pixel;
// direction = under-brim head-band slide + torch relocation; N = back view (no face,
// grey nape); 5 unique facings (S,SE,E,NE,N), SW/W/NW = hflip of SE/E/NE.
//
// Difference vs the idle pass: the walk cycle has a baked gait bob (head band moves up
// to 21px between frames), so the HEAD/TORCH regions are detected PER FRAME by color
// (grey hair / orange flame) and the rects are derived with the SAME offsets that
// reproduce the CAS-400 idle rects on the idle source (verified: hair bbox+(-2,-2,+2,0)
// = HEAD x66-106,y65-93; flame bbox+(-12,-12,+13,+6) = TORCH x8-58,y124-163).
//   node tools/cas405-author-walk8.mjs
import {load,frame,clone,get,set,img,hflip,scale,save} from './cas400-lib.mjs';
import fs from 'node:fs';

const FW=140, FH=166, NF=8;               // canonical walk strip = 8 frames 140x166
const src=load('assets/erw/hero/classes/warrior_walk.png');
const baseFrames=[]; for(let i=0;i<NF;i++) baseFrames.push(frame(src,i*FW,FW));

// ---- canonical palette samples (identical to CAS-400) ----
const SHADOW=[46,34,47,255];              // under-brim / face shadow (also cloak)
const HAIR=[169,178,162,255];             // grey hair
const DHAIR=[Math.round(HAIR[0]*0.72),Math.round(HAIR[1]*0.72),Math.round(HAIR[2]*0.72),255];

// ---- per-frame feature detection (color-anchored, same rect offsets as CAS-400) ----
const isHair=p=>p[3]>20&&Math.abs(p[0]-HAIR[0])<30&&Math.abs(p[1]-HAIR[1])<30&&Math.abs(p[2]-HAIR[2])<30;
const isFlame=p=>p[3]>20&&p[0]>200&&p[1]>110&&p[2]<120;
const isGlow=p=>p[3]>20&&p[0]>200&&p[1]>170&&p[2]>=120&&p[2]<190;   // torch glow halo (only used for stragglers)
function featBbox(im,pred){let x0=999,y0=999,x1=-1,y1=-1;for(let y=0;y<im.H;y++)for(let x=0;x<im.W;x++){if(pred(get(im,x,y))){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}return{x0,y0,x1,y1};}
function regionsOf(im){
  const h=featBbox(im,isHair), f=featBbox(im,isFlame);
  return {
    HEAD:{x0:h.x0-2,y0:h.y0-2,x1:h.x1+2,y1:h.y1},
    TORCH:{x0:f.x0-12,y0:f.y0-12,x1:Math.min(f.x1+13,FW-1),y1:Math.min(f.y1+6,FH-1)},
  };
}
const REG=baseFrames.map(regionsOf);

function lift(im,r){const cells=[];for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++){const p=get(im,x,y);if(p[3]>20)cells.push({x,y,p});}return cells;}
function fillRect(im,r,col){for(let y=r.y0;y<=r.y1;y++)for(let x=r.x0;x<=r.x1;x++){const p=get(im,x,y);if(p[3]>20)set(im,x,y,col);}}
function paste(im,cells,dx,dy,dim){for(const c of cells){const p=c.p;const q=dim?[Math.round(p[0]*dim),Math.round(p[1]*dim),Math.round(p[2]*dim),p[3]]:p;set(im,c.x+dx,c.y+dy,q);}}

// Build one facing of one frame. spec = {head:dx, back:bool, torch:{dx,dy,dim}}
function facing(base, R, spec){
  const im=clone(base);
  const HEAD=R.HEAD;
  if(spec.back){
    // BACK OF HEAD: no face, no mark. Upper band = hat/head shadow, lower = grey nape.
    // Same proportions as the idle pass (band h=29: hair from +17, dark hair from +23).
    const h=HEAD.y1-HEAD.y0+1, hs=HEAD.y0+Math.round(17/29*h), ds=HEAD.y0+Math.round(23/29*h);
    for(let y=HEAD.y0;y<=HEAD.y1;y++)for(let x=HEAD.x0;x<=HEAD.x1;x++){const p=get(base,x,y);if(p[3]<=20)continue;
      set(im,x,y, y>=hs ? (y>=ds?DHAIR:HAIR) : SHADOW);}
  } else if(spec.head){
    const hd=lift(base, HEAD);
    fillRect(im, HEAD, SHADOW);
    paste(im, hd, spec.head, 0);
    const dir=Math.sign(spec.head);
    for(let y=HEAD.y0+2;y<=HEAD.y1-2;y++)for(let k=0;k<Math.abs(spec.head);k++){
      const x = dir>0 ? HEAD.x0+k : HEAD.x1-k; const p=get(im,x,y); if(p[3]>20) set(im,x,y,HAIR);
    }
  }
  // --- TORCH: fixed SPEC translation (preserves the baked flame flicker + gait bob),
  //     dx clamped so the widest per-frame flame never clips the frame edge.
  //     The pale-yellow GLOW halo can poke outside the flame-anchored rect on the
  //     crouch frames (F4: glow at x1-4) — lift+erase those stragglers too, or they
  //     stay behind as a floating blob when the torch relocates. ---
  const tc=lift(base, R.TORCH);
  fillRect(im, R.TORCH, [0,0,0,0]);
  for(let y=0;y<base.H;y++)for(let x=0;x<base.W;x++){
    if(x>=R.TORCH.x0&&x<=R.TORCH.x1&&y>=R.TORCH.y0&&y<=R.TORCH.y1)continue;
    const p=get(base,x,y);
    if(isGlow(p)){tc.push({x,y,p});set(im,x,y,[0,0,0,0]);}
  }
  if(!spec.torch.hide){
    const dx=Math.min(spec.torch.dx||0, FW-1-R.TORCH.x1);
    paste(im, tc, dx, spec.torch.dy||0, spec.torch.dim);
  }
  return im;
}

// same direction language as CAS-400 (head dx>0 = face turns toward east)
const SPEC={
  S:  {head:0,             torch:{dx:0,  dy:0}},
  SE: {head:6,             torch:{dx:16, dy:-1}},
  E:  {head:12,            torch:{dx:80, dy:-2}},
  NE: {head:9,             torch:{dx:74, dy:-8, dim:0.85}},
  N:  {back:true,          torch:{dx:20, dy:-2, dim:0.5}},
};
const DIRS=["south","south-east","east","north-east","north","north-west","west","south-west"];
const UNIQUE={south:"S","south-east":"SE",east:"E","north-east":"NE",north:"N"};
const MIRROR={"north-west":"north-east","west":"east","south-west":"south-east"};

function buildDirFrames(dirName){
  if(UNIQUE[dirName]){const s=SPEC[UNIQUE[dirName]];return baseFrames.map((bf,i)=>facing(bf,REG[i],s));}
  const s=SPEC[UNIQUE[MIRROR[dirName]]];return baseFrames.map((bf,i)=>hflip(facing(bf,REG[i],s)));
}

const OUT='assets/erw/hero/gen/cas405'; fs.mkdirSync(OUT,{recursive:true});

// (1) per-direction animated 8-frame strips (full canonical walk cycle)
const dirFrames={};
for(const d of DIRS){
  const fr=buildDirFrames(d); dirFrames[d]=fr;
  const strip=img(FW*NF, FH);
  fr.forEach((f,i)=>{for(let y=0;y<FH;y++)for(let x=0;x<FW;x++)set(strip,i*FW+x,y,get(f,x,y));});
  save(strip, `${OUT}/warrior_walk_${d}.png`);
}
// (2) walk8 grid (1120x1328): row per direction (DIRS order), 8 canonical cycle frames per row.
//     Render-ready layout, NOT wired this phase.
const walk8=img(FW*NF, FH*8);
DIRS.forEach((d,r)=>{dirFrames[d].forEach((f,i)=>{for(let y=0;y<FH;y++)for(let x=0;x<FW;x++)set(walk8,i*FW+x,r*FH+y,get(f,x,y));});});
save(walk8, `${OUT}/warrior_walk8.png`);

// (3) identity montage: the 8 facings side by side on a mid-stride frame (F2), crop+2x
const MF=2;
const tiles=DIRS.map(d=>{const f=dirFrames[d][MF];const bb={x0:6,y0:26,x1:133,y1:164};const w=bb.x1-bb.x0+1,h=bb.y1-bb.y0+1;const t=img(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)set(t,x,y,get(f,bb.x0+x,bb.y0+y));return t;});
const gap=6, tw=tiles[0].W, th=tiles[0].H;
const mont=img(tw*8+gap*9, th+gap*2);
for(let i=0;i<mont.W*mont.H;i++){mont.d[i*4]=24;mont.d[i*4+1]=26;mont.d[i*4+2]=32;mont.d[i*4+3]=255;}
tiles.forEach((tl,i)=>{const ox=gap+(tw+gap)*i, oy=gap;for(let y=0;y<th;y++)for(let x=0;x<tw;x++){const p=get(tl,x,y);if(p[3]>20)set(mont,ox+x,oy+y,p);}});
save(scale(mont,2), `${OUT}/warrior_walk8_montage.png`);

// (4) no-morph proof table: per direction, byte-diff vs canonical walk frames by band.
//     Mirrored dirs compare against the hflipped canonical frame. Bands are per-frame:
//     hat = rows above the detected HEAD band (the dominant silhouette — must be 0).
function diffBand(a,b,x0,y0,x1,y1){let n=0;for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const p=get(a,x,y),q=get(b,x,y);if(p[0]!==q[0]||p[1]!==q[1]||p[2]!==q[2]||p[3]!==q[3])n++;}return n;}
console.log('dir          hat(above head band)  head-band  below(cloak+torch)');
for(const d of DIRS){
  const mirrored=!!MIRROR[d];
  let hat=0,head=0,below=0;
  dirFrames[d].forEach((f,i)=>{
    const ref=mirrored?hflip(baseFrames[i]):baseFrames[i];
    const R=REG[i];
    const H=mirrored?{x0:FW-1-R.HEAD.x1,x1:FW-1-R.HEAD.x0,y0:R.HEAD.y0,y1:R.HEAD.y1}:R.HEAD;
    hat+=diffBand(f,ref,0,0,FW-1,H.y0-1);
    head+=diffBand(f,ref,0,H.y0,FW-1,H.y1);
    below+=diffBand(f,ref,0,H.y1+1,FW-1,FH-1);
  });
  console.log(d.padEnd(12), String(hat).padStart(8), String(head).padStart(12), String(below).padStart(12));
}
console.log('✓ wrote 8 per-dir strips + warrior_walk8.png (1120x1328) + montage to '+OUT);
