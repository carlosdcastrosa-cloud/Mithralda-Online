// ===========================================================================
// CAS-492 — mobile 390px HUD overlap QA. Extends the CAS-414/416 overlap matrix
//   down to 390px (iPhone 12/13/14 CSS width) where the non-touch canvas widgets
//   (spell bar, consumable slot, minimap, quest/hunt trackers, OBJETIVO banner)
//   plus the DOM console panel get cramped and collide.
//
//   Same acceptance model as cas414-ui-audit: pairwise overlap of visible DOM
//   panels + canvas widgets (via gated window.__uiRects), offscreen check, and
//   the equip-chip containment gate. Adds 390x844 + 360x780 narrow viewports.
//
//   Runs against a LOCAL static server by default (iterate without deploying);
//   pass a URL to point it at live:  node tools/cas492-mobile390-qa.mjs [URL]
//   Exit 1 on any overlap / offscreen / uncontained chip / pageerror.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS, startServer, ROOT } from "./harness.mjs";
import fs from "node:fs";

const ARG = process.argv[2];
const OUT = "shots/cas492";
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let srv = null, LIVE;
if (ARG && /^https?:/.test(ARG)) { LIVE = ARG.replace(/\/$/, ""); }
else { srv = await startServer(ROOT); LIVE = srv.url.replace(/\/$/, ""); }
console.log(`… CAS-492 mobile-390 overlap QA against ${LIVE}`);

const exe = findChromium();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

// narrow-first matrix — the new mobile widths are the point of this gate, the
// wide ones are a regression anchor so a 390px fix can't break desktop.
const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },   // iPhone 12/13/14
  { name: "360x780", width: 360, height: 780 },   // small Android
  { name: "412x915", width: 412, height: 915 },   // Pixel-class
  { name: "800x600", width: 800, height: 600 },   // regression anchor (CAS-416)
];

let failures = 0;
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
  if (vp === VIEWPORTS[0]) console.log(`   build = ${build}`);

  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS492";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
  await key("Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  // arm the render.js audit-rect export (CAS-416), let it publish a few frames
  await page.evaluate(() => { window.__uiAudit = true; });
  await wait(900);

  const report = await page.evaluate(() => {
    const SEL = ["#hud .p-stat", "#hud .p-doll", "#hud .p-bag", "#hud .p-con", "#hud .cap", "#hud .chips", "#hud .drawerBtn"];
    const rects = [];
    for (const sel of SEL) { const e = document.querySelector(sel); if (!e) continue;
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none")
        rects.push({ id: "dom:" + sel.replace("#hud .", ""), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }); }
    const cr = window.__uiRects || {};
    for (const k of Object.keys(cr)) rects.push({ id: "cv:" + k, ...cr[k] });
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 4 && oy > 4) overlaps.push({ a: a.id, b: b.id, ox, oy });
    }
    // CAS-1174: the paperdoll/backpack rail panels live in the ≤639px slide-out drawer;
    // when it's CLOSED they're intentionally parked off the right edge (translateX(112%)).
    // That's the correct mobile pattern, so exclude them from the offscreen gate here.
    const DRAWER = new Set(["dom:p-doll", "dom:p-bag"]);
    const offscreen = rects.filter((r) => !DRAWER.has(r.id) &&
      (r.x < -2 || r.y < -2 || r.x + r.w > innerWidth + 2 || r.y + r.h > innerHeight + 2));
    const doll = document.querySelector("#hud .p-doll");
    const dr = doll ? doll.getBoundingClientRect() : null;
    const chipsOut = [];
    if (dr) for (const c of document.querySelectorAll("#hud .w-doll .slot")) { const r = c.getBoundingClientRect();
      if (r.left < dr.left - 1 || r.top < dr.top - 1 || r.right > dr.right + 1 || r.bottom > dr.bottom + 1)
        chipsOut.push({ chip: c.textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }); }
    return { rects, overlaps, offscreen, chipsOut };
  });
  fs.writeFileSync(`${OUT}/rects-${vp.name}.json`, JSON.stringify(report, null, 2));
  await page.screenshot({ path: `${OUT}/play-${vp.name}.png` });

  const bad = report.overlaps.length + report.offscreen.length + report.chipsOut.length + errs.length;
  if (bad) failures++;
  console.log(`   ${vp.name}: ${report.rects.length} widgets, ${report.overlaps.length} overlaps, ${report.offscreen.length} offscreen, ${report.chipsOut.length} chips-out, ${errs.length} pageerrors ${bad ? "✗" : "✓"}`);
  for (const o of report.overlaps) console.log(`     OVERLAP ${o.a}  ×  ${o.b}  (${o.ox}x${o.oy}px)`);
  for (const o of report.offscreen) console.log(`     OFFSCREEN ${o.id} @${o.x},${o.y} ${o.w}x${o.h}`);
  for (const o of report.chipsOut) console.log(`     CHIP-OUT ${o.chip} @${o.x},${o.y} ${o.w}x${o.h}`);
  for (const e of errs) console.log(`     ${e}`);
  await ctx.close();
}
await browser.close();
if (srv) srv.close();
console.log((failures ? "FAIL" : "PASS") + " → " + OUT);
process.exit(failures ? 1 : 0);
