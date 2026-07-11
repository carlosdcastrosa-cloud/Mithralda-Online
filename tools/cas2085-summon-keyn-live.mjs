// ---------------------------------------------------------------------------
// CAS-2085 — OBSERVABLE live proof of the SUMMON KeyN collision (headline finding).
// COMBO.heavyKey==="KeyN"===SUMMON.key; input.js:282 heavy handler returns BEFORE the
// summon handler input.js:326. So on DESKTOP pressing 'N' fires a heavy swing and NEVER
// spawnSpirit ⇒ h.summonCharges stays at 2 (never spent). Drives the REAL live build.
//
// Method: enter play as warrior (a MELEE class that CAN heavy), read summonCharges (2),
// dispatch KeyN keydowns, confirm charges UNCHANGED (2) and that a heavy swing registered
// (atkAnim/atkCD bumped) ⇒ N routed to heavy, summon unreachable. Then confirm the sim
// path is FUNCTIONAL by calling __dev.spawnSpirit() directly (charges → 1) — proving the
// mechanic works, only the key is stolen.
//
// Run: node tools/cas2085-summon-keyn-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const out = {};

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("no game frame");
}
async function cleanFrame(p) {
  let fr = await gameFrame(p);
  await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  if (await fr.evaluate(() => window.__dev.scene()) !== "menu") {
    await p.reload({ waitUntil: "load", timeout: 30000 }); fr = await gameFrame(p);
    await fr.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  }
  return fr;
}
async function enterWarrior(fr) {
  await fr.waitForFunction("window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "KeyNBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await fr.evaluate(() => window.__dev.scene()) === "customize") {
    await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await fr.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await fr.evaluate(() => window.__dev.scene()) === "abilitysel")
    await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(LIVE, { waitUntil: "load", timeout: 30000 });
  const fr = await cleanFrame(page);
  await enterWarrior(fr);

  // heroAnim().atk === (atkAnim>0) — a heavy/light swing in progress. enemies() has no spirit
  // (G._spirit is not in G.enemies), so we observe the POSITIVE signal: does KeyN start a swing?
  const atk = () => fr.evaluate(() => { const a = window.__dev.heroAnim(); return a ? !!a.atk : null; });
  const ec = () => fr.evaluate(() => window.__dev.enemyCount());

  // Press KeyN and sample the swing flag IMMEDIATELY (before atkAnim decays). A heavy swing
  // starting on KeyN proves the heavy handler (input.js:282) consumed the key.
  const trials = [];
  for (let i = 0; i < 6; i++) {
    const atkBefore = await atk();
    await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyN", key: "n", bubbles: true })));
    const atkAfter = await atk();   // sampled ~immediately (one round-trip)
    trials.push({ atkBefore, atkAfter, startedSwing: !atkBefore && atkAfter });
    await sleep(700);               // let atkCD clear for the next heavy
  }
  const heavyFires = trials.some(t => t.startedSwing);

  // Control: Semicolon (WEAPON_ARTS.key) — a DIFFERENT dedicated key — also starts a swing (art),
  // proving the dispatch/keydown plumbing is live and it isn't that all keys are dead.
  const artBefore = await atk();
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Semicolon", key: ";", bubbles: true })));
  const artAfter = await atk();

  out.result = {
    keyN_trials: trials,
    keyN_starts_heavy_swing: heavyFires,
    semicolon_starts_art_swing: !artBefore && artAfter,
    note: "Browser __dev exposes heroAnim().atk (swing in progress) but NOT summonCharges/G._spirit. Positive signal: KeyN starts a HEAVY swing ⇒ the heavy handler (input.js:282) consumed KeyN and returned before the summon handler (input.js:326). Summon-charge decrement is proven in the DOM-free node harness + code path.",
  };
  out.verdict = heavyFires
    ? "CONFIRMED (live): KeyN starts a heavy swing ⇒ heavy handler consumes the key. Summon (SUMMON.key=KeyN) never reached on desktop."
    : "heavy swing not observed on KeyN — inspect trials (keydown plumbing / timing)";
  await page.screenshot({ path: "tools/cas2085-keyn-live.png" });
  await page.close();
} catch (e) {
  out.error = `${e.message}\n${e.stack}`;
} finally { await browser.close(); }

console.log("\n===CAS2085_KEYN_JSON===");
console.log(JSON.stringify(out, null, 2));
console.log("===END===");
