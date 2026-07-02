// CAS-439: pull saturated lime greens on swamp props toward the murky teal
// palette (mossy_rock_1 moss + dead_tree_2 base grass came out too bright).
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const FILES = ["mossy_rock_1", "dead_tree_2", "dead_tree_1", "reeds_1", "mushroom_1"];
const b64 = p => "data:image/png;base64," + readFileSync(p).toString("base64");

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();

for (const name of FILES) {
  const src = join(ROOT, "assets/props/swamp", name + ".png");
  const png = await page.evaluate(async data => {
    const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
    const im = await load(data);
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height), d = id.data;
    const T = [72, 108, 92]; // murky teal target
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (gg > r + 34 && gg > b + 34) { // saturated lime green only
        const k = 0.5;
        d[i] = Math.round(r * (1 - k) + T[0] * k);
        d[i + 1] = Math.round(gg * (1 - k) + T[1] * k);
        d[i + 2] = Math.round(b * (1 - k) + T[2] * k);
      }
    }
    g.putImageData(id, 0, 0);
    return c.toDataURL("image/png");
  }, b64(src));
  writeFileSync(src, Buffer.from(png.split(",")[1], "base64"));
  console.log("dampened", name);
}
await browser.close();
