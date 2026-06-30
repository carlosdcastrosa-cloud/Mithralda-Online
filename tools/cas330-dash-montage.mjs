// CAS-330 before/after montage: OLD 140px-cell dash (VFX clipped at edges = "cortada")
// vs the NEW wide-cell dash (full motion-blur trail captured). Per-strip cell width is
// read from each image (naturalWidth/8), so the wide cell is shown at true extent.
//   node tools/cas330-dash-montage.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(ROOT, "assets", "erw", "hero", "classes");
const NEW = readFileSync(join(dir, "warrior_dash.png")).toString("base64");
const OLD = readFileSync("/tmp/warrior_dash_old.png").toString("base64");
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const url = await page.evaluate(async (NEW, OLD) => {
  const FC = 8, Z = 1.3, pad = 6;
  async function img(b){ const im=new Image(); im.src="data:image/png;base64,"+b; await im.decode(); return im; }
  const ni = await img(NEW), oi = await img(OLD);
  const rows = [
    { im: oi, label: "OLD (140px cell — VFX clipped)", col: "#ff7a7a" },
    { im: ni, label: "NEW (wide cell — full dash)",    col: "#7affa0" },
  ];
  const maxCellW = Math.max(...rows.map(r => r.im.naturalWidth / FC));
  const cellH = rows[0].im.naturalHeight; // both ~166/167
  const cw = maxCellW * Z, ch = cellH * Z;
  const cv = document.createElement("canvas");
  cv.width = FC * (cw + pad) + pad + 220;
  cv.height = rows.length * (ch + pad + 22) + pad;
  const x = cv.getContext("2d"); x.imageSmoothingEnabled = false;
  x.fillStyle = "#161c28"; x.fillRect(0,0,cv.width,cv.height);
  rows.forEach((r, ri) => {
    const cellW = r.im.naturalWidth / FC, fw = cellW * Z;
    const y = pad + ri * (ch + pad + 22);
    x.fillStyle = "#0d1119"; x.fillRect(0, y + ch*0.80, cv.width, ch*0.20); // ground
    for (let i=0;i<FC;i++){
      const dx = 220 + pad + i*(cw+pad) + (cw-fw)/2;
      // cell frame so clipping at the boundary is visible
      x.strokeStyle = "#33415a"; x.lineWidth = 1; x.strokeRect(dx, y, fw, ch);
      x.drawImage(r.im, i*cellW, 0, cellW, cellH, dx, y, fw, ch);
    }
    x.fillStyle = r.col; x.font = "bold 13px monospace";
    x.fillText(r.label, 8, y + 18);
    x.fillStyle = "#8aa0b8"; x.font = "11px monospace";
    x.fillText(`${r.im.naturalWidth}x${r.im.naturalHeight}`, 8, y + 36);
    x.fillText(`cell ${Math.round(cellW)}px`, 8, y + 52);
  });
  return cv.toDataURL("image/png");
}, NEW, OLD);
writeFileSync(join(ROOT, "tools", "cas330-dash-montage.png"), Buffer.from(url.split(",")[1], "base64"));
await browser.close();
console.log("wrote tools/cas330-dash-montage.png");
