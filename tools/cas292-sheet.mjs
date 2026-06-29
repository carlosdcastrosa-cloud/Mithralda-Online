// CAS-292 — Compose the CEO creative-sign-off sheet: per class, CURRENT (live) idle + attack
// vs PROPOSED (PixelLab-unified) idle / walk / attack / death. Proves the proposed look is ONE
// consistent character across every state (no morph) and keeps the rich animation.
//   node tools/cas292-sheet.mjs   -> writes tools/cas292-review.png
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const LIVE = join(ROOT, "assets", "erw", "hero", "classes");
const GEN  = join(ROOT, "assets", "erw", "hero", "gen", "cas292");
const b64 = p => existsSync(p) ? "data:image/png;base64,"+readFileSync(p).toString("base64") : null;

const CLASSES = ["mage","paladin","druid","priest"];
// columns: [label, file, frameCount, pickFrame]  (pickFrame: index of the frame to show, -1 = last)
const COLS = [
  { head:"CURRENT idle",  get:c=>({src:b64(join(LIVE,`${c}.png`)),        fc:6, pick:0}) },
  { head:"CURRENT attack", get:c=>({src:b64(join(LIVE,`${c}_attack.png`)), fc:6, pick:3}) },
  { head:"» NEW idle",    get:c=>({src:b64(join(GEN,`${c}_idle.png`)),    fc:6, pick:0}) },
  { head:"NEW walk",      get:c=>({src:b64(join(GEN,`${c}_walk.png`)),    fc:8, pick:4}) },
  { head:"NEW attack",    get:c=>({src:b64(join(GEN,`${c}_attack.png`)),  fc:6, pick:4}) },
  { head:"NEW death",     get:c=>({src:b64(join(GEN,`${c}_death.png`)),   fc:6, pick:5}) },
];

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const dataUrl = await page.evaluate(async (CLASSES, COLS, payload) => {
  const TH=150, CW=130, ROWH=TH+8, PADT=64, PADL=120, HEADH=26;
  const W = PADL + COLS.length*CW + 20;
  const H = PADT + CLASSES.length*ROWH + 20;
  const cv=document.createElement("canvas"); cv.width=W; cv.height=H;
  const x=cv.getContext("2d"); x.imageSmoothingEnabled=false;
  x.fillStyle="#23252b"; x.fillRect(0,0,W,H);
  x.fillStyle="#e8e8ec"; x.font="bold 20px sans-serif";
  x.fillText("CAS-292 — proposed canonical class look (PixelLab-unified): same character idle→walk→attack→death", 16, 30);
  x.font="bold 12px sans-serif"; x.fillStyle="#9fb0c8";
  x.fillText("CURRENT = live (morphs on attack)        NEW = one PixelLab character per class, all states", 16, 50);
  // column heads
  x.font="bold 12px sans-serif";
  for(let c=0;c<COLS.length;c++){ x.fillStyle = COLS[c].head.startsWith("»")||COLS[c].head.startsWith("NEW")?"#8fe0a0":"#d8a0a0";
    x.fillText(COLS[c].head.replace("» ",""), PADL+c*CW+6, PADT-10); }
  // separator after current
  x.strokeStyle="#444"; x.beginPath(); x.moveTo(PADL+2*CW+2, PADT-24); x.lineTo(PADL+2*CW+2, H-10); x.stroke();
  const load=du=>new Promise(r=>{const im=new Image();im.onload=()=>r(im);im.onerror=()=>r(null);im.src=du;});
  for(let r=0;r<CLASSES.length;r++){
    const cls=CLASSES[r]; const y=PADT+r*ROWH;
    x.fillStyle="#cfd6e2"; x.font="bold 14px sans-serif"; x.fillText(cls.toUpperCase(), 16, y+TH/2);
    for(let c=0;c<COLS.length;c++){
      const cell=payload[r][c]; const cx=PADL+c*CW;
      x.fillStyle="#2c2f37"; x.fillRect(cx, y, CW-8, TH);
      if(!cell||!cell.src){ x.fillStyle="#666"; x.font="11px sans-serif"; x.fillText("(pending)", cx+30, y+TH/2); continue; }
      const im=await load(cell.src); if(!im) continue;
      const fw=im.naturalWidth/cell.fc, fh=im.naturalHeight;
      const f=Math.max(0,Math.min(cell.fc-1, cell.pick));
      const sc=Math.min((CW-16)/fw, (TH-12)/fh);
      const dw=fw*sc, dh=fh*sc;
      x.drawImage(im, f*fw, 0, fw, fh, cx+(CW-8-dw)/2, y+TH-dh-4, dw, dh);
    }
  }
  return cv.toDataURL("image/png");
}, CLASSES, COLS, CLASSES.map(c=>COLS.map(col=>col.get(c))));

writeFileSync(join(ROOT,"tools","cas292-review.png"), Buffer.from(dataUrl.split(",")[1],"base64"));
console.log("wrote tools/cas292-review.png");
await browser.close();
