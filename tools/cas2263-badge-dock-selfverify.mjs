// CAS-2263 — GE self-verify: dock the "Zona segura" pip + "Descanso" bar row BELOW the live minimap
// (parent CAS-2262 sev-4 overlap). Serves the LOCAL working tree so my render.js change is under test.
// Render-only: badgeRowAnchor() now anchors the badge row to the LIVE minimap rect (minimap.bottom+gap,
// left-aligned to minimap.left) on the desktop non-sidebar path; fallback = historic top-right anchor.
//
// Proves:
//   1. INSIDE city safe zone (desktop): the green safe-zone shield ink sits BELOW the drawn minimap frame
//      and is ABSENT from the old top-right spot (no overlap with the map silhouette/blips/zoom buttons).
//   2. Drag the minimap (via __uiLayout._set) to another corner → badge ink follows and stays below it.
//   3. Sidebar ON (minimap leaves the top-right) → badges fall back to the historic top-right anchor.
//   4. 0 JS errors on boot + interaction.
// Usage: node tools/cas2263-badge-dock-selfverify.mjs [tag]   (tag = before|after, default "after")
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "node:fs";

const TAG = process.argv[2] || "after";
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("shots/cas2263", { recursive: true });

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "DockBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}
async function clearCurse(page) {
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => window.__dev.scene()) === "play") return true;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
    await sleep(120);
  }
  return (await page.evaluate(() => window.__dev.scene())) === "play";
}
// Count "green" pixels (safe-zone shield fill rgba(46,120,64) + bright check #8fe6a0) in a CSS clip rect.
// Green is unique to the badge here (the minimap frame/blips/zoom are gold/red/dark) → a reliable position
// marker for where the badge row actually DREW. Returns lit-green count + its topmost Y (CSS px).
async function greenInk(page, VW, rect) {
  return await page.evaluate((vw, R) => {
    const cv = document.querySelector("canvas"); if (!cv) return { n: 0, minY: -1 };
    const g = cv.getContext("2d"); const dpr = cv.width / vw;
    const x = Math.max(0, Math.floor(R.x * dpr)), y = Math.max(0, Math.floor(R.y * dpr));
    const w = Math.min(Math.floor(R.w * dpr), cv.width - x), h = Math.min(Math.floor(R.h * dpr), cv.height - y);
    if (w <= 0 || h <= 0) return { n: 0, minY: -1 };
    const d = g.getImageData(x, y, w, h).data; let n = 0, minRow = h;
    for (let row = 0; row < h; row++) for (let col = 0; col < w; col++) {
      const i = (row * w + col) * 4;
      if (d[i + 3] < 40) continue;
      const r = d[i], gr = d[i + 1], b = d[i + 2];
      if (gr > 70 && gr > r + 14 && gr > b + 18 && r < 185) { n++; if (row < minRow) minRow = row; }
    }
    return { n, minY: n ? Math.round(y / dpr + minRow / dpr) : -1 };
  }, VW, rect);
}
async function mmRect(page) {
  return await page.evaluate(() => {
    const L = window.__uiLayout; const VW = innerWidth;
    return { x: L.cx("minimap", VW - 120 - 12, 120), y: L.cy("minimap", 12, 120), w: 120, h: 120 };
  });
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const A = []; let ok = true;
const P = (n, v) => { A.push([n, v]); if (!v) ok = false; };
try {
  const page = await browser.newPage();
  const VW = 960, VH = 640;
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/.test(t)) errors.push(t); } });
  await page.goto(`${srv.url}/index.html?dev=1`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => { try { window.__uiLayout && window.__uiLayout.reset(); } catch (e) {} });
  await toPlay(page);
  await page.evaluate(() => { window.__dev.daynight && window.__dev.daynight({ phase: 0.5 }); window.__dev.weather && window.__dev.weather(0); });

  const rested = await page.evaluate(() => window.__dev.rested());
  P("RESTED_XP.enabled === true (LIVE)", rested.enabled === true);
  const szMeta = await page.evaluate(() => window.__dev.safeZone());
  P("SAFEZONE.enabled === true (LIVE)", szMeta.enabled === true);
  const bbox = szMeta.bbox, cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2, TS = 32;

  // ---- (1) INSIDE safe zone, default minimap TOP-RIGHT: badges docked BELOW it ----
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), Math.round(cx / TS), Math.round(cy / TS));
  await clearCurse(page);
  await page.evaluate(() => window.__dev.rested({ setPool: 600 }));
  await sleep(300);
  const mm1 = await mmRect(page);
  const mmBottom1 = mm1.y + mm1.h;                       // 120 frame; +2 visual, +10 gap ⇒ anchor at +130
  const belowRect = { x: mm1.x - 2, y: mmBottom1 + 2, w: mm1.w + 6, h: 92 };   // just under the minimap frame
  const oldRect = { x: mm1.x, y: Math.round(VH * 0.03), w: mm1.w, h: 40 };     // the historic top-right spot (over the map)
  const gBelow1 = await greenInk(page, VW, belowRect);
  const gOld1 = await greenInk(page, VW, oldRect);
  P("INSIDE: safe-zone shield ink present BELOW the minimap", gBelow1.n > 6);
  P("INSIDE: old top-right spot CLEAR of shield ink (no map overlap)", gOld1.n < 8);
  P("INSIDE: badge top-Y is below minimap bottom", gBelow1.minY > mmBottom1);
  await page.screenshot({ path: `shots/cas2263/${TAG}-hud.png` });
  await page.screenshot({ path: `shots/cas2263/${TAG}-rightcol.png`, clip: { x: VW - 150, y: 0, width: 150, height: 320 } });

  // ---- (2) DRAG the minimap to the LEFT (simulated) → badges follow, stay below ----
  await page.evaluate(() => window.__uiLayout._set("minimap", 40, 200));
  await sleep(250);
  const mm2 = await mmRect(page);
  const mmBottom2 = mm2.y + mm2.h;
  const gBelow2 = await greenInk(page, VW, { x: mm2.x - 2, y: mmBottom2 + 2, w: mm2.w + 6, h: 92 });
  P("DRAG: minimap moved (rect x≈40,y≈200)", Math.abs(mm2.x - 40) < 3 && Math.abs(mm2.y - 200) < 3);
  P("DRAG: shield ink follows below the moved minimap", gBelow2.n > 8 && gBelow2.minY > mmBottom2);
  await page.screenshot({ path: `shots/cas2263/${TAG}-dragged.png` });

  // ---- (3) SIDEBAR ON → minimap leaves the top-right → badges fall back to top-right anchor ----
  await page.evaluate(() => { window.__uiLayout.reset(); window.__uiLayout.setSidebar(true); });
  await sleep(400);
  const sidebarOn = await page.evaluate(() => window.__uiLayout.sidebarOn());
  // fallback anchor: bx=gx-118, by=VH*0.055 → shield lands top-right of the game area (left of the sidebar)
  const gFallback = await greenInk(page, VW, { x: 0, y: 0, w: VW, h: 90 });
  P("SIDEBAR: sidebar layout active", sidebarOn === true);
  P("SIDEBAR (fallback): shield still renders near top (badges not lost)", gFallback.n > 20);
  await page.screenshot({ path: `shots/cas2263/${TAG}-sidebar-fallback.png` });
  await page.evaluate(() => { window.__uiLayout.setSidebar(false); window.__uiLayout.reset(); });

  P("0 JS errors", errors.length === 0);

  console.log(`\nCAS-2263 badge-dock self-verify [${TAG}] (LOCAL working tree)\n`);
  for (const [n, v] of A) console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`);
  if (errors.length) console.log("\n  errors:", errors.slice(0, 5));
  console.log(`\n  mm1=${JSON.stringify(mm1)} mmBottom1=${mmBottom1}`);
  console.log(`  gBelow1=${JSON.stringify(gBelow1)} gOld1=${JSON.stringify(gOld1)}`);
  console.log(`  mm2=${JSON.stringify(mm2)} gBelow2=${JSON.stringify(gBelow2)}`);
  console.log(`  gFallback=${JSON.stringify(gFallback)}`);
} finally { await browser.close(); await srv.close(); }
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
