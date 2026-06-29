// ---------------------------------------------------------------------------
// Headless FORJA (equipment-progression) playthrough (CAS-237).
//
// Boots the REAL game in headless Chromium and drives the data-driven forge
// (sim/gear.js FORGE + sim.forgeUpgrade) end-to-end through the SAME code the
// game uses — no shortcut around the gold/material check or the level bump:
//
//   1) DATA: forge tiers/costs are data (FORGE.max + per-level gold/mat curve);
//      every equipped slot exposes its next-level cost (or null when maxed).
//   2) FORGE moves a REAL combat number: forging the weapon raises equippedDmg
//      (and the resolved gearStat), debiting gold + material (the dual sink).
//   3) PROGRESSION: forging to FORGE.max climbs the stat monotonically, then the
//      next cost is null and a further forge is denied (qty/gold untouched).
//   4) GATE: with insufficient gold/mats the forge is denied (no stat/level change).
//   5) MATERIAL drip: a champion kill grants forge material (deterministic, no RNG).
//   6) PERSISTENCE: forge a piece, save, reload — the forge level (and the higher
//      stat it implies) survive the refresh (additive save, no wipe).
//   7) 60fps with the forge panel open + zero JS errors + a screenshot.
//
// Test inputs use dev-only hooks (?dev) that call the real game functions.
//
// Run: npm run forge   (node tools/forge.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "forge.png");
let ok = true;
const log = (m) => console.log(m);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const dwell = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "ForgeBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (1) DATA — every equipped slot exposes its forge level + next-level cost from FORGE data.
  const st0 = await page.evaluate(() => window.__dev.forgeState());
  const w0 = st0.slots.find((s) => s.slot === "weapon");
  if (st0.max >= 5 && w0 && w0.fl === 0 && w0.next && w0.next.gold > 0 && w0.next.mats > 0)
    pass(`forge data present: max=${st0.max}, weapon ${w0.name} fl=${w0.fl} nextCost=${JSON.stringify(w0.next)}`);
  else fail(`forge data malformed: ${JSON.stringify(st0)}`);

  // (2) FORGE moves a real combat number; debits gold + material (dual sink).
  await page.evaluate(() => { window.__dev.setGold(5000); window.__dev.setMats(20); });
  const pre = await page.evaluate(() => window.__dev.forgeState());
  const preW = pre.slots.find((s) => s.slot === "weapon");
  const r1 = await page.evaluate(() => window.__dev.forgeDo("weapon"));
  const w1 = r1.slots.find((s) => s.slot === "weapon");
  if (r1.ok && w1.fl === 1 && w1.stat > preW.stat && r1.dmg > pre.dmg && r1.gold === pre.gold - preW.next.gold && r1.mats === pre.mats - preW.next.mats)
    pass(`forge +1: stat ${preW.stat}->${w1.stat}, dmg ${pre.dmg}->${r1.dmg}; gold ${pre.gold}->${r1.gold}, mena ${pre.mats}->${r1.mats}`);
  else fail(`forge did not move real numbers / sink currencies: pre=${JSON.stringify({stat:preW.stat,dmg:pre.dmg,gold:pre.gold,mats:pre.mats})} post=${JSON.stringify({ok:r1.ok,fl:w1.fl,stat:w1.stat,dmg:r1.dmg,gold:r1.gold,mats:r1.mats})}`);

  // (3) PROGRESSION — forge to FORGE.max; stat climbs monotonically, then maxed = denied.
  let prevStat = w1.stat, mono = true;
  let cur = r1;
  for (let lvl = 2; lvl <= st0.max; lvl++) {
    cur = await page.evaluate(() => window.__dev.forgeDo("weapon"));
    const cw = cur.slots.find((s) => s.slot === "weapon");
    if (cw.stat <= prevStat) mono = false;
    prevStat = cw.stat;
  }
  const maxedW = cur.slots.find((s) => s.slot === "weapon");
  if (maxedW.fl === st0.max && maxedW.next === null && mono)
    pass(`forged weapon to MÁX (+${maxedW.fl}/${st0.max}), stat monotonic up to ${maxedW.stat}, next cost null`);
  else fail(`progression wrong: fl=${maxedW.fl} next=${JSON.stringify(maxedW.next)} monotonic=${mono}`);
  const overforge = await page.evaluate(() => window.__dev.forgeDo("weapon"));
  const ofW = overforge.slots.find((s) => s.slot === "weapon");
  if (!overforge.ok && ofW.fl === st0.max)
    pass(`maxed weapon: further forge denied (stays +${ofW.fl}/${st0.max})`);
  else fail(`maxed weapon still forgeable: ${JSON.stringify({ok:overforge.ok,fl:ofW.fl})}`);

  // (4) GATE — insufficient gold/mats: a forge attempt is denied, level + stat unchanged.
  await page.evaluate(() => { window.__dev.setGold(0); window.__dev.setMats(0); });
  const beforeGate = await page.evaluate(() => window.__dev.forgeState());
  const bgBody = beforeGate.slots.find((s) => s.slot === "body");
  const gate = await page.evaluate(() => window.__dev.forgeDo("body"));
  const gBody = gate.slots.find((s) => s.slot === "body");
  if (!gate.ok && gBody.fl === bgBody.fl && gBody.stat === bgBody.stat)
    pass(`gate: forge denied with 0 gold/mena (body stays fl=${gBody.fl}, stat ${gBody.stat})`);
  else fail(`gate failed: ${JSON.stringify({ok:gate.ok, fl:gBody.fl, was:bgBody.fl})}`);

  // (5) MATERIAL drip — kills grant forge material through the REAL kill path (deterministic,
  // no RNG): a boss kill is a guaranteed +3 haul, and trash kills add a steady trickle.
  const boss = await page.evaluate(() => {
    const before = window.__dev.forgeState().mats;
    window.__dev.spawnKill("golem");                       // golem → flagged isBoss → grantMats(3)
    return { before, after: window.__dev.forgeState().mats };
  });
  const trash = await page.evaluate(() => {
    const before = window.__dev.forgeState().mats;
    for (let i = 0; i < 8; i++) window.__dev.spawnKill("orc"); // crosses the kill-counter trickle ≥ once
    return { before, after: window.__dev.forgeState().mats };
  });
  if (boss.after >= boss.before + 3 && trash.after > trash.before)
    pass(`material drip: boss kill +${boss.after - boss.before} mena, 8 trash kills +${trash.after - trash.before} (deterministic, no RNG)`);
  else fail(`material drip wrong: boss ${JSON.stringify(boss)} trash ${JSON.stringify(trash)}`);

  // (6) PERSISTENCE — forge the SHIELD, save, reload; level + stat survive the refresh.
  await page.evaluate(() => { window.__dev.setGold(5000); window.__dev.setMats(20); });
  const fShield = await page.evaluate(() => { window.__dev.forgeDo("shield"); window.__dev.forgeDo("shield"); window.__dev.saveNow(); return window.__dev.forgeState(); });
  const preShield = fShield.slots.find((s) => s.slot === "shield");
  const blob = await page.evaluate(() => window.__dev.saveBlob());
  log(`   pre-reload: shield fl=${preShield.fl} stat=${preShield.stat}, mats=${fShield.mats}; save v${blob && blob.version}`);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 15000 });
  const afterReload = await page.evaluate(() => window.__dev.forgeState());
  const postShield = afterReload.slots.find((s) => s.slot === "shield");
  if (postShield.fl === preShield.fl && postShield.stat === preShield.stat && afterReload.mats === fShield.mats)
    pass(`persistence: shield forge +${postShield.fl} (stat ${postShield.stat}) + mena ${afterReload.mats} survived reload`);
  else fail(`persistence failed: pre fl=${preShield.fl}/stat=${preShield.stat}/mats=${fShield.mats} post fl=${postShield.fl}/stat=${postShield.stat}/mats=${afterReload.mats}`);

  // (7) perf with the forge panel open + zero errors + screenshot
  await page.evaluate(() => { window.__dev.setGold(5000); window.__dev.setMats(20); window.__dev.openForge(); });
  await page.waitForFunction("window.__dev.scene() === 'forge'", { timeout: 3000 }).catch(() => {});
  const fpsList = [];
  for (let i = 0; i < 3; i++) {
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const tick = () => { n++; (performance.now() - t0 < 800) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
      requestAnimationFrame(tick);
    }));
    fpsList.push(fps);
  }
  const minFps = Math.min(...fpsList);
  log(`FPS samples (forge panel open): [${fpsList.join(", ")}]  min=${minFps}`);
  if (minFps >= 58) pass(`FPS held >= 58 (min ${minFps})`);
  else fail(`FPS dropped below 58: min ${minFps}`);

  await page.screenshot({ path: SHOT });
  pass(`screenshot saved: ${SHOT}`);

  if (errors.length === 0) pass("zero page errors");
  else { for (const e of errors) fail(e); }
} catch (e) {
  fail(`exception: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}

console.log(ok ? "\n✓ CAS-237 forge test passed." : "\n✗ CAS-237 forge test FAILED.");
process.exit(ok ? 0 : 1);
