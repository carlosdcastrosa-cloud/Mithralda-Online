// ---------------------------------------------------------------------------
// CAS-1612 PR3 — headless UI audit: XP full-width strip + minimap top-right + boon chips.
//
// Boots the real game in headless Chromium, drives menu -> class -> draft -> play,
// flips window.__uiAudit on so renderHUD publishes the EXACT rects it drew onto
// window.__uiRects, then asserts:
//   [AC1] xpbar    — full-width strip pegged to the bottom edge (x≈0, w≈VW, y≈VH-barH)
//   [AC2] minimap  — top-right by default (x≈VW-mw-12, y≈12)
//   [AC2b] minimap — Reset (uiLayout.reset) restores it top-right
//   [AC3] boonChips— a top-left chip row appears once a run-boon is owned
// Zero sim/rng reads asserted structurally: only render.js changed (UI-only).
//
// Run: node tools/cas1612-ui-audit.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

// 880 < SIDEBAR_MIN(900) → the DOM-HUD path (view.sbw=0), where the CAS-1612 reposition
// defaults live (the floating minimap + boon chips). ≥900 docks the minimap in the right
// sidebar (unchanged); that path retires in CAS-1613. xpbar is full-width in BOTH.
const VW = 880, VH = 720;
const log = (m) => console.log(m);
let ok = true;
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // boot: menu -> classsel -> abilitysel -> play (mirrors smoke.mjs)
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); i.value = "AuditBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='abilitysel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  pass("booted to play");

  // capture the drawn rects: turn on the audit flag and let ≥2 frames render
  const grabRects = async () => {
    await page.evaluate(() => { window.__uiAudit = true; window.__uiRects = null; });
    await page.waitForFunction("window.__uiRects && window.__uiRects.xpbar", { timeout: 3000 });
    return page.evaluate(() => window.__uiRects);
  };

  let r = await grabRects();

  // [AC1] XP full-width strip on the bottom edge
  const xp = r.xpbar;
  if (xp && near(xp.x, 0) && near(xp.w, VW) && xp.h <= 10 && near(xp.y, VH - xp.h))
    pass(`[AC1] xpbar full-width bottom strip: x=${xp.x} w=${xp.w} h=${xp.h} y=${xp.y} (VH-h=${VH - xp.h})`);
  else fail(`[AC1] xpbar wrong: ${JSON.stringify(xp)} (want x≈0 w≈${VW} y≈${VH - (xp ? xp.h : 9)})`);

  // [AC2] minimap top-right by default
  const mm = r.minimap; // AR published as x-2,y-2,mw+4,mh+4 → inner mw≈120
  const mw = mm ? mm.w - 4 : 120;
  if (mm && near(mm.x, VW - mw - 12 - 2, 4) && near(mm.y, 12 - 2, 4))
    pass(`[AC2] minimap top-right: x=${mm.x} y=${mm.y} (expect x≈${VW - mw - 14} y≈10)`);
  else fail(`[AC2] minimap not top-right: ${JSON.stringify(mm)}`);

  // [AC2b] Reset restores minimap top-right (drag it away, reset, re-audit)
  await page.evaluate(() => { window.__uiLayout._set("minimap", 40, 400); });
  r = await grabRects();
  const moved = r.minimap;
  const wasMoved = moved && near(moved.y, 400 - 2, 4);
  await page.evaluate(() => { window.__uiLayout.reset(); });
  r = await grabRects();
  const rst = r.minimap;
  if (wasMoved && rst && near(rst.y, 12 - 2, 4) && near(rst.x, VW - mw - 14, 4))
    pass(`[AC2b] Reset restores minimap top-right: y ${moved.y}→${rst.y}, x=${rst.x}`);
  else fail(`[AC2b] Reset did not restore top-right: moved=${JSON.stringify(moved)} reset=${JSON.stringify(rst)}`);

  // [AC3] boon chips appear top-left once a run-boon is owned
  const before = (await grabRects()).boonChips || null;
  await page.evaluate(() => { window.__dev.grantBoon("ember"); window.__dev.grantBoon("stone"); });
  r = await grabRects();
  const bc = r.boonChips;
  if (!before && bc && bc.x <= 14 && bc.w > 0 && bc.y < VH / 2)
    pass(`[AC3] boon chips top-left after grant: ${JSON.stringify(bc)} (was absent before)`);
  else fail(`[AC3] boon chips wrong: before=${JSON.stringify(before)} after=${JSON.stringify(bc)}`);

  if (errors.length) { fail(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else pass("zero page errors");
} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

if (!ok) { console.error("\n✖ CAS-1612 UI AUDIT FAILED."); process.exit(1); }
console.log("\n✅ CAS-1612 UI AUDIT PASS — XP full-width + minimap top-right (+Reset) + boon chips top-left.");
