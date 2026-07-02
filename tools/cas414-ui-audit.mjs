// ===========================================================================
// CAS-414 — CTO first-hand audit of the live HUD before decomposition.
//   Screenshots play HUD + inventory modal at 1920x1080 / 1366x768 / 800x600,
//   and dumps #hud panel bounding rects + pairwise overlap report per viewport.
//   node tools/cas414-ui-audit.mjs [LIVE_URL]
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = "shots/cas414";
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
console.log(`… CAS-414 audit against ${LIVE}`);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "800x600", width: 800, height: 600 },
];

for (const vp of VIEWPORTS) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__hud && window.__dev", { timeout: 30000 });
  const build = await page.evaluate(() => (window.__BUILD || "?"));
  if (vp.name === "1920x1080") console.log(`   live build = ${build}`);

  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS414";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
  await key("Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  await wait(900);

  // rect dump + pairwise overlap of visible top-level hud widgets
  const report = await page.evaluate(() => {
    const els = [...document.querySelectorAll("#hud [class*='w-'], #hud .bars, #hud .caption")];
    const rects = els.map((e) => {
      const r = e.getBoundingClientRect();
      return { cls: e.className, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vis: getComputedStyle(e).visibility, disp: getComputedStyle(e).display };
    }).filter((r) => r.w > 0 && r.h > 0 && r.vis !== "hidden" && r.disp !== "none");
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      if (a.cls.includes(b.cls) || b.cls.includes(a.cls)) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 4 && oy > 4) overlaps.push({ a: a.cls, b: b.cls, ox, oy });
    }
    const offscreen = rects.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > innerWidth || r.y + r.h > innerHeight);
    return { rects, overlaps, offscreen };
  });
  fs.writeFileSync(`${OUT}/rects-${vp.name}.json`, JSON.stringify(report, null, 2));
  await page.screenshot({ path: `${OUT}/play-${vp.name}.png` });

  await key("KeyI"); await wait(600);
  await page.screenshot({ path: `${OUT}/inventory-${vp.name}.png` });

  console.log(`   ${vp.name}: ${report.rects.length} widgets, ${report.overlaps.length} overlaps, ${report.offscreen.length} offscreen, ${errs.length} pageerrors`);
  for (const o of report.overlaps) console.log(`     OVERLAP ${o.a}  ×  ${o.b}  (${o.ox}x${o.oy}px)`);
  for (const o of report.offscreen) console.log(`     OFFSCREEN ${o.cls} @${o.x},${o.y} ${o.w}x${o.h}`);
  await ctx.close();
}
await browser.close();
console.log("done → " + OUT);
