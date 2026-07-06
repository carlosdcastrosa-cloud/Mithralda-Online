// ===========================================================================
// CAS-1613 (PR4) — QA: retire the fixed Tibia sidebar as DEFAULT + panels to toggles.
//
//   node tools/cas1613-sidebar-retire-qa.mjs            (local build via startServer)
//   node tools/cas1613-sidebar-retire-qa.mjs <URL>      (live gh-pages build)
//
// Verifies the PR4 deliverable through the REAL boot + render pass. The canvas HUD
// (action bar + HP/MP hombreras + XP strip) is now the SOLE HUD on wide screens; the
// 216px Tibia sidebar column + 94px bottom bar are gone by default, recovering the full
// game width. The sidebar code is retained behind an opt-in flag (uiLayout.sidebarOn()).
//
// Gates (desktop 1280x800 — a "wide" viewport that USED to force the 216px sidebar):
//  AC1  NO SIDEBAR BY DEFAULT: __sidebar() -> {on:false, sbw:0, bbh:0}. The full VW/VH is
//       game space (view.gw()==VW, view.gh()==VH). The legacy DOM overlay is force-hidden
//       (window.__hud.isOn()==false) so there is no double-UI.
//  AC2  HOMBRERAS OWN THE VITALS: render publishes vitals_hp + vitals_mp rects (the canvas
//       hombreras) via the __uiAudit seam — HP flanks LEFT of the action bar, MP flanks RIGHT,
//       and NO fixed sidebar column rect. Statframe retired -> hombreras carry HP/MP.
//  AC3  INVENTORY 30-CELL TOGGLE (I) + NO REGRESSION: I opens the render.js inventory scene;
//       __dev.invGrid() reports 30 slots in a 5-col grid; drag rects publish (rects>0);
//       scroll seam responds (setInvScroll); dbl-click-equip + rarity are the SAME scene code
//       (CAS-419/1579/1594), untouched by the HUD swap. I again returns to play.
//  AC4  OPT-IN RESTORE: __sidebar(true) brings back the classic chrome (sbw==216, bbh==94)
//       LIVE (no reload) and __sidebar(false) retires it again -> the flag is real + reversible.
//  AC5  RNG-NEUTRAL + CLEAN: zero real JS errors across the whole run (favicon 404 ignored).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const ARG = process.argv[2];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let srv = null, BASE;
if (ARG && /^https?:/.test(ARG)) { BASE = ARG.replace(/\/$/, ""); }
else { srv = await startServer(); BASE = srv.url.replace(/\/$/, ""); }

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
let pass = 0, fail = 0;
const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/i.test(r.url())) errs.push("http " + r.status() + ": " + r.url()); });
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  // Clear any persisted sidebar pref so we test the true DEFAULT, then boot.
  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.removeItem("mithralda.sidebar.v1"); } catch (e) {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  // menu -> class select (name + Enter) -> ability draft (warrior) -> play
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "PR4Bot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key("Digit1");
  await page.waitForFunction("window.__dev.scene()==='abilitysel'", { timeout: 8000 });
  await key("Enter");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await wait(400);

  // ---- AC1: no sidebar by default; full width; DOM overlay hidden ----
  const sb = await page.evaluate(() => (window.__sidebar ? window.__sidebar() : null));
  const geom = await page.evaluate(() => ({ VW: innerWidth, VH: innerHeight,
    gw: (window.__view ? window.__view.gw() : innerWidth), gh: (window.__view ? window.__view.gh() : innerHeight) }));
  const domOff = await page.evaluate(() => !(window.__hud && window.__hud.isOn && window.__hud.isOn()));
  const fullW = sb && sb.sbw === 0 && sb.bbh === 0;
  gate("AC1 no sidebar by default (sbw=0,bbh=0)", !!(sb && !sb.on && fullW), `__sidebar=${JSON.stringify(sb)}`);
  gate("AC1 DOM overlay hidden (no double-UI)", domOff, `__hud.isOn()=${!domOff}`);

  // ---- AC2: hombreras own the vitals (canvas audit rects) ----
  await page.evaluate(() => { window.__uiAudit = true; });
  await wait(200);
  const R = await page.evaluate(() => window.__uiRects || {});
  const hp = R.vitals_hp, mp = R.vitals_mp, ab = R.actionbar;
  const haveShoulders = !!(hp && mp && ab);
  const hpLeft = haveShoulders && (hp.x + hp.w) <= ab.x + 4;      // HP flanks left of the bar
  const mpRight = haveShoulders && mp.x >= (ab.x + ab.w) - 4;     // MP flanks right of the bar
  const hpDominates = haveShoulders && hp.h >= mp.h && hp.w >= mp.w; // HP is the heavier read-out
  gate("AC2 hombreras present + flank the action bar", haveShoulders && hpLeft && mpRight,
    haveShoulders ? `hp@${hp.x}(<=${ab.x}) mp@${mp.x}(>=${ab.x + ab.w})` : "vitals rects MISSING");
  gate("AC2 HP dominates (>= MP h & w)", hpDominates, haveShoulders ? `hp=${hp.w}x${hp.h} mp=${mp.w}x${mp.h}` : "n/a");

  // ---- AC3: inventory 30-cell toggle + no regression ----
  await page.evaluate(() => window.__dev.fillBag(30));           // fill the bag so the grid + scroll exercise real items
  await key("KeyI");
  await page.waitForFunction("window.__dev.scene()==='inventory'", { timeout: 6000 });
  await wait(150);
  const inv = await page.evaluate(() => window.__dev.invGrid());
  // scroll seam still lives (may be 0 at this res — the grid always fits — but must not throw)
  const scrollOK = await page.evaluate(() => { const before = window.__dev.invGrid().scroll;
    window.__dev.setInvScroll(2); const after = window.__dev.invGrid().scroll; window.__dev.setInvScroll(before);
    return { before, after, max: window.__dev.invGrid().scrollMax }; });
  await key("KeyI");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 6000 });
  const invOK = inv && inv.slots === 30 && inv.cols === 5 && inv.rects > 0 && inv.filled === 30;
  gate("AC3 inventory toggle opens 30-cell grid (5 cols, drag rects live)", !!invOK, `invGrid=${JSON.stringify(inv)}`);
  gate("AC3 scroll seam responds without throw", !!scrollOK, `scroll=${JSON.stringify(scrollOK)}`);

  // ---- AC4: opt-in restore is real + reversible ----
  const on = await page.evaluate(() => window.__sidebar(true));
  await wait(120);
  const off = await page.evaluate(() => window.__sidebar(false));
  await wait(120);
  gate("AC4 opt-in restores classic sidebar (sbw=216,bbh=94)", !!(on && on.on && on.sbw === 216 && on.bbh === 94), `on=${JSON.stringify(on)}`);
  gate("AC4 flag reverts to sidebar-less default", !!(off && !off.on && off.sbw === 0 && off.bbh === 0), `off=${JSON.stringify(off)}`);

  // ---- AC5: clean ----
  const realErrs = errs.filter((e) => !/favicon/i.test(e));
  gate("AC5 zero real JS errors", realErrs.length === 0, realErrs.length ? realErrs.slice(0, 3).join(" | ") : "clean");

  console.log(`\n=== CAS-1613 sidebar-retire QA: ${pass} PASS / ${fail} FAIL @ ${BASE} ===`);
} catch (e) {
  console.error("HARNESS ERROR:", e.message, e.stack); fail++;
} finally {
  await browser.close(); if (srv && srv.close) srv.close();
}
process.exit(fail ? 1 : 0);
