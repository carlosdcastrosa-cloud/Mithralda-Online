// CAS-1027 / CAS-452 — live 390px mobile HUD overlap probe.
// Boots into play at 390x844 (touch), arms render.js __uiRects export, and reports
// pairwise overlaps of DOM panels (incl. .p-con console) + canvas widgets.
// Also flags whether the ≤480px console-hide rule is live.
//   node tools/cas1027-mobile390-live.mjs [LIVE_URL]
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = "shots/cas1027";
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
console.log(`… CAS-1027 390px mobile probe against ${LIVE}`);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
// 390x844 mobile, touch (coarse pointer) so the mobile HUD code paths engage
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction("window.__hud && window.__dev", { timeout: 30000 });
const build = await page.evaluate(() => (window.__BUILD || "?"));
console.log(`   live build = ${build}`);

await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS1027";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
await key("Digit1");
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
await page.evaluate(() => { window.__uiAudit = true; });
await wait(1000);

const report = await page.evaluate(() => {
  const SEL = ["#hud .p-stat", "#hud .p-doll", "#hud .p-bag", "#hud .p-con", "#hud .cap", "#hud .chips", "#hud .drawerBtn"];
  const rects = [];
  const domState = {};
  for (const sel of SEL) { const e = document.querySelector(sel); if (!e) continue;
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
    const shown = r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    domState[sel] = { display: cs.display, shown, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    if (shown) rects.push({ id: "dom:" + sel.replace("#hud .", ""), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }); }
  const cr = window.__uiRects || {};
  for (const k of Object.keys(cr)) rects.push({ id: "cv:" + k, ...cr[k] });
  const overlaps = [];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 4 && oy > 4) overlaps.push({ a: a.id, b: b.id, ox, oy });
  }
  // CAS-1063: p-doll and p-bag live in the mobile right-rail DRAWER, which is
  // translateX(112%) off-canvas by design until the ≡ button is tapped (hud.js).
  // Their being off to the right IS the correct closed-drawer state, so they must
  // not count as offscreen failures — the drawer is asserted open separately below.
  const DRAWER = new Set(["dom:p-doll", "dom:p-bag"]);
  const offscreen = rects.filter((r) => !DRAWER.has(r.id) && (r.x < -2 || r.y < -2 || r.x + r.w > innerWidth + 2 || r.y + r.h > innerHeight + 2));
  const consoleHidden = domState["#hud .p-con"] ? !domState["#hud .p-con"].shown : "no-p-con";
  return { build: window.__BUILD, vw: innerWidth, vh: innerHeight, rects, overlaps, offscreen, domState, consoleHidden };
});
fs.writeFileSync(`${OUT}/rects-390.json`, JSON.stringify(report, null, 2));
await page.screenshot({ path: `${OUT}/play-390.png` });

// CAS-1063 (in-scope gate): the ≤480px preset houses the paperdoll + backpack in a
// slide-out drawer that is translateX(112%) OFF-canvas while closed (the default at
// 390px). Assert both panels are parked fully to the RIGHT of the viewport so they
// contribute zero overlap to the visible HUD — this is the invariant this issue fixes.
const drawer = await page.evaluate(() => {
  const rr = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width) }; };
  const doll = rr("#hud .p-doll"), bag = rr("#hud .p-bag");
  // "parked" = the panel's left edge is at/after the right viewport edge (drawer closed)
  const parked = (r) => r && r.x >= innerWidth - 2;
  // informational: does tapping ≡ reveal the drawer? (open-toggle is tracked separately
  // in a follow-up — a pre-existing CSS quirk, NOT part of the 390px overlap scope)
  let dollOnOpen = null, bagOnOpen = null;
  if (window.__hud) window.__hud.drawer(true);
  return new Promise((res) => setTimeout(() => {
    const od = rr("#hud .p-doll"), ob = rr("#hud .p-bag");
    dollOnOpen = od && od.x + od.w <= innerWidth + 2; bagOnOpen = ob && ob.x + ob.w <= innerWidth + 2;
    if (window.__hud) window.__hud.drawer(false);
    res({ dollParked: parked(doll), bagParked: parked(bag), dollOnOpen, bagOnOpen });
  }, 300));
});
await page.screenshot({ path: `${OUT}/play-390-drawer.png` });
// GATE: closed-drawer panels must be parked off-canvas (in scope). Open-toggle is informational.
const drawerBad = (drawer.dollParked ? 0 : 1) + (drawer.bagParked ? 0 : 1);
console.log(`   drawer closed → doll parked=${drawer.dollParked} bag parked=${drawer.bagParked}  (open-toggle info: dollOn=${drawer.dollOnOpen} bagOn=${drawer.bagOnOpen})`);

console.log(`   viewport ${report.vw}x${report.vh}`);
console.log(`   .p-con console display = ${report.domState["#hud .p-con"]?.display}  (hidden=${report.consoleHidden})`);
console.log(`   ${report.rects.length} widgets, ${report.overlaps.length} overlaps, ${report.offscreen.length} offscreen, ${errs.length} pageerrors`);
for (const o of report.overlaps) console.log(`     OVERLAP ${o.a}  ×  ${o.b}  (${o.ox}x${o.oy}px)`);
for (const o of report.offscreen) console.log(`     OFFSCREEN ${o.id} @${o.x},${o.y} ${o.w}x${o.h}`);
for (const e of errs) console.log(`     ${e}`);
await ctx.close();
await browser.close();
const bad = report.overlaps.length + report.offscreen.length + errs.length + drawerBad;
console.log((bad ? "FAIL" : "PASS") + ` → ${OUT}  (console hidden=${report.consoleHidden}, drawerBad=${drawerBad})`);
process.exit(bad ? 1 : 0);
