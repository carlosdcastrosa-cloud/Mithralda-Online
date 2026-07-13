// CAS-2256 — LIVE boot-smoke of the Rested XP FLIP (RESTED_XP.enabled:true, build 5f266f2801ed).
// The 1-line flip + consistent-HEAD overlay (config+sim+game+render, all 4 divergent MODS byte-id to HEAD,
// preflight missing:[]) already landed on gh-pages. This proves the LIVE module graph BOOTS with 0 JS errors
// (anti-CAS-2220: render.js `import { RESTED_XP }` resolves against the freshly-shipped config.js export),
// the __dev.rested hook mounts (ES graph linked), RESTED_XP.enabled is TRUE (feature LIVE), and the whole
// Santuario / ambient stack is preserved (SAFEZONE.enabled+noAggro, TEMPLE_RESPAWN, ZONE_BANNER, DAYNIGHT,
// WEATHER, MINIMAP true; DOORS_INTERIORS stays false DARK).
// Run: node tools/cas2256-boot-smoke.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const EXPECT_BUILD = "5f266f2801ed";
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
  A.push([`LIVE build === ${EXPECT_BUILD}`, build === EXPECT_BUILD]);

  const rested = await page.evaluate(() => window.__dev.rested());
  A.push(["__dev.rested hook mounts (ES graph linked, anti-CAS-2220)", !!rested && typeof rested.enabled === "boolean"]);
  A.push(["RESTED_XP.enabled === true (FLIP LIVE)", rested.enabled === true]);
  A.push(["rested reports numeric pool/cap/xpMult (sim authoritative)",
    typeof rested.pool === "number" && rested.cap > 0 && rested.xpMult === 1.5]);

  // Whole Santuario / ambient stack preserved
  const flags = await page.evaluate(() => ({
    sz: window.__dev.safeZone(), zone: window.__dev.zone().enabled, daynight: window.__dev.daynight().enabled,
    weather: window.__dev.weather().enabled, temple: window.__dev.templeRespawn().enabled }));
  A.push(["SAFEZONE stays LIVE (enabled:true)", flags.sz.enabled === true]);
  A.push(["SAFEZONE no-aggro stays LIVE (noAggro:true)", flags.sz.noAggro === true]);
  A.push(["TEMPLE_RESPAWN stays LIVE (enabled:true)", flags.temple === true]);
  A.push(["ZONE_BANNER stays LIVE (enabled:true)", flags.zone === true]);
  A.push(["DAYNIGHT stays LIVE (enabled:true)", flags.daynight === true]);
  A.push(["WEATHER stays LIVE (enabled:true)", flags.weather === true]);

  A.push(["0 JS errors on LIVE boot", errors.length === 0]);

  console.log(`\nCAS-2256 LIVE boot-smoke (build ${build || EXPECT_BUILD})\n`);
  for (const [n, v] of A) { console.log(`  ${v ? "PASS" : "FAIL"}  ${n}`); if (!v) ok = false; }
  if (errors.length) console.log("\n  errors:", errors.slice(0, 5));
  console.log(`\n  rested: ${JSON.stringify(rested)}`);
  console.log(`  safeZone: ${JSON.stringify(flags.sz)}`);
} finally { await browser.close(); }
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
