// CAS-2190 — observable menu smoke vs LIVE. Proves the 3 mode selectors are gone:
//   AC1: pressing the old mode keys (ARENA KeyA / BOSS_RUSH KeyB / SEEDED KeyC) in the
//        menu is now INERT — scene stays 'menu' (before this change each started a run).
//   AC2: Enter (Play) → open-world flow (scene 'classsel'), no intermediate mode step.
// Boots the deployed build headless in the #hf-frame, drives input like playtest-live.
// Captures a menu screenshot artifact. Read-only. Run: node tools/cas2190-menu-smoke.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const LIVE = process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const out = { live: LIVE, checks: {}, errors: [] };
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const press = (fr, code) => fr.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: "", bubbles: true })), code);
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1 });
  // Ignore the known benign favicon 404 (sev-4, documented CAS-2175 playtest); it predates this change.
  const benign = (t) => /status of 404/i.test(t) || /favicon/i.test(t);
  page.on("console", (m) => { if (m.type() === "error" && !benign(m.text())) out.errors.push(m.text()); });
  page.on("pageerror", (e) => out.errors.push("PAGEERR " + e.message));
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 60000 });
  let fr = await gameFrame(page);
  await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  if (await fr.evaluate(() => window.__dev.scene()) !== "menu") {
    await page.reload({ waitUntil: "load", timeout: 30000 });
    fr = await gameFrame(page);
    await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  }
  await fr.waitForFunction("window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.screenshot({ path: join(ROOT, "tools", "cas2190-menu.png") });
  out.checks.bootScene = await fr.evaluate(() => window.__dev.scene());
  // AC1 — old mode keys must be inert (scene stays 'menu').
  const modeKeys = { KeyA_arena: "KeyA", KeyB_bossrush: "KeyB", KeyC_seeded: "KeyC" };
  out.checks.modeKeysInert = {};
  for (const [label, code] of Object.entries(modeKeys)) {
    await press(fr, code); await sleep(300);
    const sc = await fr.evaluate(() => window.__dev.scene());
    out.checks.modeKeysInert[label] = sc;
  }
  out.checks.AC1_all_mode_keys_inert = Object.values(out.checks.modeKeysInert).every((s) => s === "menu");
  // AC2 — Enter (Play) → open-world flow (classsel), no mode step.
  await fr.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 }).then(() => { out.checks.AC2_enter_to_classsel = true; }).catch(() => { out.checks.AC2_enter_to_classsel = false; });
  out.checks.afterEnterScene = await fr.evaluate(() => window.__dev.scene());
  out.pass = out.checks.bootScene === "menu" && out.checks.AC1_all_mode_keys_inert && out.checks.AC2_enter_to_classsel === true && out.errors.length === 0;
} catch (e) {
  out.errors.push("FATAL " + (e.message || e)); out.pass = false;
} finally { await browser.close(); }
console.log(JSON.stringify(out, null, 2));
process.exit(out.pass ? 0 : 1);
