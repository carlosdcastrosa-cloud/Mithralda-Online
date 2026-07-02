// ---------------------------------------------------------------------------
// CAS-118 QA — LIVE probe for combat STATUS EFFECTS on the DEPLOYED build (inside
// the Higgsfield iframe). Drives the SAME __dev hooks the game runs to prove the
// status layer shipped live (not a stale cache) and works end-to-end on the live URL:
//   - CATALOGUE: >=3 effects (poison/burn DoT + slow + stun) + mob infl rows.
//   - DoT: an applied poison ticks an enemy's HP down over time then expires.
//   - WEAPON PROC: equipping a burn weapon sets a struck enemy on fire (real hit).
//   - MOB INFLICTS + AVOIDABLE: a bandit lunge that connects poisons the hero; a hero
//     kept out of reach is never poisoned (reading the telegraph avoids the state).
//   - HERO SLOW applies + expires.
//   - 60fps + 0 JS errors live.
// Read-only on the shared env (throwaway client-session state only). Prints JSON.
//
// Run: node tools/cas118-status-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas118-status-live.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, checks: [], errors: [], pass: false };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? "✔" : "✖"} ${name}${detail !== undefined ? "  " + JSON.stringify(detail) : ""}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

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
async function enterAs(fr, name = "StatusQA") {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate((nm) => { document.getElementById("nameInput").value = nm;
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}
async function untilStatus(fr, who, pred, ms = 5000) {
  const t0 = Date.now(); let s = null;
  while (Date.now() - t0 < ms) { s = await fr.evaluate((w) => window.__dev.statusOf(w), who); if (s && pred(s)) return s; await sleep(60); }
  return s;
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => report.errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  const fr = await gameFrame(page);
  await enterAs(fr);
  check("entered play live as warrior", true);

  // hooks present live (proves the new code shipped, not a stale cache)
  const hooksOk = await fr.evaluate(() => !!(window.__dev.statusMeta && window.__dev.statusOf && window.__dev.giveBurnWeapon && window.__dev.heroHit && window.__dev.statusArena));
  check("CAS-118 dev hooks present on live build", hooksOk);

  const meta = await fr.evaluate(() => ({
    poison: window.__dev.statusMeta("poison"), burn: window.__dev.statusMeta("burn"),
    slow: window.__dev.statusMeta("slow"), stun: window.__dev.statusMeta("stun"),
    bandit: window.__dev.mobInfl("bandit"), wraith: window.__dev.mobInfl("wraith"),
  }));
  check("CATALOGUE: poison/burn DoT + slow + stun + mob infl rows",
    !!(meta.poison.dot && meta.burn.dot && meta.slow.amt > 0 && meta.slow.amt < 1 && meta.stun.dur > 0 && meta.bandit.type === "poison" && meta.wraith.type === "slow"), meta);

  // DoT ticks + expires on an enemy
  await fr.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.statusArena("orc", 50, 0); });
  const e0 = await fr.evaluate(() => window.__dev.applyStatusTo("enemy", "poison", { dmg: 5, dur: 2.0 }));
  const eMid = await untilStatus(fr, "enemy", (s) => s.hp < e0.hp, 1500);
  await sleep(2400);
  const eEnd = await fr.evaluate(() => window.__dev.statusOf("enemy"));
  check("DoT: poison ticked enemy HP down then expired", !!(eMid && eEnd && eMid.hp < e0.hp && eEnd.hp < eMid.hp && !eEnd.dots.poison), { e0: e0.hp, eMid: eMid && eMid.hp, eEnd: eEnd && eEnd.hp });

  // weapon proc: burn weapon sets a struck enemy on fire (real hitEnemy)
  const burned = await fr.evaluate(() => { window.__dev.statusArena("orc", 30, 0); const procs = window.__dev.giveBurnWeapon(4); const after = window.__dev.heroHit(); return { procs, dots: after.dots }; });
  check("WEAPON PROC: burn weapon ignites the struck enemy on hit", !!(burned.procs.length === 1 && burned.procs[0].proc === "burn" && burned.dots.burn), burned);

  // mob inflicts (bandit lunge → hero poison)
  await fr.evaluate(() => { window.__dev.tpZone("ruins"); window.__dev.statusArena("bandit", 40, 0); });
  const hHit = await untilStatus(fr, "hero", (s) => !!(s.dots && s.dots.poison), 6000);
  check("MOB INFLICTS: bandit's connecting lunge poisons the hero", !!(hHit && hHit.dots && hHit.dots.poison), hHit && hHit.dots);

  // avoidable: hero kept out of reach is never poisoned
  await fr.evaluate(() => { window.__dev.tpZone("ruins"); window.__dev.statusArena("bandit", 300, 0); });
  let avoided = true, last = null;
  for (let i = 0; i < 30; i++) { last = await fr.evaluate(() => { window.__dev.archMoveHero(300, 0); return window.__dev.statusOf("hero"); }); if (last.dots && last.dots.poison) { avoided = false; break; } await sleep(50); }
  check("AVOIDABLE: a hero the lunge never reaches is never poisoned", avoided && !(last.dots && last.dots.poison));

  // hero slow applies + expires
  const sl0 = await fr.evaluate(() => window.__dev.applyStatusTo("hero", "slow", { amt: 0.5, dur: 1.0 }));
  await sleep(1300);
  const sl1 = await fr.evaluate(() => window.__dev.statusOf("hero"));
  check("HERO SLOW: applied then expired to 0", !!(sl0.slowT > 0 && sl0.slow < 1 && sl1.slowT === 0), { sl0, sl1 });

  // fps with an afflicted pack live
  await fr.evaluate(() => { window.__dev.tpZone("abyss"); window.__dev.statusArena("orc", 60, 40); ["wraith","mage","wolf","bandit","moose","bat","skeleton"].forEach((t,i)=>window.__dev.spawn(t,70*Math.cos(i),70*Math.sin(i))); window.__dev.applyStatusTo("hero","burn",{dmg:3,dur:8}); });
  const fps = await fr.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); }; requestAnimationFrame(tick); }));
  check("FPS: held >=58 with an afflicted pack live", fps >= 58, { fps });

  // visual evidence
  await fr.evaluate(() => { window.__dev.tpZone("ruins"); window.__dev.statusArena("orc", 70, 0); window.__dev.applyStatusTo("enemy","burn",{dmg:4,dur:6}); window.__dev.applyStatusTo("enemy","poison",{dmg:3,dur:6}); window.__dev.applyStatusTo("hero","slow",{amt:0.5,dur:6}); window.__dev.applyStatusTo("hero","poison",{dmg:3,dur:6}); });
  await sleep(150);
  await page.screenshot({ path: SHOT });
  check("status FX screenshot saved", true, SHOT);

  check("zero JS errors live", report.errors.length === 0, report.errors);
  report.pass = report.checks.every((c) => c.ok);
} catch (e) {
  check("harness threw", false, String(e && e.stack || e));
} finally {
  await browser.close();
}
console.log("\n===REPORT===\n" + JSON.stringify(report, null, 2) + "\n===END===");
console.log(report.pass ? "\n✓ CAS-118 LIVE status probe PASSED." : "\n✗ CAS-118 LIVE status probe FAILED.");
process.exit(report.pass ? 0 : 1);
