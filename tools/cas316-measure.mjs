// CAS-316 — measure the interior content geometry of each CAS-286 PixelLab HUD
// panel so the live HUD can overlay dynamic content INSIDE the baked frame at any
// scale (background-size:100% 100% maps source px → fractional box coords 1:1).
// Uses chromium canvas to read pixels (no PIL/sharp in this env).
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./harness.mjs";

const DIR = join(ROOT, "assets/pixellab/ui/cas286");
const PANELS = ["hud_statframe.png","hud_paperdoll.png","hud_backpack_grid.png","hud_console.png","hud_minimap_frame.png"];

const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
const pg = await b.newPage();
await pg.setContent("<canvas id=c></canvas>");

for (const name of PANELS) {
  const dataUrl = "data:image/png;base64," + readFileSync(join(DIR, name)).toString("base64");
  const r = await pg.evaluate(async (du) => {
    const img = new Image(); img.src = du; await img.decode();
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.getElementById("c"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const at = (x,y)=>{ const i=(y*W+x)*4; return [d[i],d[i+1],d[i+2],d[i+3]]; };
    const lum = (p)=> 0.299*p[0]+0.587*p[1]+0.114*p[2];
    // "interior" = dark, opaque pixels (the playable/content well behind the frame)
    const isWell = (p)=> p[3]>200 && lum(p)<40;
    // bounding box of the largest dark region: scan center cross to be robust
    let minX=W,minY=H,maxX=0,maxY=0,cnt=0;
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){ if(isWell(at(x,y))){ cnt++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } }
    return { W,H, cnt, box:{minX,minY,maxX,maxY} };
  }, dataUrl);
  const {W,H,box} = r;
  const f = (v,d)=> +(v/d).toFixed(4);
  console.log(name, `${W}x${H}`,
    "wellFrac L/T/R/B =",
    f(box.minX,W), f(box.minY,H), f(box.maxX,W), f(box.maxY,H),
    "| inset% L,T,R,B =",
    (f(box.minX,W)*100).toFixed(1), (f(box.minY,H)*100).toFixed(1),
    ((1-f(box.maxX,W))*100).toFixed(1), ((1-f(box.maxY,H))*100).toFixed(1));
}
await b.close();
