import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";
const b = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const p = await b.newPage();
const png = fs.readFileSync("assets/pixellab/ui/cas286/hud_paperdoll.png").toString("base64");
await p.setContent(`<img id=i src="data:image/png;base64,${png}">`);
await p.waitForFunction("document.getElementById('i').complete");
const r = await p.evaluate(() => {
  const img = document.getElementById("i");
  const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const lum = (px, py) => { const i = (py * c.width + px) * 4; return (d[i] + d[i+1] + d[i+2]) / 3; };
  // icon box 1 inner band y131..175 → x extent of bright cols
  const colScan = (y0, y1, thr) => { const out = []; for (let px = 20; px < 268; px++) { let s=0,n=0; for (let y=y0;y<=y1;y++){s+=lum(px,y);n++;} out.push({px,v:s/n}); } return out; };
  const iconBand = colScan(135, 170, 40).filter(c2=>c2.v>40).map(c2=>c2.px);
  // dark display panel x-extent: cols with 20<v<40 over y 150..380 (dark grey interior ~32)
  const disp = colScan(100, 100, 0); // placeholder
  const dispCols = [];
  for (let px = 20; px < 268; px++) { let s=0,n=0; for (let y=150;y<=380;y++){s+=lum(px,y);n++;} dispCols.push({px, v:Math.round(s/n)}); }
  // display panel vertical extent at x=160
  const dispRows = [];
  for (let y = 100; y < 470; y++) dispRows.push({y, v: Math.round(lum(160, y))});
  const inDisp = dispRows.filter(r2 => r2.v > 20 && r2.v < 45).map(r2 => r2.y);
  return {
    iconBoxX: [Math.min(...iconBand), Math.max(...iconBand)],
    dispColProfile: dispCols.filter((m,i)=>i%4===0).map(m=>m.px+":"+m.v).join(" "),
    dispY: [Math.min(...inDisp), Math.max(...inDisp)],
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
