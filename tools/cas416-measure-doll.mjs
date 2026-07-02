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
  // 1) icon column: scan rows, avg lum for x 40..110; icon boxes are lighter than gap
  const rows = [];
  for (let y = 100; y < 480; y++) { let s = 0, n = 0; for (let px = 45, e = 105; px < e; px++) { s += lum(px, y); n++; } rows.push({ y, v: s / n }); }
  // find contiguous bright bands (v > 40)
  const bands = []; let st = null;
  for (const r of rows) { if (r.v > 40 && st == null) st = r.y; if (r.v <= 40 && st != null) { bands.push([st, r.y - 1]); st = null; } }
  if (st != null) bands.push([st, 479]);
  // 2) icon column x-extent: avg lum per column for y = first band
  const cols = [];
  for (let px = 20; px < 268; px++) { let s = 0, n = 0; for (let y = bands[0][0]; y <= bands[0][1]; y++) { s += lum(px, y); n++; } cols.push({ px, v: s / n }); }
  const iconCols = cols.filter(c2 => c2.v > 40).map(c2 => c2.px);
  // 3) dark display panel: for a mid row (y=300), find dark region right of icons
  const midRow = [];
  for (let px = 100; px < 288; px++) midRow.push({ px, v: lum(px, 300) });
  return { w: c.width, h: c.height, bands, iconX: [Math.min(...iconCols), Math.max(...iconCols)], midRow: midRow.filter((m,i)=>i%4===0).map(m=>m.px+":"+Math.round(m.v)).join(" ") };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
