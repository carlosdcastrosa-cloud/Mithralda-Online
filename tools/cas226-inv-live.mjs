// ---------------------------------------------------------------------------
// CAS-226 — Tibia-style inventory LIVE harness. Boots the REAL game headless and
// drives the inventory panel through the SAME sim + render paths the player uses
// (createHero → __dev.openInv() → render.js renderInventory), asserting BOTH
// deliverables of the founder request:
//
//   PORTRAIT (entregable 2): the inventory shows the player's REAL class, ANIMATED
//     idle, via the same baked per-state strip (clshero_<cls>) the world uses —
//     NOT a fixed placeholder. Verified by: (a) the portrait box has hero pixels,
//     (b) its signature CHANGES over time (idle anim is playing), (c) a mage
//     portrait DIFFERS from a warrior portrait (it tracks the chosen class).
//
//   SLOTS (entregable 1): Tibia-style equip slots flank the portrait. The 3
//     functional data-driven slots (arma/cuerpo/escudo) render the equipped item
//     (rarity-coloured border + glyph + stat) — clearly brighter than an empty
//     placeholder slot (cabeza), proving the slot grid is wired to h.equip.
//
//   PERF + ERRORS: 60fps with the panel open, 0 JS errors.
//
// Run: npm run cas226-inv   (or: node tools/cas226-inv-live.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page, digit) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "InvBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: d, key: d, bubbles: true })), digit);
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}
// The renderInventory layout, replicated so the harness reads the SAME rects the
// renderer draws. Mirrors render.js renderInventory() exactly (CAS-226).
function layout(VW, VH) {
  const bw = Math.min(VW * 0.9, 560), bh = Math.min(VH * 0.85, 470), x = (VW - bw) / 2, y = (VH - bh) / 2;
  const leftW = bw * 0.5, SS = Math.min(40, Math.round(bh * 0.085)), rgap = SS + 19;
  const sy0 = y + 78, lx = x + 18;
  const px = x + leftW / 2, pTop = y + 72, pW = Math.min(92, leftW - SS * 2 - 72), pH = Math.min(150, Math.round(bh * 0.34));
  const hy = pTop + pH + 22, hgap = 10;
  return {
    portrait: { x: px - pW / 2, y: pTop, w: pW, h: pH },
    slotHead: { x: lx, y: sy0 + 0 * rgap, w: SS, h: SS },         // empty placeholder
    slotBody: { x: lx, y: sy0 + 1 * rgap, w: SS, h: SS },         // functional (torso)
    slotWeapon: { x: px + hgap / 2, y: hy, w: SS, h: SS },        // functional (arma)
    slotShield: { x: px - SS - hgap / 2, y: hy, w: SS, h: SS },   // functional (escudo)
  };
}
// Summarise a screen rect: opaque pixel count (anything drawn), bright pixel
// count (luma>90 — equipped gear / lit hero), peak luma, and a weighted colour
// checksum (used to detect frame-to-frame motion + class differences).
async function readRect(page, r) {
  return await page.evaluate((r) => {
    const c = document.querySelector("canvas"); const g = c.getContext("2d");
    const d = g.getImageData(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)).data;
    let opaque = 0, bright = 0, maxLum = 0, csum = 0;
    for (let i = 0; i < d.length; i += 4) {
      const rr = d[i], gg = d[i + 1], bb = d[i + 2];
      const lum = 0.3 * rr + 0.6 * gg + 0.1 * bb;
      if (rr + gg + bb > 40) opaque++;
      if (lum > 90) bright++;
      if (lum > maxLum) maxLum = lum;
      csum += rr + gg * 2 + bb * 3;
    }
    return { opaque, bright, maxLum: Math.round(maxLum), csum };
  }, r);
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  await page.evaluateOnNewDocument(() => {
    try { if (!sessionStorage.getItem("__booted")) { localStorage.removeItem("mithralda.save.v1"); sessionStorage.setItem("__booted", "1"); } } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // ---- WARRIOR: open the inventory, let the portrait strip bake + animate ----
  await enterPlay(page, "Digit1");
  await page.evaluate(() => window.__dev.openInv());
  await page.waitForFunction("window.__dev.scene() === 'inventory'", { timeout: 3000 });
  await wait(450); // let clshero_<cls> bake + a few idle frames render
  // read the canvas dims only once the game is fully booted + rendering (the
  // canvas is its default 300×150 until the first resize tick), then mirror the
  // renderInventory layout to locate the portrait + slot rects.
  const VW = await page.evaluate(() => document.querySelector("canvas").width);
  const VH = await page.evaluate(() => document.querySelector("canvas").height);
  const L = layout(VW, VH);

  // (1) PORTRAIT DRAWN — the box holds a lit hero silhouette (not an empty box).
  const pA = await readRect(page, L.portrait);
  if (pA.bright > 300 && pA.maxLum > 160) pass(`[PORTRAIT] warrior portrait renders a lit hero (${pA.bright} bright px, peak luma ${pA.maxLum})`);
  else fail(`[PORTRAIT] portrait box looks empty/dark: ${pA.bright} bright px, peak luma ${pA.maxLum}`);

  // (2) PORTRAIT ANIMATED — the idle strip cycles frames, so the portrait's colour
  //     checksum takes ≥2 distinct values across ~1.2s (a static placeholder cannot).
  const csums = [pA.csum];
  for (let i = 0; i < 12; i++) { await wait(95); csums.push((await readRect(page, L.portrait)).csum); }
  const distinct = new Set(csums).size, range = Math.max(...csums) - Math.min(...csums);
  if (distinct >= 2 && range > 1000) pass(`[PORTRAIT] idle animation is live — ${distinct} distinct frames over ~1.2s (Δcsum=${range})`);
  else fail(`[PORTRAIT] portrait looks static (no idle frames): ${distinct} distinct, range=${range}`);

  // (4) SLOTS WIRED — the functional arma/cuerpo/escudo slots show the equipped
  //     item (rarity-coloured border+glyph+stat) and are clearly brighter than the
  //     empty Cabeza placeholder slot — proving the grid is wired to h.equip.
  const wSlot = await readRect(page, L.slotWeapon);
  const bSlot = await readRect(page, L.slotBody);
  const sSlot = await readRect(page, L.slotShield);
  const headSlot = await readRect(page, L.slotHead);
  const fnBright = Math.min(wSlot.bright, bSlot.bright, sSlot.bright);
  if (fnBright > headSlot.bright + 50 && headSlot.bright < 50)
    pass(`[SLOTS] arma/cuerpo/escudo render equipped gear (bright px W=${wSlot.bright} B=${bSlot.bright} S=${sSlot.bright}) vs empty Cabeza=${headSlot.bright}`);
  else fail(`[SLOTS] functional slots not distinguishable from empty: fnBright=${fnBright} head=${headSlot.bright}`);
  // empty placeholder still drawn (dim glyph/label present, just not bright)
  if (headSlot.opaque > 50 && headSlot.maxLum < 110) pass(`[SLOTS] empty placeholder slots are drawn dim (Cabeza ${headSlot.opaque} opaque px, peak luma ${headSlot.maxLum})`);
  else fail(`[SLOTS] empty placeholder slot wrong: ${headSlot.opaque} opaque px, peak luma ${headSlot.maxLum}`);

  // (5) PERF + ERRORS with the inventory open.
  const fps = await sampleFps(page, 1000);
  if (fps >= 58) pass(`[PERF] ${fps} fps with the inventory open (≥58)`);
  else fail(`[PERF] only ${fps} fps with the inventory open`);

  // (3) PORTRAIT TRACKS CLASS — open a FRESH page, enter as MAGE; the portrait's
  //     checksum differs from the warrior's (REAL chosen class, not a fixed art).
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push(`pageerror(p2): ${e.message}`));
  await page2.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    window.__frames = 0; const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page2.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page2.bringToFront();
  await enterPlay(page2, "Digit3"); // mage
  await page2.evaluate(() => window.__dev.openInv());
  await page2.waitForFunction("window.__dev.scene() === 'inventory'", { timeout: 3000 });
  await wait(450);
  const cls = await page2.evaluate(() => window.__dev.hero().cls);
  const pMage = await readRect(page2, L.portrait);
  const classDelta = Math.abs(pMage.csum - pA.csum);
  if (cls === "mage" && pMage.bright > 200 && classDelta > 20000)
    pass(`[PORTRAIT] portrait tracks the chosen class — mage differs from warrior (Δcsum=${classDelta})`);
  else fail(`[PORTRAIT] portrait does not track class: cls=${cls} mageBright=${pMage.bright} Δcsum=${classDelta}`);

  if (errors.length === 0) pass("[ERRORS] zero page errors across the run");
  else { fail(`[ERRORS] ${errors.length} page error(s)`); errors.slice(0, 6).forEach((e) => console.error("   " + e)); }

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close(); await srv.close();
}
log(ok ? "\n✓ CAS-226 inventory LIVE: all checks passed." : "\n✗ CAS-226 inventory LIVE: FAILURES above.");
process.exit(ok ? 0 : 1);
