// ===========================================================================
// tools/cas200-fountains-restyle.mjs — CAS-200
// Re-style Mithralda art into the FOUNTAINS dark-fantasy pixel formula and emit
// a first NEW-asset batch, drop-in compatible (same sizes/format as existing).
//
// Produces:
//   A) NEW 32x32 dark-fantasy TILES (procedural canvas) -> assets/tiles_fountains/
//      dungeon_floor, dungeon_floor2, cracked_flag, blood_floor, dark_cobble, dungeon_wall
//   B) RESKINS of existing sprites via the canonical FOUNTAINS transform
//      (desat x0.55, hue->cold 210, L x0.78, blue-black shadow floor, warm-highlight)
//      -> <orig dir>/<name>_fountains.png  (same dimensions, never clobbers originals)
//      targets: skeleton idle, viper idle (2 mob sprites) + ruins_floor / wall tiles
//   C) PREVIEW contact sheet (zoomed) -> tools/cas200-fountains-preview.png
//
// Pipeline: puppeteer-core + system Chromium canvas->PNG (same as recolor-class).
// Palette per design/palette.fountains.json. Run: node tools/cas200-fountains-restyle.mjs
// ===========================================================================
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT_TILES = join(ROOT, "assets", "tiles_fountains");
if (!existsSync(OUT_TILES)) mkdirSync(OUT_TILES, { recursive: true });

const exe = findChromium();
if (!exe) { console.error("No Chromium found"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
page.on("console", (m) => { if (m.type() === "error") console.error("PAGE-ERR", m.text()); });

// --- A) NEW procedural dark-fantasy tiles -------------------------------------
const FOUNTAINS_PAL = JSON.parse(
  readFileSync(join(ROOT, "design", "palette.fountains.json"), "utf8")
);

async function drawTiles() {
  const b64map = await page.evaluate((PAL) => {
    const env = PAL.roles.environment, sig = PAL.roles.signal;
    const mk = () => { const c = document.createElement("canvas"); c.width = 32; c.height = 32;
      const g = c.getContext("2d"); g.imageSmoothingEnabled = false; return [c, g]; };
    // tiny deterministic PRNG so tiles are stable across runs
    const mkrng = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const fill = (g, col) => { g.fillStyle = col; g.fillRect(0, 0, 32, 32); };
    const px = (g, x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    const out = {};

    // helper: speckle dither between dark/base/light for grit
    const speckle = (g, rng, dark, light, density) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const r = rng();
        if (r < density * 0.5) px(g, x, y, dark);
        else if (r > 1 - density * 0.5) px(g, x, y, light);
      }
    };

    // 1) dungeon_floor — slate flagstone, 2x2 slabs, mortar seams, cold
    {
      const [c, g] = mk(); const rng = mkrng(0x51);
      fill(g, env.stone.base); speckle(g, rng, env.stone.dark, env.stone.light, 0.10);
      g.fillStyle = env.stone.dark;          // mortar grid
      g.fillRect(0, 15, 32, 1); g.fillRect(15, 0, 1, 16); g.fillRect(15, 16, 1, 16);
      g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
      // top-left cold highlight on each slab, bottom-right shadow (light from top-left)
      for (const [ox, oy] of [[0,0],[16,0],[0,16],[16,16]]) {
        g.fillStyle = env.stone.light; g.fillRect(ox+1, oy+1, 13, 1); g.fillRect(ox+1, oy+1, 1, 13);
        g.fillStyle = env.stone.dark;  g.fillRect(ox+1, oy+14, 14, 1);
      }
      out.dungeon_floor = c.toDataURL("image/png").split(",")[1];
    }
    // 2) dungeon_floor2 — same slab but worn/darker variant for tiling variety
    {
      const [c, g] = mk(); const rng = mkrng(0x99);
      fill(g, env.stone.dark); speckle(g, rng, env.bg, env.stone.base, 0.14);
      g.fillStyle = "#15181e"; g.fillRect(0, 15, 32, 1); g.fillRect(15, 0, 1, 32);
      for (let i = 0; i < 5; i++) { const x = 2 + Math.floor(rng()*28), y = 2 + Math.floor(rng()*28); px(g, x, y, env.bg); }
      out.dungeon_floor2 = c.toDataURL("image/png").split(",")[1];
    }
    // 3) cracked_flag — flagstone with a forked crack (Souls-like decay)
    {
      const [c, g] = mk(); const rng = mkrng(0x1d);
      fill(g, env.stone.base); speckle(g, rng, env.stone.dark, env.stone.light, 0.08);
      g.fillStyle = env.stone.dark; g.fillRect(0, 15, 32, 1); g.fillRect(15, 0, 1, 32);
      // jagged crack down the middle
      let x = 14; g.fillStyle = env.bg;
      for (let y = 2; y < 30; y++) { x += (rng() < 0.5 ? -1 : 1); x = Math.max(6, Math.min(26, x));
        g.fillRect(x, y, 1, 1); if (y === 14) { for (let k = 0; k < 6; k++) g.fillRect(x + k, y + k, 1, 1); } }
      out.cracked_flag = c.toDataURL("image/png").split(",")[1];
    }
    // 4) blood_floor — flagstone soaked with stylized crimson (FOUNTAINS blood signal)
    {
      const [c, g] = mk(); const rng = mkrng(0x77);
      fill(g, env.stone.base); speckle(g, rng, env.stone.dark, env.stone.light, 0.08);
      g.fillStyle = env.stone.dark; g.fillRect(0, 15, 32, 1); g.fillRect(15, 0, 1, 32);
      // irregular blood pool, darker rim + lighter center, plus spatter
      const cx = 16, cy = 17;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const d = Math.hypot(x - cx, y - cy) + (rng() * 4 - 2);
        if (d < 9) px(g, x, y, sig.blood_dark);
        if (d < 6.5) px(g, x, y, sig.blood);
      }
      for (let i = 0; i < 14; i++) px(g, Math.floor(rng()*32), Math.floor(rng()*32), rng() < 0.6 ? sig.blood_dark : sig.blood);
      out.blood_floor = c.toDataURL("image/png").split(",")[1];
    }
    // 5) dark_cobble — town cobblestone, blue-slate, rounded stones
    {
      const [c, g] = mk(); const rng = mkrng(0xab);
      fill(g, env.cobble.dark);
      for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
        const ox = gx * 8 + (gy % 2) * 4, oy = gy * 8;
        const shade = rng(); const base = shade < 0.33 ? env.cobble.dark : shade < 0.7 ? env.cobble.base : env.cobble.light;
        g.fillStyle = base; g.fillRect(ox + 1, oy + 1, 6, 6);
        g.fillStyle = env.cobble.light; g.fillRect(ox + 1, oy + 1, 5, 1); g.fillRect(ox + 1, oy + 1, 1, 5);
        g.fillStyle = env.bg; g.fillRect(ox + 6, oy + 1, 1, 6); g.fillRect(ox + 1, oy + 6, 6, 1);
      }
      out.dark_cobble = c.toDataURL("image/png").split(",")[1];
    }
    // 6) dungeon_wall — heavy ashlar blocks, deep mortar shadow, top rim light
    {
      const [c, g] = mk(); const rng = mkrng(0xc3);
      fill(g, env.stone.dark);
      const rows = [[0, 0, 16], [0, 16, 16], [10, 8, 14]]; // brick offsets (x,y,w)
      for (let ry = 0; ry < 32; ry += 8) {
        const off = (ry / 8) % 2 ? 8 : 0;
        for (let rx = -off; rx < 32; rx += 16) {
          const shade = rng(); const base = shade < 0.5 ? env.stone.base : env.stone.dark;
          g.fillStyle = base; g.fillRect(rx + 1, ry + 1, 14, 6);
          g.fillStyle = env.stone.light; g.fillRect(rx + 1, ry + 1, 14, 1); // top rim light
          g.fillStyle = env.bg; g.fillRect(rx, ry + 7, 16, 1);              // deep mortar
          g.fillRect(rx + 15, ry, 1, 8);
        }
      }
      out.dungeon_wall = c.toDataURL("image/png").split(",")[1];
    }
    return out;
  }, FOUNTAINS_PAL);

  for (const [name, b64] of Object.entries(b64map)) {
    writeFileSync(join(OUT_TILES, `${name}.png`), Buffer.from(b64, "base64"));
    console.log(`✔ NEW tile  assets/tiles_fountains/${name}.png  (32x32)`);
  }
  return Object.keys(b64map);
}

// --- B) Canonical FOUNTAINS reskin transform ----------------------------------
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
    // hue-distance helper to detect pixels already on a signal hue (keep those vivid)
    const hdist = (a,b) => { let x = Math.abs(a-b)%360; return x>180?360-x:x; };
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 8) continue;
      let [h,s,l] = rgb2hsl(d[i], d[i+1], d[i+2]);
      // PRESERVE strong crimson-blood signal so gore stays the one vivid accent
      const isBlood = (hdist(h, 0) < 18 || hdist(h, 355) < 18) && s > 0.45;
      if (isBlood) {
        s = Math.min(1, s * 1.05); l = Math.max(0, l - 0.04); // punch blood slightly
      } else {
        // 1) desaturate hard
        s = s * 0.45;
        // 2) pull hue toward cold (210 = slate-blue) at ALL lightnesses
        //    (a flat base + extra in shadow), so warm highlights don't stay olive
        const cold = 210, w = 0.24 + 0.26 * (1 - l);
        const dh = ((cold - h + 540) % 360) - 180; h = (h + dh * w + 360) % 360;
        // 3) darken; gentle so light sprites (bone/steel) stay readable, crush only deep shadow
        l = l * 0.82;
        if (l < 0.14) { l = Math.max(0.05, l * 0.7); }      // crush deep shadow only
      }
      let [nr,ng,nb] = hsl2rgb(h,s,l);
      if (!isBlood) {
        // cold tint in shadow, warm tint in highlight (color-temperature split)
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
  console.log(`✔ RESKIN   ${label}`);
}

// --- run ----------------------------------------------------------------------
const tiles = await drawTiles();

const RESKINS = [
  // 2 mob sprites (idle sheets) — drop-in same dimensions, _fountains suffix
  ["assets/erw/mobs/skeleton/Skeleton_1_-_animations-idle.png",
   "assets/erw/mobs/skeleton/Skeleton_1_-_animations-idle_fountains.png", "skeleton idle (1760x220)"],
  ["assets/erw/mobs/viper/viper-idle.png",
   "assets/erw/mobs/viper/viper-idle_fountains.png", "viper idle (768x96)"],
];
for (const [s, dd, label] of RESKINS) {
  const sp = join(ROOT, s), dp = join(ROOT, dd);
  if (!existsSync(sp)) { console.warn(`skip (missing): ${s}`); continue; }
  await reskin(sp, dp, label);
}

// --- C) preview contact sheet (zoomed 6x) -------------------------------------
async function preview() {
  const items = [];
  for (const t of tiles) items.push({ label: t, path: join(OUT_TILES, `${t}.png`), tile: true });
  items.push({ label: "skeleton idle (reskin)", path: join(ROOT, "assets/erw/mobs/skeleton/Skeleton_1_-_animations-idle_fountains.png"), tile: false });
  items.push({ label: "viper idle (reskin)", path: join(ROOT, "assets/erw/mobs/viper/viper-idle_fountains.png"), tile: false });
  const data = items.map((it) => ({ label: it.label, tile: it.tile,
    uri: "data:image/png;base64," + readFileSync(it.path).toString("base64") }));
  const b64 = await page.evaluate(async (data, bg) => {
    const W = 720, rowH = 150, H = rowH * data.length + 20;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.font = "13px monospace"; g.textBaseline = "middle";
    const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
    let y = 10;
    for (const it of data) {
      const img = await load(it.uri);
      g.fillStyle = "#d8d3c4"; g.fillText(it.label, 12, y + rowH / 2);
      const maxW = 480, maxH = rowH - 20;
      let s = it.tile ? 4 : Math.min(maxW / img.width, maxH / img.height);
      if (it.tile) {
        // tile: render a 3x3 patch zoomed so tessellation/grit reads
        const z = 14, n = 3;
        for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++)
          g.drawImage(img, 220 + tx * img.width * z, y + 6 + ty * img.height * z, img.width * z, img.height * z);
      } else {
        const dw = img.width * s, dh = img.height * s;
        // lit-floor backing so silhouette readability is judged in-context, not on void
        g.fillStyle = "#2b2f38"; g.fillRect(220, y + (rowH - dh) / 2, Math.min(dw, 480), dh);
        g.drawImage(img, 220, y + (rowH - dh) / 2, dw, dh);
      }
      g.strokeStyle = "#3a3f49"; g.strokeRect(0.5, y + 0.5, W - 1, rowH - 1);
      y += rowH;
    }
    return c.toDataURL("image/png").split(",")[1];
  }, data, FOUNTAINS_PAL.roles.environment.night);
  const outP = join(ROOT, "tools", "cas200-fountains-preview.png");
  writeFileSync(outP, Buffer.from(b64, "base64"));
  console.log(`✔ PREVIEW  tools/cas200-fountains-preview.png`);
}
await preview();

await browser.close();
console.log("\nDONE — FOUNTAINS re-style batch generated.");
