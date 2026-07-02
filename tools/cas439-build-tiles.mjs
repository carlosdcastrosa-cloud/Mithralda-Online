// CAS-439: build final swamp ground tiles from PixelLab batch (job 2a7afab0).
// Fixes: (1) per-tile edge vignette -> ring-luminance flatten so the grid seam
// disappears when tiled; (2) puddle variant sits on olive mud -> composite the
// bluish puddle pixels onto the fixed teal mud base; (3) moss variant from the
// busy candidates is off-style -> sparse hand-placed flecks instead.
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SRC = "/tmp/cas439/tiles";
const b64 = p => "data:image/png;base64," + readFileSync(p).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

const out = await page.evaluate(async (base0, puddle7, water13) => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const TS = 32;
  const toData = im => { const c = document.createElement("canvas"); c.width = TS; c.height = TS; const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, TS, TS); };
  const toPng = id => { const c = document.createElement("canvas"); c.width = TS; c.height = TS; c.getContext("2d").putImageData(id, 0, 0); return c.toDataURL("image/png"); };
  const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  // ring-luminance flatten: measure avg luminance per distance-from-edge ring,
  // scale each ring to the interior average so tiling shows no repeating vignette
  const flatten = id => {
    const d = id.data, ring = px => Math.min(px.x, px.y, TS - 1 - px.x, TS - 1 - px.y);
    const sums = Array(16).fill(0), cnts = Array(16).fill(0);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const r = ring({ x, y }), i = (y * TS + x) * 4; sums[r] += lum(d, i); cnts[r]++; }
    const avg = sums.map((s, r) => s / cnts[r]);
    const interior = (avg[6] + avg[7] + avg[8]) / 3; // rings well inside
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const r = ring({ x, y }), i = (y * TS + x) * 4;
      const f = Math.min(1.25, Math.max(0.8, interior / avg[r]));
      for (let k = 0; k < 3; k++) d[i + k] = Math.max(0, Math.min(255, Math.round(d[i + k] * f)));
    }
    return id;
  };

  // rebuild the whole tile from its own interior texture: the source tiles carry a
  // baked-in dark border + corner notches that no luminance scaling removes, but the
  // interior is quiet noise, so sampling it on a wrapped 24px lattice is seamless
  const retile = src => {
    const out = new ImageData(TS, TS), o = out.data, s = src.data;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const sx = 4 + ((x + 9) % 24), sy = 4 + ((y + 5) % 24);
      const i = (y * TS + x) * 4, j = (sy * TS + sx) * 4;
      o[i] = s[j]; o[i + 1] = s[j + 1]; o[i + 2] = s[j + 2]; o[i + 3] = 255;
    }
    return out;
  };

  const [im0, im7, im13] = await Promise.all([load(base0), load(puddle7), load(water13)]);
  const base = retile(flatten(toData(im0)));

  // --- puddle: bluish pixels from #7 kept, everything else replaced by mud base
  const pud = toData(im7); {
    const d = pud.data, b = base.data;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const i = (y * TS + x) * 4;
      const isWater = d[i + 2] >= d[i + 1] - 6 && d[i + 2] > d[i] + 6; // b ~>= g and clearly > r
      const nearEdge = x < 2 || y < 2 || x >= TS - 2 || y >= TS - 2; // keep puddle enclosed by mud
      if (!isWater || nearEdge) { d[i] = b[i]; d[i + 1] = b[i + 1]; d[i + 2] = b[i + 2]; }
    }
  }

  // --- moss variant: base + sparse flecks (house speckle style, cf ruins_grass)
  const moss = new ImageData(new Uint8ClampedArray(base.data), TS, TS); {
    const d = moss.data;
    const put = (x, y, c) => { const i = (y * TS + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; };
    const dark = [46, 74, 62], darker = [38, 60, 54], violet = [84, 74, 100];
    // hand-placed, avoids edges so tiling stays quiet
    for (const [x, y] of [[5, 6], [6, 6], [20, 4], [26, 9], [11, 12], [12, 13], [22, 17], [4, 21], [15, 23], [16, 23], [27, 25], [8, 27]]) put(x, y, dark);
    for (const [x, y] of [[6, 7], [21, 4], [12, 12], [16, 24], [27, 26]]) put(x, y, darker);
    for (const [x, y] of [[18, 10], [9, 19], [24, 22]]) put(x, y, violet);
  }

  const water = retile(flatten(toData(im13)));

  return {
    swamp_mud: toPng(base),
    swamp_mud2: toPng(moss),
    swamp_puddle: toPng(pud),
    swamp_water: toPng(water),
  };
}, b64(join(SRC, "tile_0.png")), b64(join(SRC, "tile_7.png")), b64(join(SRC, "tile_13.png")));

for (const [name, url] of Object.entries(out)) {
  writeFileSync(join(ROOT, "assets/tiles", name + ".png"), Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote assets/tiles/" + name + ".png");
}
await browser.close();
