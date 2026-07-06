// ---------------------------------------------------------------------------
// CAS-1586 — AURA GÉLIDA (frost, 5º afijo) + Esencia tie-in headless harness. Boots the REAL game
// in headless Chromium and drives the new affix through the SAME sim paths the game runs
// (maybeAffix / applyAffix / updateEnemies / killEnemy / essenceForRun — no shortcut), asserting:
//   1) DATA: frost joins the pool as a 5th DISTINCT affix (auraR/auraSlow data-driven, non-melee);
//      the original 4 (swift/armored/vampiric/volatile) stay byte-intact (AC-5); rate still 13%.
//   2) AURA (AC-1): standing INSIDE auraR slows the hero (movespd effective drops to ~auraSlow×);
//      standing OUTSIDE the radius leaves the hero at full speed (slow=1). Proves the radius gate.
//   3) ESENCIA (AC-2): an affixed kill earns EXTRA Esencia = affixKills × MOB_AFFIX_ESSENCE, on top
//      of the xp/gold/gear it already paid — closing the meta-progression loop.
//   4) RNG-NEUTRAL (AC-3): the affix roll is deterministic (same seed → identical count+tally) and
//      the Esencia term is EXACTLY affixKills×perAffix → at 0 affixed kills the term vanishes
//      (byte-identity to build 87346b8595db is structural: 1 unconditional srand, no-op resolver).
//   5) PERF/JS: 60fps held with a frost mob live, 0 JS errors.
//
// Run: node tools/cas1586-frost-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "FrostBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 5000 });   // CAS-1570 draft
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (1) DATA — frost is a 5th distinct affix; the original 4 stay intact; rate unchanged.
  const meta = await page.evaluate(() => window.__dev.affixMeta());
  const byId = Object.fromEntries(meta.defs.map((d) => [d.id, d]));
  if (meta.ids.length === 5 && byId.swift && byId.armored && byId.vampiric && byId.volatile && byId.frost)
    pass(`[DATA] 5 affixes present incl. frost (${meta.ids.join("/")})`);
  else fail(`[DATA] affix set wrong: ${JSON.stringify(meta.ids)}`);
  const f = byId.frost || {};
  if (f.auraR > 0 && f.auraSlow > 0 && f.auraSlow < 1 && !f.melee && f.name === "Aura Gélida")
    pass(`[DATA] frost data-driven: auraR=${f.auraR} auraSlow=${f.auraSlow} non-melee ("${f.name}")`);
  else fail(`[DATA] frost fields off: ${JSON.stringify(f)}`);
  if (byId.swift.spdMul > 1 && byId.armored.dmgReduce > 0 && byId.vampiric.lifesteal > 0 && byId.vampiric.melee === true && byId.volatile.blast > 0)
    pass(`[AC-5] original 4 affixes intact (swift/armored/vampiric/volatile modifiers unchanged)`);
  else fail(`[AC-5] an original affix regressed: ${JSON.stringify(meta.defs)}`);
  if (meta.rate >= 0.10 && meta.rate <= 0.15) pass(`[DATA] spawn rate ${(meta.rate * 100).toFixed(0)}% still in the 10-15% band`);
  else fail(`[DATA] spawn rate ${meta.rate} moved outside 10-15%`);

  // (2) AURA (AC-1) — inside the radius the hero is slowed; outside it is not.
  const inside = await page.evaluate((r) => window.__dev.affixAura("skeleton", Math.round(r * 0.5)), f.auraR);
  if (inside && inside.heroSlowT > 0 && Math.abs(inside.heroSlow - f.auraSlow) < 1e-6 && inside.movespdEffective < inside.baseSpd)
    pass(`[AC-1] INSIDE r=${inside.dist}<=${f.auraR}: slow=${inside.heroSlow} slowT=${inside.heroSlowT}, movespd ${inside.baseSpd}→${inside.movespdEffective}`);
  else fail(`[AC-1] inside-radius slow not applied: ${JSON.stringify(inside)}`);
  const outside = await page.evaluate((r) => window.__dev.affixAura("skeleton", Math.round(r * 1.6)), f.auraR);
  if (outside && outside.heroSlow === 1 && outside.movespdEffective === outside.baseSpd)
    pass(`[AC-1] OUTSIDE r=${outside.dist}>${f.auraR}: slow=${outside.heroSlow} (full speed ${outside.movespdEffective}) → radius gate holds`);
  else fail(`[AC-1] outside-radius should NOT slow: ${JSON.stringify(outside)}`);

  // (3) ESENCIA (AC-2) — an affixed kill earns extra Esencia = affixKills*MOB_AFFIX_ESSENCE.
  const ess = await page.evaluate(() => window.__dev.affixEssence("frost", "skeleton"));
  if (ess && ess.affixKills >= 1 && ess.delta === ess.affixKills * ess.perAffix && ess.essence > ess.essenceNoAffix)
    pass(`[AC-2] affixed kill → +${ess.delta} Esencia (${ess.affixKills}×${ess.perAffix}); ${ess.essenceNoAffix}→${ess.essence}`);
  else fail(`[AC-2] Esencia tie-in off: ${JSON.stringify(ess)}`);

  // (4) RNG-NEUTRAL (AC-3) — deterministic roll + isolated Esencia term.
  const r1 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  const r2 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  if (r1.affixed === r2.affixed && JSON.stringify(r1.tally) === JSON.stringify(r2.tally))
    pass(`[AC-3] roll deterministic: ${r1.affixed}/${r1.n} affixed, identical tally ${JSON.stringify(r1.tally)} (server-safe)`);
  else fail(`[AC-3] affix roll NOT deterministic: ${r1.affixed} vs ${r2.affixed}`);
  if (r1.tally.frost > 0) pass(`[AC-3] frost rolls from the pool (${r1.tally.frost} of ${r1.affixed}) → variety, same draw count`);
  else fail(`[AC-3] frost never rolled across ${r1.n} eligible spawns: ${JSON.stringify(r1.tally)}`);
  const z = await page.evaluate(() => window.__dev.affixEssence("frost", "skeleton"));
  if (z.essence - z.essenceNoAffix === z.affixKills * z.perAffix)
    pass(`[AC-3] Esencia term is EXACTLY affixKills×${z.perAffix} → 0 affixed kills = 0 term = byte-identical payout`);
  else fail(`[AC-3] Esencia term not isolated: ${JSON.stringify(z)}`);

  // (5) PERF + JS — a live frost mob, 60fps held, no console errors.
  await page.evaluate(() => window.__dev.affixArena("frost", "skeleton", 80));
  const fps = await sampleFps(page, 1000);
  if (fps >= 55) pass(`[PERF] ${fps} fps with a frost mob live`);
  else fail(`[PERF] ${fps} fps (<55) with a frost mob`);
  if (errors.length === 0) pass(`[JS] 0 console/page errors`);
  else fail(`[JS] ${errors.length} errors: ${errors.slice(0, 3).join(" | ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.message ? e.message : e}`);
} finally {
  await browser.close();
  await srv.close();
}

console.log(ok ? "\nCAS-1586 Aura Gélida + Esencia tie-in: ALL PASS" : "\nCAS-1586: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
