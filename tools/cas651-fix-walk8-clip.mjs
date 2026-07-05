// CAS-651: un-clip the warrior's flaming sword in idle8/walk8 lateral rows.
// The redesigned grids (CAS-470, upload c7dca66) bake the sword flame flush against the
// 140px cell edge on the 6 lateral-ish rows (E/SE/NE right edge, SW/W/NW left edge) — the
// tip was truncated at bake. Repair: widen every cell 140→164 (+PAD each side, all original
// pixels preserved, re-centered), then continue the flame past the old boundary with a
// circular-taper extension sampled from the cut cross-section (keeps the dither/ramp), so
// the tip ends naturally with margin inside the new cell. dash8 (400px cells) has no clip.
// DIR8_AX for idle8/walk8 must then shift +PAD (done by this script in render/render.js).
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'fs';

const CHROME='/paperclip/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome';
const ROOT=process.cwd();
const PAD=12, EXT=8, A_THRESH=16;
const STRIPS=[
  {file:'assets/erw/hero/classes/warrior_idle8.png', fc:1, key:'clsidle8_warrior'},
  {file:'assets/erw/hero/classes/warrior_walk8.png', fc:8, key:'clswalk8_warrior'},
];

const browser=await puppeteer.launch({executablePath:CHROME,headless:'shell',args:['--no-sandbox']});
const page=await browser.newPage();

for(const s of STRIPS){
  const b=readFileSync(`${ROOT}/${s.file}`).toString('base64');
  const out=await page.evaluate(async(data,fc,PAD,EXT,A_THRESH)=>{
    const im=new Image(); await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src='data:image/png;base64,'+data;});
    const rows=8, fw=Math.round(im.naturalWidth/fc), fh=Math.round(im.naturalHeight/rows);
    const src=document.createElement('canvas'); src.width=im.naturalWidth; src.height=im.naturalHeight;
    const sg=src.getContext('2d',{willReadFrequently:true}); sg.drawImage(im,0,0);
    const fw2=fw+2*PAD;
    const dst=document.createElement('canvas'); dst.width=fw2*fc; dst.height=fh*rows;
    const dg=dst.getContext('2d',{willReadFrequently:true}); dg.imageSmoothingEnabled=false;
    const exts=[];
    for(let row=0;row<rows;row++){
      for(let f=0;f<fc;f++){
        // re-center original cell into the padded cell
        dg.drawImage(src, f*fw, row*fh, fw, fh, f*fw2+PAD, row*fh, fw, fh);
        const sid=sg.getImageData(f*fw,row*fh,fw,fh).data;
        const A=(x,y)=>sid[(y*fw+x)*4+3];
        for(const side of ['L','R']){
          const ex = side==='L'?0:fw-1;
          let y0=-1,y1=-1;
          for(let y=0;y<fh;y++){ if(A(ex,y)>A_THRESH){ if(y0<0)y0=y; y1=y; } }
          if(y0<0) continue;
          const runH=y1-y0+1, cy=(y0+y1)/2;
          // continue the flame outward: at depth k (1..EXT) keep a band that shrinks with a
          // circular profile, colours sampled from the cut cross-section at clamped y (keeps
          // the yellow/orange ramp). Hard pixels, no feather (pixel-art).
          const id=dg.getImageData(f*fw2, row*fh, fw2, fh);
          const dd=id.data;
          for(let k=1;k<=EXT;k++){
            const t=k/EXT;
            const half=(runH/2)*Math.sqrt(Math.max(0,1-t*t)); // quarter-circle tip
            const x = side==='L'? PAD+ex-k : PAD+ex+k;
            for(let y=y0;y<=y1;y++){
              if(Math.abs(y-cy)>half) continue;
              // sample source colour at the edge column, biased 1px inward for stabler colour
              const sxx = side==='L'? Math.min(fw-1,ex+1) : Math.max(0,ex-1);
              const si=(y*fw+sxx)*4;
              if(sid[si+3]<=A_THRESH) continue;
              const di=(y*fw2+x)*4;
              dd[di]=sid[si]; dd[di+1]=sid[si+1]; dd[di+2]=sid[si+2]; dd[di+3]=255;
            }
          }
          dg.putImageData(id, f*fw2, row*fh);
          exts.push({row,f,side,runH});
        }
      }
    }
    return { durl:dst.toDataURL('image/png'), exts, fw, fw2, fh };
  },b,s.fc,PAD,EXT,A_THRESH);
  writeFileSync(`${ROOT}/${s.file}`, Buffer.from(out.durl.split(',')[1],'base64'));
  const DIRLBL=['E','SE','S','SW','W','NW','N','NE'];
  console.log(`${s.file}: cells ${out.fw}→${out.fw2}px, ${out.exts.length} flame-tip extensions:`);
  const byRow={}; for(const e of out.exts){ const k=DIRLBL[e.row]+' '+(e.side==='L'?'left':'right'); byRow[k]=(byRow[k]||0)+1; }
  for(const k of Object.keys(byRow)) console.log(`  ${k}: ${byRow[k]} frames (run≈${out.exts.find(e=>DIRLBL[e.row]+' '+(e.side==='L'?'left':'right')===k).runH}px)`);
}
await browser.close();

// shift DIR8_AX idle8/walk8 by +PAD in render/render.js
const rj=`${ROOT}/render/render.js`;
let code=readFileSync(rj,'utf8');
const before=code;
code=code.replace(/(clsidle8_warrior:\[)([\d,]+)(\])/, (m,a,nums,c)=>a+nums.split(',').map(n=>+n+PAD).join(',')+c);
code=code.replace(/(clswalk8_warrior:\[)([\d,]+)(\])/, (m,a,nums,c)=>a+nums.split(',').map(n=>+n+PAD).join(',')+c);
if(code===before) throw new Error('DIR8_AX patch did not apply');
writeFileSync(rj,code);
console.log('render.js DIR8_AX idle8/walk8 shifted +'+PAD);
