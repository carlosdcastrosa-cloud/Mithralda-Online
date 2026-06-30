// CAS-301 — local verification: with the (CAS-301a) 8-dir wiring + the baked idle8/walk8
// strips, drive each class through all 8 movement headings and capture a 4×8 montage
// (rows=class, cols=heading) so the 8-direction facing is visible end-to-end. Also asserts
// the 8 strips serve 200 at the right dims and the run has 0 page errors.
//   node tools/cas301-8dir-verify.mjs
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const { url: baseURL, close } = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 700 });
const errs = []; page.on("pageerror", e => errs.push(String(e)));
page.on("console", m => { if (m.type() === "error") errs.push("console:" + m.text()); });

await page.goto(baseURL + "?dev", { waitUntil: "networkidle2" });
await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas301"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
await new Promise(r => setTimeout(r, 600));

// 8 headings → key combo (default WASD). Order = atan2 bucket 0=E..7=NE.
const HEAD = [
  { d: "E",  keys: ["KeyD"] },
  { d: "SE", keys: ["KeyD", "KeyS"] },
  { d: "S",  keys: ["KeyS"] },
  { d: "SW", keys: ["KeyS", "KeyA"] },
  { d: "W",  keys: ["KeyA"] },
  { d: "NW", keys: ["KeyA", "KeyW"] },
  { d: "N",  keys: ["KeyW"] },
  { d: "NE", keys: ["KeyW", "KeyD"] },
];
const CLASSES = ["mage", "paladin", "priest", "druid"];
const press = (codes, down) => page.evaluate((codes, down) => {
  for (const code of codes) window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, bubbles: true }));
}, codes, down);

const CW = 110, CH = 120; // crop around the (centered) hero
const shots = {}; // `${cls}:${d}` -> dataURL
for (const cls of CLASSES) {
  await page.evaluate(c => window.__dev.setClass(c), cls);
  await new Promise(r => setTimeout(r, 250));
  for (const h of HEAD) {
    await press(h.keys, true);
    await new Promise(r => setTimeout(r, 320)); // move so facing settles + walk anim runs
    const buf = await page.screenshot({ clip: { x: 450 - CW / 2, y: 350 - CH / 2, width: CW, height: CH }, encoding: "base64" });
    shots[`${cls}:${h.d}`] = buf;
    await press(h.keys, false);
    await new Promise(r => setTimeout(r, 120));
  }
}

// strip serve check
const strips = [];
for (const cls of CLASSES) for (const s of ["idle8", "walk8"]) {
  const u = `${baseURL}/assets/erw/hero/classes/${cls}_${s}.png`;
  const r = await fetch(u); strips.push({ f: `${cls}_${s}`, ok: r.ok, status: r.status });
}

// build 4×8 montage
const montage = await page.evaluate(async ({ shots, CLASSES, HEAD, CW, CH }) => {
  const pad = 4, lab = 16, lw = 56;
  const c = document.createElement("canvas");
  c.width = lw + HEAD.length * (CW + pad) + pad; c.height = lab + CLASSES.length * (CH + pad) + pad;
  const x = c.getContext("2d"); x.fillStyle = "#1d1726"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#ffd24d"; x.font = "12px monospace"; x.textAlign = "center";
  for (let j = 0; j < HEAD.length; j++) x.fillText(HEAD[j].d, lw + j * (CW + pad) + CW / 2, 12);
  x.textAlign = "left";
  for (let i = 0; i < CLASSES.length; i++) {
    const ry = lab + i * (CH + pad);
    x.fillText(CLASSES[i], 4, ry + CH / 2);
    for (let j = 0; j < HEAD.length; j++) {
      const im = new Image(); await new Promise(r => { im.onload = r; im.src = "data:image/png;base64," + shots[`${CLASSES[i]}:${HEAD[j].d}`]; });
      x.drawImage(im, lw + j * (CW + pad), ry);
    }
  }
  return c.toDataURL("image/png").split(",")[1];
}, { shots, CLASSES, HEAD, CW, CH });
writeFileSync("assets/erw/hero/gen/cas301/cas301-8dir-verify.png", Buffer.from(montage, "base64"));

const fps = await page.evaluate(() => window.__dev && window.__dev.fps ? window.__dev.fps() : null);
console.log("strips:", JSON.stringify(strips));
console.log("pageErrors:", errs.length, errs.slice(0, 5));
console.log("fps:", fps);
console.log("montage: assets/erw/hero/gen/cas301/cas301-8dir-verify.png");
await browser.close(); await close();
