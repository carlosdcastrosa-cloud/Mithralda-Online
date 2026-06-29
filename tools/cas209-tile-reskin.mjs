// ===========================================================================
// tools/cas209-tile-reskin.mjs — CAS-209 (FOUNTAINS parity, priority A)
// Apply the CANONICAL FOUNTAINS reskin transform (same as cas200-fountains-
// restyle.mjs §B: desat, hue->cold 210, darken, blue-black shadow floor, warm
// highlight, blood preserved) to the WARM baked tile PNGs *in place*.
//
// These assets/tiles/*.png are the images render.js blits for the in-world floor
// (T_STONE cave_floor, T_COBBLE ruins_floor, T_GRASS ruins_grass, walls). The
// COL palette re-skin (render/palette.js) only covers the *procedural* fill path;
// these baked images sit on top of it, so the live town/ruins/cave floors were
// still warm sandstone. The board adopted FOUNTAINS as canonical (approval
// c360188d / CAS-200) and sanctioned replacing warm assets tile-by-tile, so we
// overwrite in place: same filename + dimensions = drop-in, no engineer wiring,
// no render/sprites.js change. Warm originals stay recoverable in git history.
//
// Run: node tools/cas209-tile-reskin.mjs
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("No Chromium found"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.error("PAGE-ERR", m.text()); });

// Canonical FOUNTAINS reskin (verbatim transform from cas200-fountains-restyle.mjs §B).
async function reskin(srcPath, dstPath, label) {
  const uri = "data:image/png;base64," + readFileSync(srcPath).toString("base64");
  const b64 = await page.evaluate(async (uri) => {
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
    const hdist = (a,b) => { let x = Math.abs(a-b)%360; return x>180?360-x:x; };
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 8) continue;
      let [h,s,l] = rgb2hsl(d[i], d[i+1], d[i+2]);
      const isBlood = (hdist(h, 0) < 18 || hdist(h, 355) < 18) && s > 0.45;
      if (isBlood) {
        s = Math.min(1, s * 1.05); l = Math.max(0, l - 0.04);
      } else {
        s = s * 0.42;
        const cold = 210, w = 0.30 + 0.30 * (1 - l);
        const dh = ((cold - h + 540) % 360) - 180; h = (h + dh * w + 360) % 360;
        // TERRAIN darken (stronger than the sprite reskin's 0.82): terrain must SINK
        // into shadow at ~20-25% value per the FOUNTAINS formula. Sprites need to stay
        // readable; tiles do not, so we push them into the gloom floor harder.
        l = l * 0.58;
        if (l > 0.30) l = 0.30 + (l - 0.30) * 0.5;   // compress highlights so no slab glows
        if (l < 0.10) { l = Math.max(0.04, l * 0.7); }
      }
      let [nr,ng,nb] = hsl2rgb(h,s,l);
      if (!isBlood) {
        const shadowW = Math.max(0, 0.22 * (1 - l*2.2));
        nr = nr*(1-shadowW) + 14*shadowW; ng = ng*(1-shadowW) + 18*shadowW; nb = nb*(1-shadowW) + 30*shadowW;
        const hiW = Math.max(0, 0.10 * (l*1.8 - 0.7));
        nr = nr*(1-hiW) + 255*hiW; ng = ng*(1-hiW) + 210*hiW; nb = nb*(1-hiW) + 150*hiW;
      }
      d[i]=Math.round(Math.max(0,Math.min(255,nr)));
      d[i+1]=Math.round(Math.max(0,Math.min(255,ng)));
      d[i+2]=Math.round(Math.max(0,Math.min(255,nb)));
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  }, uri);
  writeFileSync(dstPath, Buffer.from(b64, "base64"));
  console.log(`OK reskin (in place): ${label}`);
}

// The baked tiles render.js blits for the live floor + walls.
const TILES = [
  "assets/tiles/ruins_floor.png", "assets/tiles/ruins_floor2.png",
  "assets/tiles/ruins_grass.png", "assets/tiles/ruins_grass2.png",
  "assets/tiles/cave_floor.png",  "assets/tiles/cave_floor2.png",
  "assets/tiles/wall.png",        "assets/tiles/wall2.png",
];
for (const rel of TILES) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) { console.warn(`skip (missing): ${rel}`); continue; }
  await reskin(p, p, rel);   // in place
}

// Animated mob strips that render as warm-toned baked images (assets/char/*.png).
// These are the dominant mobs visible in hunt biomes (stone golem, mage skeleton,
// moose boss). Reskin in-place so they read as cold dark-fantasy against the dark terrain.
const MOB_STRIPS = [
  "assets/char/golem_idle.png",    "assets/char/golem_walk.png",    "assets/char/golem_attack.png",
  "assets/char/mage_idle.png",     "assets/char/mage_walk.png",     "assets/char/mage_attack.png",
  "assets/char/moose_idle.png",    "assets/char/moose_walk.png",    "assets/char/moose_attack.png",
  "assets/char/merchant_idle.png",
];
for (const rel of MOB_STRIPS) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) { console.warn(`skip (missing): ${rel}`); continue; }
  await reskin(p, p, rel);
}

// World props visible as environmental deco in biomes (ruins statues/obelisks,
// barrel, pillar, bones, rock, spear — things that still read warm against the cold floor).
// barrel/rock/bones kept as-is (they're already dark enough); focus on the warm-stone props.
const PROPS = [
  "assets/props/ruin_statue.png",   "assets/props/ruin_obelisk.png",
  "assets/props/ruin_arch.png",     "assets/props/ruin_pillar2.png",
  "assets/props/pillar.png",        "assets/props/barrel.png",
  "assets/props/torch.png",
];
for (const rel of PROPS) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) { console.warn(`skip (missing): ${rel}`); continue; }
  await reskin(p, p, rel);
}

await browser.close();
console.log("done — warm baked tiles + mob strips + props reskinned to FOUNTAINS in place");
