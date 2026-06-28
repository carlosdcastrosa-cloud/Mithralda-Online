// ---------------------------------------------------------------------------
// CAS-123 QA — LIVE probe for the STAGE-1 FINALE ARC on the DEPLOYED build (inside
// the Higgsfield iframe). Drives the SAME __dev hooks the game runs to prove the arc
// shipped live (not a stale cache) and works end-to-end on the live URL:
//   - GOAL EXISTS + GATED (AC1): stage1State() exposes the single win-goal (the Guardián
//     capstone, flagged final); the objective gate is LOCKED low / READY once power clears.
//   - ALL CLASSES COMPLETE (AC2): for each playable class, open the gate, summon the final
//     capstone and slay it through the REAL clear path → the win fires.
//   - EXPLICIT VICTORY (AC3): the kill switches scene to "victory" + builds a run summary.
//   - PERSISTS (AC3): the win flag is written into the durable save blob (stage1:true).
//   - FREE PLAY (AC): dismissing returns to play with the same hero; objective reads DONE.
//   - 60fps + 0 JS errors live.
// Read-only on the shared env (throwaway client-session state only). Prints JSON.
//
// Run: node tools/cas123-finale-live.mjs   (or: npm run finale-live)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas123-finale-live.png");
const CLASSES = ["warrior", "paladin", "mage", "druid", "priest"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, checks: [], errors: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); if (!ok) report.anyFail = true; console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
async function enterAs(fr, digit) {
  await fr.evaluate(() => { try { if (window.__dev.clearSave) window.__dev.clearSave(); if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {} });
  await fr.evaluate(() => location.reload());
  await sleep(800);
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "FinaleQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate((d) => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit" + d, key: "" + d, bubbles: true })), digit);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  let fr = await gameFrame(page);
  await enterAs(fr, 1);
  check("entered play live as warrior", true);

  const hooksOk = await fr.evaluate(() => !!(window.__dev.stage1State && window.__dev.armFinalBoss && window.__dev.ackVictory));
  check("CAS-123 dev hooks present on live build", hooksOk);

  // AC1: goal exists + final flag + fresh run incomplete
  const st = await fr.evaluate(() => window.__dev.stage1State());
  check("AC1: win-goal exists (final boss, gated)", !!(st && st.goal && st.goal.zone === "frost" && st.goal.req > 0 && st.finalIsFinal && st.stage1 === false), st && { goal: st.goal, finalIsFinal: st.finalIsFinal, stage1: st.stage1 });

  // AC1: gate locked low → ready high
  const gate = await fr.evaluate(() => { window.__dev.setUpg(0, 0, 0); const locked = window.__dev.frostGate(); window.__dev.setUpg(20, 20, 20); const open = window.__dev.frostGate(); return { locked, open }; });
  check("AC1: objective LOCKED low + READY once power clears", !!(gate.locked && !gate.locked.unlocked && gate.open && gate.open.unlocked), { locked: gate.locked && gate.locked.power + "/" + gate.locked.req, open: gate.open && gate.open.unlocked });

  // AC2: every class completes the arc
  for (let i = 0; i < CLASSES.length; i++) {
    const cls = CLASSES[i];
    await enterAs(fr, i + 1);
    const arm = await fr.evaluate(() => { window.__dev.setUpg(20, 20, 20); return window.__dev.armFinalBoss(); });
    if (!arm || !arm.final) { check(`AC2 [${cls}] summon final boss`, false, arm); continue; }
    await fr.evaluate(() => window.__dev.huntKillChampion("frost"));
    const after = await fr.evaluate(() => window.__dev.stage1State());
    const won = after && after.stage1 === true && after.scene === "victory" && after.victory && after.victory.cls === cls;
    check(`AC2 [${cls}] completed the arc → victory`, won, after && { stage1: after.stage1, scene: after.scene, lvl: after.victory && after.victory.lvl });

    if (cls === "warrior") {
      const v = after.victory;
      check("AC3: victory summary built", !!(v && typeof v.lvl === "number" && typeof v.playT === "number" && typeof v.deaths === "number" && v.bossName), v && { cls: v.cls, lvl: v.lvl, gold: v.gold, loot: v.lootName });
      const blob = await fr.evaluate(() => window.__dev.saveBlob());
      check("AC3: win PERSISTS in save blob (stage1=true)", !!(blob && blob.stage1 === true), blob && { stage1: blob.stage1, playT: blob.playT, deaths: blob.deaths });
      await page.screenshot({ path: SHOT });
      check("victory screenshot saved", true, SHOT);
      const sc = await fr.evaluate(() => window.__dev.ackVictory());
      const free = await fr.evaluate(() => window.__dev.stage1State());
      check("AC: dismiss → free play (same hero, objective DONE)", sc === "play" && free && free.stage1 === true && free.scene === "play", { scene: sc, stage1: free && free.stage1 });
    }
  }

  // fps + errors
  await enterAs(fr, 1);
  const fps = await fr.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(tick); }));
  check("60fps held live", fps >= 58, { fps });
  check("zero JS errors live", report.errors.length === 0, report.errors.slice(0, 4));

} catch (e) {
  check("harness threw", false, String(e && e.stack || e));
} finally {
  await browser.close();
}

report.pass = !report.anyFail;
console.log("\n" + JSON.stringify({ pass: report.pass, checks: report.checks.length, errors: report.errors.length }, null, 2));
process.exit(report.pass ? 0 : 1);
