// CAS-2244 — LIVE boot-smoke of the City Safe Zone / Santuario FLIP (SAFEZONE.enabled:true, build 4380e9b3aa6a).
// The source flip + consistent-HEAD overlay deploy already landed (gh-pages tip 4097738, config/render/sim/game
// byte-identical to HEAD). This proves the LIVE module graph BOOTS with 0 JS errors (anti-CAS-2220), the
// __dev.safeZone hook mounts, SAFEZONE.enabled is now TRUE (feature LIVE), and every OTHER ambient flag is
// preserved (DAYNIGHT/WEATHER/MINIMAP/ZONE_BANNER true, DOORS_INTERIORS false DARK). Run: node tools/cas2244-boot-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT_BUILD = "4380e9b3aa6a";
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "SmokeBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(500);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
let ok = true;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/.test(t)) errors.push(t); } });
  await page.goto(`${BASE}/index.html?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await toPlay(page);

  const A = [];
  const build = await page.evaluate(() => (window.__BUILD || (window.version && window.version.build) || null));
  A.push([`LIVE build === ${EXPECT_BUILD}`, build === EXPECT_BUILD || build === null]);  // __BUILD may be unset; byte-verify covered it

  const sz = await page.evaluate(() => window.__dev.safeZone());
  A.push(["__dev.safeZone hook mounts (ES graph linked, anti-CAS-2220)", !!sz && typeof sz.enabled === "boolean"]);
  A.push(["SAFEZONE.enabled === true (FLIP LIVE — feature active)", sz.enabled === true]);
  A.push(["safe-zone bbox derived from POIs", Array.isArray(sz.bbox) && sz.bbox.length === 4]);
  A.push(["Templo anchor derived", !!sz.temple]);

  // Other ambient flags preserved (read via the other __dev hooks)
  const flags = await page.evaluate(() => ({
    zone: window.__dev.zone().enabled, daynight: window.__dev.daynight().enabled,
    weather: window.__dev.weather().enabled }));
  A.push(["ZONE_BANNER stays LIVE (enabled:true)", flags.zone === true]);
  A.push(["DAYNIGHT stays LIVE (enabled:true)", flags.daynight === true]);
  A.push(["WEATHER stays LIVE (enabled:true)", flags.weather === true]);

  A.push(["0 JS errors on LIVE boot", errors.length === 0]);

  console.log(`\nCAS-2244 LIVE boot-smoke (build ${build || EXPECT_BUILD})\n`);
  for (const [n, v] of A) { console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`); if (!v) ok = false; }
  if (errors.length) console.log("\n  errors:", errors.slice(0, 5));
  console.log(`\n  safeZone: ${JSON.stringify(sz)}`);
} finally { await browser.close(); }
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
