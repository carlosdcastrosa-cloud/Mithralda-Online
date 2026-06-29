// CAS-283 montage — composite the 8 re-baked wide strips onto a dark game-like bg with a
// cell-edge guide so a human can see the full attack/death FX sits inside the cell.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(ROOT, "assets", "erw", "hero", "classes");
const ROWS = [];
for (const c of ["druid","mage","paladin","priest"]) for (const st of ["_attack","_death"]) ROWS.push(c+st);
const b64 = {}; for (const k of ROWS) b64[k] = readFileSync(join(DIR, k+".png")).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const dataUrl = await page.evaluate(async (b64, ROWS) => {
  const FC=6, GAP=4, LABELW=92, scale=0.9;
  const imgs={}; let cellW=0;
  for(const k of ROWS){ const im=new Image(); im.src="data:image/png;base64,"+b64[k]; await im.decode(); imgs[k]=im; cellW=Math.max(cellW, im.naturalWidth/FC); }
  const rowH=Math.max(...ROWS.map(k=>imgs[k].naturalHeight));
  const colW=cellW*scale, rh=rowH*scale;
  const W=LABELW + FC*(colW+GAP), H=ROWS.length*(rh+GAP)+GAP;
  const cv=document.createElement("canvas"); cv.width=Math.ceil(W); cv.height=Math.ceil(H);
  const cx=cv.getContext("2d"); cx.imageSmoothingEnabled=false;
  cx.fillStyle="#14171c"; cx.fillRect(0,0,cv.width,cv.height);
  cx.font="12px monospace";
  ROWS.forEach((k,ri)=>{
    const im=imgs[k]; const fw=im.naturalWidth/FC, fh=im.naturalHeight;
    const y=GAP+ri*(rh+GAP);
    cx.fillStyle="#cdd3da"; cx.fillText(k, 4, y+rh/2);
    for(let f=0;f<FC;f++){ const x=LABELW+f*(colW+GAP);
      cx.fillStyle="#1c2128"; cx.fillRect(x,y,colW,rh);
      cx.strokeStyle="#2c333d"; cx.strokeRect(x+0.5,y+0.5,colW-1,rh-1);
      cx.drawImage(im, f*fw,0,fw,fh, x,y,colW,rh);
    }
  });
  return cv.toDataURL("image/png");
}, b64, ROWS);
await browser.close();
const outPath = join(ROOT, "tools", "cas283-montage.png");
writeFileSync(outPath, Buffer.from(dataUrl.split(",")[1], "base64"));
console.log("wrote", outPath);
