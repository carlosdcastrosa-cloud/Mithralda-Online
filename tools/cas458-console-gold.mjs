// CAS-458: recolor the HUD chat console frame from grey-blue STONE to the GOLD/brass
// palette so it matches the stat/paperdoll/backpack frames (issue: "marco gris piedra
// que no casa con la paleta dorada del HUD"). Geometry is preserved pixel-for-pixel so
// the measured content well (hud.js WELL.con) stays valid — we only remap chroma:
// each frame pixel keeps its luminance (its baked relief/shading) but is repainted
// through an in-palette gold ramp (goldD → textGold → gold → goldL). The deep interior
// display area + the transparent background are left untouched.
import { readFile, writeFile } from "node:fs/promises";
import puppeteer from "puppeteer-core";

const SRC = "assets/pixellab/ui/cas286/hud_console.png";
const CHROME = process.env.CHROME_PATH || "/usr/bin/chromium";

// gold ramp keyed by luminance (0..255). Colors are the HUD palette (hud.js §4).
const STOPS = [
  [40,  [0x2a,0x1e,0x0c]], // deep shadow (warm brown, not blue-black)
  [80,  [0x5a,0x44,0x20]], // frame body shadow
  [128, [0xa8,0x7f,0x2e]], // goldD  — mid brass
  [172, [0xd8,0xb2,0x5e]], // textGold
  [210, [0xe0,0xb9,0x4a]], // gold   — bright brass
  [255, [0xff,0xe3,0x9a]], // goldL  — highlight
];

async function main(){
  const buf = await readFile(SRC);
  const b64 = buf.toString("base64");
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new",
    args:["--no-sandbox","--disable-gpu"] });
  const page = await browser.newPage();
  const out = await page.evaluate(async (dataUrl, stops) => {
    const img = new Image();
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=rej; img.src=dataUrl; });
    const c = document.createElement("canvas"); c.width=img.width; c.height=img.height;
    const g = c.getContext("2d"); g.drawImage(img,0,0);
    const id = g.getImageData(0,0,c.width,c.height); const d = id.data;
    const ramp=(L)=>{ for(let i=0;i<stops.length-1;i++){ const [l0,c0]=stops[i],[l1,c1]=stops[i+1];
      if(L<=l1){ const t=Math.max(0,(L-l0)/(l1-l0));
        return [0,1,2].map(k=>Math.round(c0[k]+(c1[k]-c0[k])*t)); } }
      return stops[stops.length-1][1]; };
    for(let i=0;i<d.length;i+=4){ const a=d[i+3]; if(a===0) continue;
      const r=d[i],gg=d[i+1],bb=d[i+2]; const L=0.299*r+0.587*gg+0.114*bb;
      // Leave the deep interior display panel dark (it is masked by the runtime wash,
      // and keeping it black avoids a brown ring bleeding past the well edge).
      if(L<38) continue;
      const [nr,ng,nb]=ramp(L); d[i]=nr; d[i+1]=ng; d[i+2]=nb; }
    g.putImageData(id,0,0);
    return c.toDataURL("image/png");
  }, "data:image/png;base64,"+b64, STOPS);
  await browser.close();
  const png = Buffer.from(out.split(",")[1],"base64");
  await writeFile(SRC, png);
  console.log("wrote", SRC, png.length, "bytes");
}
main().catch(e=>{ console.error(e); process.exit(1); });
