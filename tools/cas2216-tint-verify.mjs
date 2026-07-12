// CAS-2216 verify: the luminance-preserving "color" tint recolours a synthetic ORANGE
// fire strip to blue (frost) / green (nature) while a warm colour is left untinted.
// Runs the SAME blend recipe as render.js tintedFxStrip in a real chromium canvas.
import puppeteer from '/tmp/qadeps/node_modules/puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js';

const browser = await puppeteer.launch({ executablePath:'/usr/bin/chromium',
  args:['--no-sandbox','--disable-gpu'], headless:'new' });
const page = await browser.newPage();
const res = await page.evaluate(() => {
  // Build a synthetic orange fire frame: bright white-hot core + orange body (mimics fx_nova).
  const W=64,H=64; const src=document.createElement('canvas'); src.width=W; src.height=H;
  const s=src.getContext('2d');
  const g=s.createRadialGradient(W/2,H/2,2, W/2,H/2,28);
  g.addColorStop(0,'#fff3c8'); g.addColorStop(0.4,'#ff8820'); g.addColorStop(1,'rgba(255,60,10,0)');
  s.fillStyle=g; s.beginPath(); s.arc(W/2,H/2,28,0,6.28); s.fill();

  // fxTintFor (copied from render.js)
  const fxTintFor=(col)=>{ if(!col||col[0]!=='#'||col.length<7) return null;
    const r=parseInt(col.slice(1,3),16),gg=parseInt(col.slice(3,5),16),b=parseInt(col.slice(5,7),16);
    if(r>=gg&&r>=b&&(r-b)>40) return null; return col; };
  // tintedFxStrip (copied from render.js)
  const tint=(im,col)=>{ const cv=document.createElement('canvas'); cv.width=W; cv.height=H;
    const c=cv.getContext('2d'); c.imageSmoothingEnabled=false; c.drawImage(im,0,0);
    c.globalCompositeOperation='color'; c.fillStyle=col; c.fillRect(0,0,W,H);
    c.globalCompositeOperation='destination-in'; c.drawImage(im,0,0);
    c.globalCompositeOperation='source-over'; return cv; };
  const sample=(cv)=>{ const c=cv.getContext('2d'); const d=c.getImageData(W/2+10,H/2,1,1).data; return [d[0],d[1],d[2],d[3]]; };

  const out={};
  for(const [name,col] of [['frost','#7fd6ff'],['vines','#8fd47a'],['floracion','#7bd44a'],
                           ['lightning','#bfe6ff'],['fire','#ff8820'],['judgment','#ffd24d']]){
    const t=fxTintFor(col);
    const cv = t ? tint(src,t) : src;
    out[name]={ tinted:!!t, col, px:sample(cv) };
  }
  return out;
});
await browser.close();

function dominant([r,g,b]){ if(r>=g&&r>=b) return 'R'; if(g>=r&&g>=b) return 'G'; return 'B'; }
let pass=true;
const expect={frost:'B',vines:'G',floracion:'G',lightning:'B',fire:'R',judgment:'R'};
for(const [k,v] of Object.entries(res)){
  const dom=dominant(v.px); const ok=dom===expect[k];
  pass=pass&&ok;
  console.log(`${ok?'PASS':'FAIL'} ${k.padEnd(10)} tint=${v.tinted?'YES':'no '} px=[${v.px.slice(0,3)}] dominant=${dom} expect=${expect[k]}`);
}
console.log(pass?'\nALL PASS':'\nFAILURES');
process.exit(pass?0:1);
