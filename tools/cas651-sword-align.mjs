// CAS-651 / CAS-801: warrior 8-dir sword alignment measurement + before/after montage.
// Decodes the 3 warrior 8-dir strips in a real chromium canvas, measures the per-row
// alpha bbox + centroid, and checks the CAS-786 DIR8_AX anchor table against it:
//   - CLIP   = sprite alpha touches the LEFT/RIGHT edge of its source cell (sword cut off)
//   - FLOAT  = per-row anchor-x drifts from the true body/sword centroid → sprite jumps
//             sideways when you turn (the artifact the fix targets)
// Then renders a montage: OLD uniform ax=65 vs NEW per-row DIR8_AX, feet-anchored, 8 dirs.
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'fs';

const CHROME='/paperclip/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const ROOT=process.cwd();
// mirror render/render.js constants
const CLASS_FW=140, CLASS_FH=166, CLASS_AX=65, CLASS_FOOT=163, CLASS_ANIM_SCALE=0.30;
// DIR8_AX extracted live from render/render.js so the harness can never drift from the game
const DIR8_AX={};
{
  const code=readFileSync(`${process.cwd()}/render/render.js`,'utf8');
  for(const m of code.matchAll(/(cls(?:idle|walk|dash)8_warrior):\[([\d,]+)\]/g))
    DIR8_AX[m[1]]=m[2].split(',').map(Number);
  if(Object.keys(DIR8_AX).length!==3) throw new Error('failed to extract DIR8_AX from render.js');
}
// dir8FromAngle row order (render.js:183): 0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE
const DIRLBL=['E','SE','S','SW','W','NW','N','NE'];
const STRIPS=[
  {key:'clsidle8_warrior', file:'assets/erw/hero/classes/warrior_idle8.png', fc:1},
  {key:'clswalk8_warrior', file:'assets/erw/hero/classes/warrior_walk8.png', fc:8},
  {key:'clsdash8_warrior', file:'assets/erw/hero/classes/warrior_dash8.png', fc:8},
];

function b64(f){ return 'data:image/png;base64,'+readFileSync(f).toString('base64'); }

const browser=await puppeteer.launch({executablePath:CHROME, headless:'shell', args:['--no-sandbox']});
const page=await browser.newPage();
await page.setViewport({width:1400,height:900,deviceScaleFactor:1});

const payload=STRIPS.map(s=>({...s, data:b64(`${ROOT}/${s.file}`)}));

const result=await page.evaluate(async (payload, C)=>{
  const {CLASS_FW,CLASS_FH,CLASS_AX,CLASS_FOOT,CLASS_ANIM_SCALE,DIR8_AX,DIRLBL}=C;
  function loadImg(src){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src;});}
  const out={strips:[], montages:{}};

  for(const s of payload){
    const img=await loadImg(s.data);
    const rows=8, fc=s.fc;
    const fw=Math.round(img.naturalWidth/fc), fh=Math.round(img.naturalHeight/rows);
    const cv=document.createElement('canvas'); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
    const cx=cv.getContext('2d'); cx.drawImage(img,0,0);
    const strip={key:s.key, natW:img.naturalWidth, natH:img.naturalHeight, fw, fh, fc, rows, perRow:[]};
    // For each row, scan ALL frames: union bbox for clip detection, and a torso-band
    // centroid (vertical 22%..55% of cell = head+chest, above swinging legs, and the hand
    // grips the sword here) averaged across frames = stable anchor target for "body center".
    const tTop=Math.round(fh*0.22), tBot=Math.round(fh*0.55);
    for(let r=0;r<rows;r++){
      let minX=1e9,maxX=-1,minY=1e9,maxY=-1;           // union over frames (full body)
      let torsoSum=0, torsoN=0;                         // torso-band centroid accumulator
      for(let f=0; f<fc; f++){
        const sx=f*fw, sy=r*fh;
        const id=cx.getImageData(sx,sy,fw,fh).data;
        for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
          const a=id[(y*fw+x)*4+3];
          if(a>16){
            if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
            if(y>=tTop && y<tBot){ torsoSum+=x; torsoN++; }
          }
        }
      }
      const centroidX = torsoN? torsoSum/torsoN : fw/2;
      const clipLeft = minX<=0, clipRight = maxX>=fw-1;
      const ax = (DIR8_AX[s.key] && rows>1) ? DIR8_AX[s.key][r] : (fw>CLASS_FW? fw/2 : CLASS_AX);
      strip.perRow.push({
        dir:DIRLBL[r], minX, maxX, minY, maxY, centroidX:Math.round(centroidX*10)/10,
        bboxMid:Math.round((minX+maxX)/2*10)/10, ax, clipLeft, clipRight, n:torsoN
      });
    }
    out.strips.push(strip);
  }

  // build before/after montage per strip: feet-anchored composite, OLD ax vs NEW ax
  function drawMontage(strip, img, useTable){
    const cell=140, pad=6, cols=8;
    const cv=document.createElement('canvas'); cv.width=cols*(cell+pad)+pad; cv.height=cell+40;
    const g=cv.getContext('2d'); g.imageSmoothingEnabled=false;
    g.fillStyle='#1a1d29'; g.fillRect(0,0,cv.width,cv.height);
    const S=1.6; // upscale for visibility (relative scale between OLD/NEW is what matters)
    const feetY=cell-14, baseCx=cell/2;
    for(let r=0;r<8;r++){
      const ox=pad+r*(cell+pad);
      // draw source cell frame 0
      const {fw,fh}=strip;
      const ax = useTable? DIR8_AX[strip.key][r] : (fw>CLASS_FW? fw/2 : CLASS_AX);
      const foot=fh-(CLASS_FH-CLASS_FOOT);
      const dw=fw*(cell/fh)*0.9, dh=fh*(cell/fh)*0.9; // fit height into cell
      const scale=cell/fh*0.9;
      const cx0=ox+baseCx;
      const dx=cx0-ax*scale, dy=feetY-foot*scale;
      // center guide line (screen anchor) — vertical red
      g.strokeStyle='rgba(255,80,80,0.8)'; g.beginPath(); g.moveTo(cx0+0.5,0); g.lineTo(cx0+0.5,cell); g.stroke();
      g.drawImage(img, 0, r*fh, fw, fh, dx, dy, fw*scale, fh*scale);
      // feet baseline
      g.strokeStyle='rgba(120,200,120,0.6)'; g.beginPath(); g.moveTo(ox,feetY+0.5); g.lineTo(ox+cell,feetY+0.5); g.stroke();
      g.fillStyle='#cfd3e0'; g.font='12px monospace'; g.fillText(DIRLBL[r], ox+cell/2-6, cell+18);
    }
    return cv.toDataURL('image/png');
  }

  for(const s of payload){
    const img=await loadImg(s.data);
    const strip=out.strips.find(x=>x.key===s.key);
    out.montages[s.key]={ before:drawMontage(strip,img,false), after:drawMontage(strip,img,true) };
  }
  return out;
}, payload, {CLASS_FW,CLASS_FH,CLASS_AX,CLASS_FOOT,CLASS_ANIM_SCALE,DIR8_AX,DIRLBL});

// ---- report ----
let pass=true; const notes=[];
for(const strip of result.strips){
  console.log(`\n=== ${strip.key}  nat=${strip.natW}x${strip.natH}  fw=${strip.fw} fh=${strip.fh} fc=${strip.fc} ===`);
  for(const r of strip.perRow){
    const anchorErr=Math.round(Math.abs(r.ax - r.centroidX)*10)/10;
    const clip = r.clipLeft||r.clipRight;
    // FLOAT check: anchor should track the body centroid within tolerance so the sprite
    // doesn't jump sideways between directions. tol scaled to frame width.
    const tol = Math.max(14, strip.fw*0.12);
    const floatBad = anchorErr>tol;
    if(clip) { pass=false; notes.push(`${strip.key} ${r.dir}: CLIP (minX=${r.minX} maxX=${r.maxX} fw=${strip.fw})`); }
    if(floatBad){ pass=false; notes.push(`${strip.key} ${r.dir}: FLOAT ax=${r.ax} vs centroid=${r.centroidX} err=${anchorErr}>tol${Math.round(tol)}`); }
    console.log(` ${r.dir.padEnd(2)} bbox[x ${String(r.minX).padStart(3)}..${String(r.maxX).padStart(3)}] mid=${String(r.bboxMid).padStart(5)} centroid=${String(r.centroidX).padStart(5)} ax=${String(r.ax).padStart(3)} |ax-centroid|=${String(anchorErr).padStart(4)} clip=${clip?'YES':'no '} ${floatBad?'FLOAT!':''}`);
  }
}
// save montages
function saveDataUrl(name,durl){ writeFileSync(name, Buffer.from(durl.split(',')[1],'base64')); }
for(const key of Object.keys(result.montages)){
  saveDataUrl(`${ROOT}/shots/cas651-${key}-before.png`, result.montages[key].before);
  saveDataUrl(`${ROOT}/shots/cas651-${key}-after.png`, result.montages[key].after);
}
console.log('\nMontages written to shots/cas651-*-{before,after}.png');
console.log('\n'+(pass?'PASS — no clip/float across 24 direction-frames':'FAIL:\n'+notes.map(n=>' - '+n).join('\n')));
await browser.close();
process.exit(pass?0:1);
