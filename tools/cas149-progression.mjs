// ---------------------------------------------------------------------------
// CAS-149 — persistent progression + meaningful elite loot headless harness. Boots the
// REAL game in headless Chromium and drives the new ELITE MASTERY track through the SAME
// sim kill/loot paths the game runs (killEnemy → onEliteKill → noteEliteKill / masteryLoot),
// asserting:
//   1) BASELINE: a fresh hero starts at Mastery rank 0 (0 elite kills, next at 3).
//   2) ELITE-EXCLUSIVE: a NORMAL mob kill does NOT feed Mastery (only elite-class kills do).
//   3) MEANINGFUL ELITE LOOT (rank 0): killing an elite drops uncommon+ gear + the base
//      elite gold bonus — the loot that feeds progression, not empty/decorative drops.
//   4) RANK-UP BAKES PERMANENT POWER: crossing a threshold raises the rank and bakes a
//      small, capped permanent +maxHp (gratifying but not trivializing).
//   5) PERSISTS ACROSS SESSIONS: after a reload (the localStorage save), the lifetime elite
//      kills + rank + the baked +maxHp survive — and are NOT re-applied (no double-count).
//   6) LOOT SCALES WITH MASTERY: at a high rank the elite drop's rarity FLOOR rises (epic)
//      and the bonus gold scales per rank — the self-reinforcing loop.
//   7) 60 FPS held after a burst of elite kills — perf budget.
//   8) 0 JS errors across the run.
//
// Run: npm run progression149   (or: node tools/cas149-progression.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "MasteryBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
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

  // Clear the save on the FIRST document only; preserve it on the reload (step 5) so the
  // persistence test is genuine. sessionStorage survives reload within the same tab.
  await page.evaluateOnNewDocument(() => {
    try { if (!sessionStorage.getItem("__booted")) { localStorage.removeItem("mithralda.save.v1"); sessionStorage.setItem("__booted", "1"); } } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (1) BASELINE — fresh hero at Mastery rank 0.
  const base = await page.evaluate(() => window.__dev.masterySnap());
  if (base && base.eliteKills === 0 && base.rank === 0 && base.next === 3)
    pass(`[BASELINE] fresh hero at Mastery 0 (0 elite kills, next at ${base.next}), maxHp ${base.maxHp}`);
  else fail(`[BASELINE] unexpected starting Mastery state: ${JSON.stringify(base)}`);
  const baseHp = base.maxHp;

  // (2) ELITE-EXCLUSIVE — a normal mob kill must NOT advance Mastery.
  await page.evaluate(() => { window.__dev.tpZone("caves"); window.__dev.seed(7); window.__dev.spawnKill("orc"); });
  const afterTrash = await page.evaluate(() => window.__dev.masterySnap());
  if (afterTrash && afterTrash.eliteKills === 0)
    pass("[EXCLUSIVE] a normal mob kill does NOT feed Mastery (elite-class only)");
  else fail(`[EXCLUSIVE] a trash kill leaked into the Mastery counter: ${JSON.stringify(afterTrash)}`);

  // (3) MEANINGFUL ELITE LOOT @ rank 0 — guaranteed uncommon+ gear + base elite gold (35).
  const drops0 = await page.evaluate(() => window.__dev.eliteSpawnKill("orc", "caves"));
  const gear0 = drops0.find((d) => d.kind === "gear");
  const gold0 = drops0.find((d) => d.kind === "gold" && d.amt >= 30);
  if (gear0 && RANK[gear0.rarity] >= 1 && gold0 && gold0.amt === 35)
    pass(`[LOOT@0] elite drop is meaningful — ${gear0.rarity} gear (tier ${gear0.tier}) + ${gold0.amt} gold`);
  else fail(`[LOOT@0] elite did not yield uncommon+ gear + base gold 35: ${JSON.stringify(drops0)}`);

  // (4) RANK-UP BAKES +maxHp — park at 2 kills, then tick ONE elite kill across the rank-1
  // threshold. Use bumpMastery() (the real noteEliteKill path WITHOUT XP/loot) so the +maxHp
  // is isolated from the level-up maxHp that XP-granting kills also add. Measure the delta.
  void baseHp; // (the rank-up maxHp is measured as a delta below, not vs the level-1 baseline)
  await page.evaluate(() => window.__dev.setEliteKills(2));
  const preHp = (await page.evaluate(() => window.__dev.masterySnap())).maxHp;
  const r1 = await page.evaluate(() => window.__dev.bumpMastery());
  if (r1 && r1.eliteKills === 3 && r1.rank === 1 && r1.maxHp === preHp + 8)
    pass(`[RANK-UP] crossing the threshold → Mastery 1, permanent maxHp ${preHp}→${r1.maxHp} (+8 baked)`);
  else fail(`[RANK-UP] rank/maxHp bake wrong (expected rank 1, maxHp ${preHp + 8}): ${JSON.stringify(r1)}`);

  // (5) PERSISTS ACROSS SESSIONS — reload triggers the beforeunload save flush; the save
  // rehydrates straight into play. Elite kills + rank + baked maxHp must survive EXACTLY (a
  // double-count bug would re-apply the +8 on load → maxHp would jump again).
  const pre = await page.evaluate(() => window.__dev.masterySnap());
  await wait(300);                                   // let the value settle before the flush
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 15000 });
  const reload = await page.evaluate(() => window.__dev.masterySnap());
  if (reload && reload.eliteKills === pre.eliteKills && reload.rank === pre.rank && reload.maxHp === pre.maxHp)
    pass(`[PERSIST] after reload: Mastery ${reload.rank}, ${reload.eliteKills} elite kills, maxHp ${reload.maxHp} (no re-bake)`);
  else fail(`[PERSIST] progression lost or double-counted on reload (expected ${JSON.stringify(pre)}): ${JSON.stringify(reload)}`);

  // (6) LOOT SCALES WITH MASTERY — park at rank 4 (28 kills); the elite drop's rarity FLOOR
  // rises to epic and the bonus gold scales (35 + rank*8 = 67). Sample several to prove the
  // floor holds (not a lucky roll).
  await page.evaluate(() => { window.__dev.tpZone("caves"); window.__dev.seed(3); window.__dev.setEliteKills(28); });
  const hi = await page.evaluate(() => {
    const out = []; for (let i = 0; i < 4; i++) out.push(window.__dev.eliteSpawnKill("orc", "caves"));
    return { drops: out, rank: window.__dev.masterySnap().rank };
  });
  const gears = hi.drops.map((d) => d.find((x) => x.kind === "gear")).filter(Boolean);
  const golds = hi.drops.map((d) => d.find((x) => x.kind === "gold" && x.amt >= 30)).filter(Boolean);
  const allEpic = gears.length === 4 && gears.every((g) => g.rarity === "epic");
  const goldScaled = golds.length === 4 && golds.every((g) => g.amt === 67);
  if (hi.rank === 4 && allEpic && goldScaled)
    pass(`[SCALE] @Mastery 4 every elite drop is EPIC-floored + ${golds[0].amt} gold (35 + 4×8)`);
  else fail(`[SCALE] high-Mastery elite loot did not scale: rank ${hi.rank}, gears ${JSON.stringify(gears.map((g) => g.rarity))}, golds ${JSON.stringify(golds.map((g) => g.amt))}`);

  // (7) PERF — fps after a burst of elite kills.
  const fpsA = await sampleFps(page, 1000);
  const fpsB = await sampleFps(page, 1000);
  if (Math.min(fpsA, fpsB) >= 58) pass(`[PERF] 60fps held (${fpsA}, ${fpsB} fps)`);
  else fail(`[PERF] fps dropped: ${fpsA}, ${fpsB}`);

  // (8) zero JS errors.
  if (errors.length === 0) pass("[ERR] zero page errors");
  else fail(`[ERR] ${errors.length} page error(s): ${errors.slice(0, 4).join(" | ")}`);

  log("");
  log(ok ? "✓ CAS-149 persistent progression + meaningful elite loot self-test passed." : "✗ CAS-149 self-test FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
process.exit(ok ? 0 : 1);
