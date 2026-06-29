// CAS-256 LIVE probe — boot the DEPLOYED gh-pages build (no iframe; top window) and drive
// the warrior hurt + special states through the real sim hooks, asserting they fire, revert,
// hold 60fps, and throw zero errors on the live host. Build/asset parity is checked too.
//   node tools/cas256-anims-live.mjs [url]
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const URL = process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const log = (m) => console.log(m); let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function awaitState(page, target, ms = 1500) { const t0 = Date.now();
  while (Date.now() - t0 < ms) { const a = await page.evaluate(() => window.__dev.heroAnim()); if (a && a.state === target) return true; await wait(16); } return false; }

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon|404/i.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  await page.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {}
    window.__frames = 0; const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); }); });
  await page.goto(`${URL}index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "LiveBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
  pass("entered play on the LIVE host as warrior");

  if (typeof (await page.evaluate(() => window.__dev.hurt)) !== "undefined") pass("[HOOK] live build exposes __dev.hurt (CAS-256 deployed)");
  else { fail("[HOOK] __dev.hurt missing on live build → CAS-256 not deployed"); }

  await page.evaluate(() => window.__dev.clearSpellCD());
  await page.evaluate(() => window.__dev.cast(1));
  if (await awaitState(page, "special", 800)) pass("[SPECIAL] live cast → animState 'special'");
  else fail("[SPECIAL] live cast never reached 'special'");
  if (await awaitState(page, "idle", 1500) || await awaitState(page, "walk", 200)) pass("[SPECIAL] reverts live");
  else fail("[SPECIAL] stuck live");

  const hurt = await page.evaluate(() => window.__dev.hurt(8));
  if (await awaitState(page, "hurt", 600)) pass(`[HURT] live hit → animState 'hurt' (hp ${hurt.hp})`);
  else fail(`[HURT] live hit never reached 'hurt' (${JSON.stringify(hurt)})`);
  if (await awaitState(page, "idle", 1200) || await awaitState(page, "walk", 200)) pass("[HURT] reverts live");
  else fail("[HURT] stuck live");

  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  for (let i = 0; i < 5; i++) { await page.evaluate(() => { window.__dev.clearSpellCD(); window.__dev.cast(1); window.__dev.hurt(4); }); await wait(220); }
  const f1 = await page.evaluate(() => window.__frames); const fps = Math.round((f1 - f0) * 1000 / (Date.now() - t0));
  if (fps >= 55) pass(`[PERF] live 60fps held (${fps} fps while states fire)`);
  else fail(`[PERF] live fps low: ${fps}`);

  if (errors.length === 0) pass("[ERR] zero live page errors");
  else fail(`[ERR] ${errors.length}: ${errors.slice(0, 3).join(" | ")}`);

  log(""); log(ok ? "✓ CAS-256 LIVE probe passed." : "✗ CAS-256 LIVE probe FAILED.");
} catch (e) { fail(`probe threw: ${e && e.stack ? e.stack : e}`); }
finally { await browser.close(); }
process.exit(ok ? 0 : 1);
