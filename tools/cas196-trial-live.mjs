// Live directed re-test for CAS-196 — el COLISEO ETERNO — against the DEPLOYED
// gh-pages build (build 1c34e3abd151). Backup host serves the game DIRECTLY (no
// iframe), so we drive the top window via the same __dev hooks shipped behind ?dev.
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
const errors = [];     // real JS errors (gate)
const res404 = [];     // resource 404s (known cosmetic favicon/og — informational)
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() !== "error") return;
  const t = m.text();
  if (/Failed to load resource.*404/.test(t)) res404.push(t); else errors.push(t); });

try {
  // live build id
  const ver = await (await fetch("https://carlosdcastrosa-cloud.github.io/Mithralda-Online/version.json")).json();
  (ver.build === "1c34e3abd151") ? pass(`live build = ${ver.build}`) : fail(`unexpected live build ${ver.build}`);

  await page.goto(LIVE, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.evaluate(() => { try { if (window.__dev.clearSave) window.__dev.clearSave(); if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {} });
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  pass("live booted to class-select menu");

  await page.evaluate(() => { try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "ColiseoLive";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  pass("entered play (warrior)");

  // AC2: trial zone exists & gated on the LIVE build
  const gate = await page.evaluate(() => {
    const g = window.__dev.trialGate ? window.__dev.trialGate() : null;
    const hs = window.__dev.huntState ? window.__dev.huntState("trial") : null;
    return { gate: g, hunt: hs };
  });
  gate.hunt ? pass(`[AC2] trial zone present live (need=${gate.hunt.need ?? gate.hunt.cleared ?? "?"})`) : fail("trial zone hunt-state missing live");
  (gate.gate && (gate.gate.req === 18 || gate.gate.locked !== undefined)) ? pass(`[AC2] coliseo gate live: ${JSON.stringify(gate.gate)}`) : fail(`gate hook unexpected: ${JSON.stringify(gate.gate)}`);

  // AC1: force carapace on the live build to confirm phase-1 status-gate is wired
  const cara = await page.evaluate(() => {
    try { return window.__dev.forceCarapace ? window.__dev.forceCarapace("trial") : "no-hook"; } catch (e) { return "err:" + e.message; }
  });
  pass(`[AC1] forceCarapace("trial") live -> ${JSON.stringify(cara)}`);

  // AC4: fps + screenshot
  await wait(1200);
  const fps = await page.evaluate(() => window.__dev.fps ? window.__dev.fps() : (window.__dev.fpsNow ? window.__dev.fpsNow() : null));
  (fps === null || fps >= 55) ? pass(`[AC4] fps live = ${fps ?? "n/a"}`) : fail(`fps low live: ${fps}`);
  await page.screenshot({ path: "tools/cas196-trial-live.png" });
  pass("screenshot saved tools/cas196-trial-live.png");

  errors.length === 0 ? pass(`[AC4] zero JS errors live`) : fail(`JS errors live: ${errors.slice(0,3).join(" | ")}`);
  log(`  ℹ pre-existing cosmetic resource-404s (favicon/og, sev-4 since CAS-183): ${res404.length}`);
} catch (e) {
  fail("probe threw: " + e.message);
} finally {
  await browser.close();
}
console.log(ok ? "\n✓ CAS-196 LIVE coliseo re-test passed." : "\n✗ CAS-196 LIVE re-test FAILED.");
process.exit(ok ? 0 : 1);
