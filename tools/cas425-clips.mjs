// CAS-425 — native-res clips of each UI region + grass lit-probe (drift check)
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";
const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const OUT = "shots/cas425"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const page = await (await browser.createBrowserContext()).newPage();
await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
const errs = []; page.on("pageerror", (e) => errs.push(String(e.message)));
const key = (c, k) => page.evaluate((c, k) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: k || c, bubbles: true })), c, k);
await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction("window.__hud && window.__dev && window.__uiLayout", { timeout: 30000 });
await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "QA425";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
await key("Digit1");
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
await wait(1400);

// panel rects from DOM + canvas
const rects = await page.evaluate(() => {
  const out = {};
  const r = (n, sel) => { const e = document.querySelector(sel); if (!e) return;
    const b = e.getBoundingClientRect(); if (b.width) out[n] = { x: b.x, y: b.y, w: b.width, h: b.height }; };
  r("vitals", "#hud .p-stat"); r("doll", "#hud .p-doll"); r("bag", "#hud .p-bag");
  r("con", "#hud .p-con"); r("cap", "#hud .cap"); r("chips", "#hud .chips"); r("drawer", "#hud .drawerBtn");
  window.__uiAudit = true;
  return out;
});
await wait(400);
const cvRects = await page.evaluate(() => JSON.parse(JSON.stringify(window.__uiRects || {})));
console.log("DOM:", JSON.stringify(rects));
console.log("CV :", JSON.stringify(cvRects));
const pad = 10;
async function clip(name, r) {
  if (!r) return console.log("skip", name);
  const c = { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad),
    width: Math.min(1366 - Math.max(0, r.x - pad), r.w + 2 * pad), height: Math.min(768 - Math.max(0, r.y - pad), r.h + 2 * pad) };
  await page.screenshot({ path: `${OUT}/clip-${name}.png`, clip: c });
}
for (const [n, r] of Object.entries(rects)) await clip("dom-" + n, r);
for (const [n, r] of Object.entries(cvRects)) await clip("cv-" + n, r);

// grass lit-probe: tp to open field, sample canvas
await page.evaluate(() => { try { window.__dev.tp(60, 60); } catch (e) {} });
await wait(900);
await page.screenshot({ path: `${OUT}/10-field-grass.png`, clip: { x: 400, y: 200, width: 560, height: 360 } });
const probe = await page.evaluate(() => {
  const cv = document.querySelector("canvas");
  const g = cv.getContext("2d", { willReadFrequently: true }) || cv.getContext("2d");
  try {
    const d = g.getImageData(cv.width / 2 - 100, cv.height / 2 + 60, 200, 80).data;
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { rs += d[i]; gs += d[i + 1]; bs += d[i + 2]; n++; }
    return { r: rs / n, g: gs / n, b: bs / n, lum: (rs + gs + bs) / (3 * n) };
  } catch (e) { return { err: String(e) }; }
});
console.log("grass probe:", JSON.stringify(probe));
console.log("pageerrors:", errs.length, errs.slice(0, 3));
await browser.close();
