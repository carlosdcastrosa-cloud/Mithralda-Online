// CAS-1538 — live FOUNTAINS map verification.
// Boots into play against the live URL, captures the world map (FOUNTAINS tiles),
// verifies clean boot (no JS pageerrors), reports live build + scene transitions.
//   node tools/cas1538-fountains-live.mjs [LIVE_URL]
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = "shots/cas1538";
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
console.log(`… CAS-1538 FOUNTAINS live verify against ${LIVE}`);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("requestfailed", (r) => { const u = r.url(); if (/\.(png|js|json)(\?|$)/.test(u)) errs.push("reqfail: " + u); });
const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);
const keyup = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), c);

await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction("window.__hud && window.__dev", { timeout: 30000 });
const build = await page.evaluate(() => (window.__BUILD || "?"));
console.log(`   live build = ${build}`);
await page.screenshot({ path: `${OUT}/01-boot.png` });

// name -> class-select
await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "QA1538";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
await page.screenshot({ path: `${OUT}/02-classsel.png` });

// pick class 1 -> play
await key("Digit1");
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
await wait(1200);
await page.screenshot({ path: `${OUT}/03-play.png` });

// walk a few tiles to reveal more map (E then S)
for (const [dn, code] of [["E","KeyD"],["S","KeyS"],["W","KeyA"],["N","KeyW"]]) {
  await key(code); await wait(900); await keyup(code); await wait(300);
  await page.screenshot({ path: `${OUT}/map-${dn}.png` });
}

// sample tile ids / world snapshot if exposed
const world = await page.evaluate(() => {
  const d = window.__dev || {};
  const out = { scene: d.scene ? d.scene() : "?", build: window.__BUILD };
  try { if (d.player) { const p = d.player(); out.pos = { x: Math.round(p.x), y: Math.round(p.y) }; } } catch {}
  return out;
});

console.log("   world:", JSON.stringify(world));
console.log(`   pageerrors: ${errs.length}`);
if (errs.length) console.log(errs.slice(0, 10).join("\n"));
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ live: LIVE, build, world, errs }, null, 2));
await browser.close();
console.log(errs.length === 0 ? "PASS: clean boot into FOUNTAINS world" : `FAIL: ${errs.length} errors`);
