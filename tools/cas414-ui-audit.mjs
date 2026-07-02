// ===========================================================================
// CAS-414 — CTO first-hand audit of the live HUD before decomposition.
// CAS-416 — extended to CANVAS widgets: render.js publishes the exact rects it
//   draws (quest/hunt trackers, zone name, OBJETIVO banner, spell bar,
//   consumable slot, minimap, badges) on window.__uiRects when the page sets
//   window.__uiAudit=true. The pairwise overlap + offscreen report now covers
//   DOM panels AND canvas widgets, plus an equip-chip containment gate
//   (every .w-doll .slot must sit inside the .p-doll panel art).
//   Screenshots play HUD + inventory modal at 1920x1080 / 1366x768 / 800x600.
//   node tools/cas414-ui-audit.mjs [LIVE_URL]
// Exit code 1 when any viewport reports overlaps / offscreen / uncontained chips.
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
  if (vp.name === "1920x1080") console.log(`   live build = ${build}`);

  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "CAS414";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
  await key("Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  // CAS-416: arm the render.js audit-rect export, give it a couple frames to publish
  await page.evaluate(() => { window.__uiAudit = true; });
  await wait(900);

  // rect dump + pairwise overlap of visible DOM panels + canvas widgets
  const report = await page.evaluate(() => {
    // DOM: top-level visual surfaces only. Interior wells (.w-*) nest INSIDE their
    // panel by design, so they'd be false-positive "overlaps"; the chip-containment
    // gate below covers the one interior alignment contract that matters (CAS-416).
    const SEL = ["#hud .p-stat", "#hud .p-doll", "#hud .p-bag", "#hud .p-con", "#hud .cap", "#hud .chips", "#hud .drawerBtn"];
    const rects = [];
    for (const sel of SEL) { const e = document.querySelector(sel); if (!e) continue;
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none")
        rects.push({ id: "dom:" + sel.replace("#hud .", ""), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }); }
    // CANVAS: exact rects render.js just drew (gated export, CAS-416)
    const cr = window.__uiRects || {};
    for (const k of Object.keys(cr)) rects.push({ id: "cv:" + k, ...cr[k] });
    const overlaps = [];
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 4 && oy > 4) overlaps.push({ a: a.id, b: b.id, ox, oy });
    }
    const offscreen = rects.filter((r) => r.x < -2 || r.y < -2 || r.x + r.w > innerWidth + 2 || r.y + r.h > innerHeight + 2);
    // CAS-416 acceptance gate: every equip chip contained by the paperdoll panel art
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

  await key("KeyI"); await wait(600);
  await page.screenshot({ path: `${OUT}/inventory-${vp.name}.png` });

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
console.log((failures ? "FAIL" : "PASS") + " → " + OUT);
process.exit(failures ? 1 : 0);
