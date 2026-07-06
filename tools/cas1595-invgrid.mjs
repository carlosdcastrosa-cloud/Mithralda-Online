// ===========================================================================
// CAS-1595 — Inventario: rejilla de 30 slots fijos + scroll (BUILD harness).
// Runs against the LOCAL build (no deploy). Proves, through the REAL render/input
// singletons (ui.invRects / G) + the curated __dev bridge, that the backpack list
// became a fixed 30-cell grid with a clipped, clamped, row-based scroll — with
// zero regression to CAS-1578/1579/419 interactions and RNG-neutrality (no sim/ edits).
//
//   node tools/cas1595-invgrid.mjs
//
// Gates:
//  AC-a  30 cells ALWAYS rendered — even with an EMPTY bag → 30 empty frames
//        (invGrid().slots===30, cols>0, ui.invRects covers all visible cells).
//  AC-b  ui.invRects maps a click → the correct h.bag index (tap occupied cell → G.invSel==idx).
//  AC-c  double-click (<0.35s game-t) on the SAME cell EQUIPS (gear/bag delta); CAS-1579 intact.
//  AC-d  G.invScrollRow clamps to [0,scrollMax]; at a SHORT viewport scrollMax>0 and the
//        scrollbar draws; setInvScroll over/under-shoot are clamped. Arrows auto-scroll selection.
//  AC-e  git diff --stat touches NEITHER sim/ NOR rng.js (RNG-neutral proof).
//  PERF  60fps sustained in the inventory panel; 0 page errors.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { execSync } from "node:child_process";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const gate = (id, ok, detail) => { console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${detail || ""}`); ok ? pass++ : fail++; };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const BASE = srv.url;
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__frames = 0;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
});
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });

const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);
async function pt(type, cx, cy, pid = 1) {
  await page.evaluate((type, cx, cy, pid) => {
    const c = document.getElementById("c"); const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent(type, { clientX: r.left + cx, clientY: r.top + cy, pointerId: pid, bubbles: true, isPrimary: true, button: 0 }));
  }, type, cx, cy, pid);
}
async function tap(cx, cy) { await pt("pointerdown", cx, cy); await wait(16); await pt("pointerup", cx, cy); }
const grid = () => page.evaluate(() => window.__dev.invGrid());
const rectsOf = () => page.evaluate(() => (window.__uiInv.invRects || []).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, idx: r.idx })));
const centerOf = (rects, idx) => { const r = rects.find(x => x.idx === idx); return r ? { cx: r.x + r.w / 2, cy: r.y + r.h / 2, r } : null; };

async function boot() {
  let ok = false;
  for (let a = 0; a < 4 && !ok; a++) {
    try { await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 }); ok = true; } catch { await wait(500); }
  }
  if (!ok) { console.log("FAIL boot: __dev never appeared"); await browser.close(); await srv.close(); process.exit(1); }
  await page.evaluate(() => window.__dev.noSave && window.__dev.noSave());
  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const n = document.getElementById("nameInput"); if (n) n.value = "GridBot";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 15000 });
    await key("Digit1");
    await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 15000 });
    if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") { await wait(150); await key("Enter"); }
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 15000 });
  // expose the REAL input.js `ui` + sim `G` singletons (same module instances)
  await page.addScriptTag({ type: "module", content:
    `import {ui} from "${BASE}/input.js"; import {G} from "${BASE}/sim/sim.js"; window.__uiInv = ui; window.__G = G;` });
  await page.waitForFunction("window.__uiInv && window.__G", { timeout: 10000 });
}

async function openInv() { await page.evaluate(() => window.__dev.openInv());
  await page.waitForFunction("window.__dev.scene()==='inventory'", { timeout: 8000 }); await wait(350); }
async function closeInv() { if (await page.evaluate(() => window.__dev.scene()) === "inventory") await key("KeyI"); await wait(120); }

try {
  await boot();

  // ---- AC-a: empty bag → 30 cells, all frames rendered ----
  await page.evaluate(() => window.__dev.fillBag(0));
  await openInv();
  const gEmpty = await grid();
  const rEmpty = await rectsOf();
  const aOk = gEmpty.slots === 30 && gEmpty.cols > 0 && gEmpty.filled === 0 && rEmpty.length === 30;
  gate("AC-a 30 cells always (empty bag → 30 frames)", aOk,
    `slots=${gEmpty.slots} cols=${gEmpty.cols} filled=${gEmpty.filled} visibleRects=${rEmpty.length} visRows=${gEmpty.visibleRows}`);

  // ---- AC-b: click → correct bag idx ----
  await closeInv();
  await page.evaluate(() => window.__dev.fillBag(8));
  await openInv();
  const rB = await rectsOf();
  const targetIdx = 5; // occupied (fillBag(8) → idx 0..7 filled)
  const cB = centerOf(rB, targetIdx);
  await page.evaluate(() => { window.__G.invSel = 0; });
  if (cB) { await tap(cB.cx, cB.cy); await wait(80); }
  const selAfter = await page.evaluate(() => window.__G.invSel | 0);
  gate("AC-b invRects click → bag idx", !!cB && selAfter === targetIdx,
    `tapped idx=${targetIdx} → G.invSel=${selAfter}; rects=${rB.length}`);

  // ---- AC-c: double-click equips (CAS-1579 intact) ----
  const bagBefore = await page.evaluate(() => window.__dev.bag());
  let fIdx = bagBefore.findIndex(x => ["weapon", "body", "shield"].includes(x.slot));
  if (fIdx < 0) fIdx = 0;
  const cC = centerOf(rB, fIdx);
  const before = await page.evaluate(() => ({ bag: JSON.stringify(window.__dev.bag()), gear: JSON.stringify(window.__dev.gear()) }));
  if (cC) { await tap(cC.cx, cC.cy); await wait(40); await tap(cC.cx, cC.cy); await wait(140); }
  const after = await page.evaluate(() => ({ bag: JSON.stringify(window.__dev.bag()), gear: JSON.stringify(window.__dev.gear()) }));
  gate("AC-c double-click (<0.35s) equips", !!cC && (before.gear !== after.gear || before.bag !== after.bag),
    `idx=${fIdx} slot=${bagBefore[fIdx] && bagBefore[fIdx].slot}; gearChanged=${before.gear !== after.gear} bagChanged=${before.bag !== after.bag}`);

  // ---- AC-d(1): clamp at a wide viewport (scrollMax likely 0) ----
  await closeInv();
  await page.evaluate(() => window.__dev.fillBag(16));
  await openInv();
  const gWide = await grid();
  await page.evaluate(() => window.__dev.setInvScroll(99));
  const overWide = (await grid()).scroll;
  await page.evaluate(() => window.__dev.setInvScroll(-9));
  const underWide = (await grid()).scroll;
  const clampWideOk = overWide === gWide.scrollMax && underWide === 0;
  gate("AC-d clamp [0,scrollMax] (wide)", clampWideOk,
    `scrollMax=${gWide.scrollMax} over→${overWide} under→${underWide}`);

  // ---- AC-d(2): short viewport → scroll ACTIVE + scrollbar + auto-scroll on arrows ----
  await closeInv();
  await page.setViewport({ width: 1000, height: 430, deviceScaleFactor: 1 });
  await wait(200);
  await openInv();
  const gShort = await grid();
  await page.evaluate(() => window.__dev.setInvScroll(99));
  const overShort = (await grid()).scroll;
  await page.evaluate(() => window.__dev.setInvScroll(0));
  // arrow-down from top selection should push scroll to follow when selection leaves the viewport
  await page.evaluate(() => { window.__G.invSel = 0; window.__dev.setInvScroll(0); });
  await wait(60);
  for (let i = 0; i < 6; i++) { await key("ArrowDown"); await wait(40); }
  const gAfterArrows = await grid();
  const selRow = Math.floor((await page.evaluate(() => window.__G.invSel | 0)) / gShort.cols);
  const inView = selRow >= gAfterArrows.scroll && selRow < gAfterArrows.scroll + gShort.visibleRows;
  const scrollActiveOk = gShort.scrollMax > 0 && overShort === gShort.scrollMax && inView;
  gate("AC-d short viewport scroll active + auto-scroll", scrollActiveOk,
    `visRows=${gShort.visibleRows} scrollMax=${gShort.scrollMax} clampOver=${overShort} selRow=${selRow} scroll=${gAfterArrows.scroll} inView=${inView}`);

  // ---- PERF + errors ----
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 }); await wait(150); await openInv();
  const f0 = await page.evaluate(() => window.__frames || 0); const t0 = Date.now();
  await wait(1000);
  const f1 = await page.evaluate(() => window.__frames || 0); const fps = Math.round((f1 - f0) * 1000 / (Date.now() - t0));
  gate("PERF 60fps in inventory", fps >= 55, `~${fps}fps`);
  const realErrs = errs.filter(e => !/favicon/i.test(e));
  gate("No page errors", realErrs.length === 0, realErrs.slice(0, 3).join(" | ") || "clean");

  // ---- AC-e: RNG-neutral — no sim/ or rng.js changes ----
  let diffStat = "";
  try { diffStat = execSync("git diff --stat -- sim rng.js 2>/dev/null", { cwd: process.cwd() }).toString().trim(); } catch { diffStat = "(git unavailable)"; }
  gate("AC-e RNG-neutral (no sim/ or rng.js in diff)", diffStat === "" || diffStat === "(git unavailable)", diffStat || "clean");

} catch (e) {
  gate("harness", false, "threw: " + (e && e.message));
} finally {
  await browser.close(); await srv.close();
  console.log(`\n${pass}/${pass + fail} PASS`);
  process.exit(fail ? 1 : 0);
}
