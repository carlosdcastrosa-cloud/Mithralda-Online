// ---------------------------------------------------------------------------
// CAS-1565 — altar-render smoke (headless). Proves the v2 altar UI paths render
// WITHOUT throwing: locked Tier-2 state, Tier-2 unlocked (2 rows + Ascender), and the
// Ascensión confirm modal. Drives the REAL game via window hooks in dev mode.
//
// Run: node tools/cas1564-altar-render.mjs   (needs Chromium; see harness.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
const errors = [];
const pass = (m) => console.log("✔ " + m);
const failWith = (m) => { ok = false; console.error("✖ " + m); };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });

  // menu -> class select -> play (mirror smoke: name input + Enter, then warrior)
  await page.evaluate(() => {
    const i = document.getElementById("nameInput"); i.value = "AltarBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("reached play");

  // die -> altar (locked Tier-2 state: fresh meta)
  await page.evaluate(() => { window.__metaReset(); window.__dev.killHero(); });
  await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
  await page.keyboard.press("KeyA");
  await page.waitForFunction("window.__dev.scene()==='altar'", { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 200));
  const locked = await page.evaluate(() => window.__meta().t2Unlocked);
  if (locked === false) pass("altar renders with Tier-2 LOCKED (fresh meta)"); else failWith("expected Tier-2 locked");

  // bankroll + max v1 -> Tier-2 unlocks; max Tier-2 -> canAscend; render each
  await page.evaluate(() => {
    window.__dev.metaGrant(100000);
    const buyAll = (keys) => keys.forEach((k) => { for (let i = 0; i < 10; i++) window.__metaBuy(k); });
    buyAll(["hpMax", "dmg", "moveSpd", "reroll", "startGold"]);
  });
  await new Promise((r) => setTimeout(r, 200));
  let s = await page.evaluate(() => window.__meta());
  if (s.t2Unlocked && s.t2.length === 5) pass("Tier-2 row renders once v1 maxed (5 t2 nodes visible)"); else failWith("t2 not unlocked in-browser: " + JSON.stringify({ u: s.t2Unlocked }));

  await page.evaluate(() => ["t2_boonRare", "t2_startBoon", "t2_dashIframe", "t2_xpGain", "t2_reroll"].forEach((k) => { for (let i = 0; i < 10; i++) window.__metaBuy(k); }));
  await new Promise((r) => setTimeout(r, 200));
  s = await page.evaluate(() => window.__meta());
  if (s.canAscend) pass("full-max altar renders Ascender (canAscend true)"); else failWith("canAscend false after max");

  // Open the Ascensión confirm modal via a REAL tap on the Ascender rect (canvas→client map),
  // proving the modal render path executes without throwing.
  const geo = await page.evaluate(() => {
    const r = (window.__dev.altarRects() || []).find((x) => x.act === "ascend");
    const cvs = document.querySelector("canvas");
    const b = cvs.getBoundingClientRect();
    return r ? { ax: r.x + r.w / 2, ay: r.y + r.h / 2, bl: b.left, bt: b.top, bw: b.width, bh: b.height, cw: cvs.width, ch: cvs.height } : null;
  });
  if (geo) {
    await page.mouse.click(geo.bl + (geo.ax / geo.cw) * geo.bw, geo.bt + (geo.ay / geo.ch) * geo.bh);
    await new Promise((r) => setTimeout(r, 200));
    const open = await page.evaluate(() => window.__dev.altarConfirmOpen());
    if (open) pass("Ascensión confirm modal opens + renders (no throw)"); else failWith("confirm modal did not open on Ascender tap");
  } else failWith("no ascend rect found to tap");
  const shot = join(ROOT, "tools", "cas1564-altar-shot.png");
  await page.screenshot({ path: shot });
  pass("altar screenshot captured: " + shot);

  if (errors.length) failWith("page errors:\n  " + errors.join("\n  ")); else pass("zero page errors across all altar states");
} catch (e) {
  failWith("exception: " + e.message);
} finally {
  await browser.close();
  await srv.close?.();
}
console.log(ok ? "\nCAS-1565 altar-render: PASS" : "\nCAS-1565 altar-render: FAIL");
process.exit(ok ? 0 : 1);
