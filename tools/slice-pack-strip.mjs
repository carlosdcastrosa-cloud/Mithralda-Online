// CAS-74: vertical-crop a horizontal sprite strip from the EPIC RPG World packs.
// The pack frames carry large transparent padding (a 224×192 frame holds a ~68px
// golem with ~68px of empty space below its feet), which breaks bottom-anchored
// world rendering. This crops every frame to a uniform row window [y0, y0+h) so the
// character's feet sit near the frame bottom, keeping the single-row layout intact.
//
// Usage: node tools/slice-pack-strip.mjs <in.png> <out.png> <frameW> <y0> <cropH>
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const [, , inRel, outRel, fwS, y0S, hS] = process.argv;
if (!outRel) { console.error("usage: in out frameW y0 cropH"); process.exit(1); }
const fw = +fwS, y0 = +y0S, h = +hS;

const srv = await startServer();
const b = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
try {
  const p = await b.newPage();
  await p.goto(srv.url + "/index.html", { waitUntil: "load" });
  const dataUrl = await p.evaluate(async (url, fw, y0, h) => {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const W = img.naturalWidth;
    const c = document.createElement("canvas"); c.width = W; c.height = h;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    x.drawImage(img, 0, y0, W, h, 0, 0, W, h);
    return c.toDataURL("image/png");
  }, "./" + inRel.replace(/^\.\//, ""), fw, y0, h);
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(outRel, buf);
  console.log(`✔ ${outRel}  cropped rows ${y0}..${y0 + h} (${buf.length} bytes)`);
} finally { await b.close(); await srv.close?.(); }
process.exit(0);
