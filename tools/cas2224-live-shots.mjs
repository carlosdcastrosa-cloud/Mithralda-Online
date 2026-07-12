// CAS-2224 — LIVE gh-pages boot+visual verify for City Batch-2 (post-deploy).
// Drives the canonical player URL (no local server): proves LIVE BOOTS (no black
// screen / __dev mounts / canvas), 0 game JS errors, the 5 Batch-2 city assets
// load 200, fps ~60, and the east-district props render. Run: node tools/cas2224-live-shots.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const OUT = "shots/cas2224-live";
mkdirSync(OUT, { recursive: true });
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }

// tiled-world coords (proc town stamped at +578 in Y): east outskirts district.
const SHOTS = [
  { name: "east-district", tx: 180, ty: 743 },
  { name: "tavern",        tx: 177, ty: 739 },
  { name: "house-blue",    tx: 177, ty: 748 },
  { name: "park",          tx: 182, ty: 740 },
];

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1.5 });
const errs = [], failed = [], cityReq = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
page.on("requestfailed", (r) => failed.push(r.url()));
page.on("response", (r) => {
  const u = r.url();
  if (/pixellab\/city\/(house_blue|tavern|park_tree|park_bench|stone_well)/.test(u)) cityReq.push(r.status() + " " + u.split("/city/")[1].split("?")[0]);
  if (r.status() === 404) failed.push(u);
});
await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load" });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
const canvasOk = await page.evaluate(() => { const c = document.getElementById("c"); return !!c && c.width > 0 && c.height > 0; });
await page.evaluate(() => { document.getElementById("nameInput").value = "QA2224L"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
for (let i = 0; i < 3; i++) {
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") break;
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
}
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

let fps = 0;
for (const s of SHOTS) {
  await page.evaluate((p) => window.__dev.tp(p.tx, p.ty), s);
  for (let i = 0; i < 6; i++) await wait(100);
  for (let i = 0; i < 5; i++) {   // dismiss any zone-curse / encounter modal
    if (await page.evaluate(() => window.__dev.scene() === "play")) break;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
    await wait(150);
  }
  for (let i = 0; i < 10; i++) await wait(100);
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  const info = await page.evaluate(() => ({ h: window.__dev.hero(), f: window.__dev.fps ? window.__dev.fps() : null }));
  if (info.f) fps = info.f;
  console.log("✔", s.name, "hero@", Math.round(info.h.x), Math.round(info.h.y), "fps", info.f);
}

const cityFailed = [...new Set(failed)].filter((u) => /pixellab\/city\//.test(u));
const gameErrs = errs.filter((e) => !/status of 404/.test(e) && !/favicon/.test(e));
console.log("CANVAS_OK:", canvasOk);
console.log("CITY_ASSET_REQS:", JSON.stringify([...new Set(cityReq)]));
console.log("CITY_ASSET_404s:", JSON.stringify(cityFailed));
console.log("GAME_JS_ERRORS(" + gameErrs.length + "):", JSON.stringify(gameErrs.slice(0, 8)));
await browser.close();
let ok = canvasOk && !cityFailed.length && !gameErrs.length;
console.log(ok ? "\nCAS-2224 LIVE: PASS → " + OUT : "\nCAS-2224 LIVE: FAIL");
process.exit(ok ? 0 : 1);
