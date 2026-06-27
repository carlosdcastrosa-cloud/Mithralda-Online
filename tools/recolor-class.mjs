// ===========================================================================
// tools/recolor-class.mjs — CAS-101: derive the dedicated paladin / druid /
// priest animated strips from the canonical class sprites via DISCIPLINED
// palette shifts (STYLE FORMULA: "class variants shift hue/accent within the
// family, not into a new palette"). Same silhouette, same 6-frame idle motion,
// same cell geometry — only the accent hue/lightness changes so each reads as a
// distinct role at a glance:
//   paladin ← warrior  (crimson/steel → holy gold + brighter silver)
//   druid   ← archer    (olive/tan ranger → forest green)
//   priest  ← mage      (robe → white/cream holy + warm gold trim)
// The near-black hood/base is PROTECTED (kept) so all classes stay one family.
// Operates per-pixel over the whole strip (frames are columns) — alpha & geom
// untouched. Run: node tools/recolor-class.mjs
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";

const DIR = join(ROOT, "assets", "erw", "hero", "classes");
// dst, src, {hue:deg rotate, sat:mul, light:add(0..255), tint:[r,g,b], tintAmt, darkFloor}
const JOBS = [
  { dst: "paladin", src: "warrior", hue: 38,  sat: 0.85, light: 16, tint: [255, 226, 150], tintAmt: 0.14, darkFloor: 46 },
  { dst: "druid",   src: "archer",  hue: 75,  sat: 1.25, light: 2,  tint: [110, 175, 86],  tintAmt: 0.16, darkFloor: 46 },
  { dst: "priest",  src: "mage",    hue: 30,  sat: 0.45, light: 30, tint: [255, 241, 205], tintAmt: 0.20, darkFloor: 52 },
];

const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

async function recolor(j) {
  const uri = "data:image/png;base64," + readFileSync(join(DIR, `${j.src}.png`)).toString("base64");
  const b64 = await page.evaluate(async (uri, j) => {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = uri; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true }); g.imageSmoothingEnabled = false;
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, W, H), d = im.data;
    const rgb2hsl = (r, gg, b) => { r/=255; gg/=255; b/=255;
      const mx=Math.max(r,gg,b), mn=Math.min(r,gg,b), l=(mx+mn)/2; let h=0,s=0;
      if (mx!==mn){ const dd=mx-mn; s=l>0.5?dd/(2-mx-mn):dd/(mx+mn);
        h = mx===r ? (gg-b)/dd+(gg<b?6:0) : mx===gg ? (b-r)/dd+2 : (r-gg)/dd+4; h/=6; }
      return [h*360, s, l]; };
    const hue2rgb = (p,q,t)=>{ if(t<0)t+=1; if(t>1)t-=1;
      if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; };
    const hsl2rgb = (h,s,l)=>{ h/=360; let r,gg,b; if(s===0){r=gg=b=l;}
      else { const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
        r=hue2rgb(p,q,h+1/3); gg=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3); }
      return [r*255,gg*255,b*255]; };
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 8) continue;
      const r=d[i], gg=d[i+1], b=d[i+2];
      const mx=Math.max(r,gg,b);
      if (mx <= j.darkFloor) continue;                 // protect dark hood/base
      let [h,s,l] = rgb2hsl(r,gg,b);
      h = (h + j.hue) % 360; if (h<0) h+=360;
      s = Math.max(0, Math.min(1, s * j.sat));
      l = Math.max(0, Math.min(1, l + j.light/255));
      let [nr,ng,nb] = hsl2rgb(h,s,l);
      // soft tint, stronger on lighter pixels (accent), so the silhouette warms
      const w = j.tintAmt * Math.min(1, l*1.3);
      nr = nr*(1-w) + j.tint[0]*w; ng = ng*(1-w) + j.tint[1]*w; nb = nb*(1-w) + j.tint[2]*w;
      d[i]=Math.round(nr); d[i+1]=Math.round(ng); d[i+2]=Math.round(nb);
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  }, uri, j);
  writeFileSync(join(DIR, `${j.dst}.png`), Buffer.from(b64, "base64"));
  console.log(`✔ classes/${j.dst}.png  ← ${j.src}  (hue+${j.hue} sat×${j.sat} L+${j.light})`);
}
for (const j of JOBS) await recolor(j);
await browser.close();
