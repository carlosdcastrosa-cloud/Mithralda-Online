// CAS-439: swamp biome preview montage + palette-distinction check.
// Tiles ground plane with the new swamp tiles (seam check), places props on top,
// and compares avg tile color vs existing grass/town/cave tiles.
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const b64 = f => "data:image/png;base64," + readFileSync(join(ROOT, f)).toString("base64");

const TILES = readdirSync(join(ROOT, "assets/tiles")).filter(f => f.startsWith("swamp_") && f.endsWith(".png")).map(f => "assets/tiles/" + f);
const PROPS = readdirSync(join(ROOT, "assets/props/swamp")).filter(f => f.endsWith(".png")).map(f => "assets/props/swamp/" + f);
const REF = ["assets/tiles/ruins_grass.png", "assets/tiles/ruins_floor.png", "assets/tiles/cave_floor.png"];

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

const out = await page.evaluate(async (tiles, props, refs) => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s.data; });
  const T = await Promise.all(tiles.map(t => load(t).then(im => ({ name: t.name, im }))));
  const P = await Promise.all(props.map(t => load(t).then(im => ({ name: t.name, im }))));
  const R = await Promise.all(refs.map(t => load(t).then(im => ({ name: t.name, im }))));

  const avg = im => {
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 128) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; } }
    return [r / n, gg / n, b / n];
  };

  const S = 3, TS = 32;                       // zoom, tile px
  const gw = 14, gh = 8;                       // ground grid (tiled with the base variants)
  const W = gw * TS * S, groundH = gh * TS * S;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = groundH + 210 * S / 3 + 120;
  const g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
  g.fillStyle = "#0b0d10"; g.fillRect(0, 0, cv.width, cv.height);

  // ground: mostly base tile, sprinkled variants (deterministic pattern) — seams visible if any
  const baseIdx = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const k = (x * 7 + y * 13) % 17;
    const t = k === 0 ? 1 % T.length : k === 5 ? 2 % T.length : k === 9 ? 3 % T.length : baseIdx;
    g.drawImage(T[t].im, x * TS * S, y * TS * S, TS * S, TS * S);
  }
  // props on the ground, spread out
  let px = 20;
  for (const p of P) {
    const w = p.im.width * S, h = p.im.height * S;
    g.drawImage(p.im, px, groundH - h - 24, w, h);
    px += w + 46;
  }
  // strip below: each tile alone 3x3 self-tiled (seam check) + label
  let sx = 8; const sy = groundH + 10;
  g.font = "12px monospace"; g.fillStyle = "#ccc";
  for (const t of T) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) g.drawImage(t.im, sx + x * TS * 2, sy + y * TS * 2, TS * 2, TS * 2);
    g.fillStyle = "#ccc"; g.fillText(t.name.split("/").pop(), sx, sy + TS * 6 + 14);
    sx += TS * 6 + 16;
  }
  // palette report
  const rep = {};
  for (const t of [...T, ...R]) rep[t.name.split("/").pop()] = avg(t.im).map(v => Math.round(v));
  return { png: cv.toDataURL("image/png"), rep };
}, TILES.map(f => ({ name: f, data: b64(f) })), PROPS.map(f => ({ name: f, data: b64(f) })), REF.map(f => ({ name: f, data: b64(f) })));

writeFileSync(join(ROOT, "shots/cas439-swamp-montage.png"), Buffer.from(out.png.split(",")[1], "base64"));
console.log("montage -> shots/cas439-swamp-montage.png");
for (const [k, v] of Object.entries(out.rep)) {
  const [r, g2, b] = v; const sum = r + g2 + b;
  console.log(`${k.padEnd(24)} rgb(${v.join(",")})  g/sum=${(g2 / sum).toFixed(2)} b/sum=${(b / sum).toFixed(2)}`);
}
await browser.close();
