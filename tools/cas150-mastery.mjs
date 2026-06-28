// ---------------------------------------------------------------------------
// CAS-150 — Elite-Mastery REWARD TRACK headless harness. Boots the REAL game in headless
// Chromium and drives the new milestone reward-track through the SAME sim paths the game
// runs (recalcMastery → h.mperk → heroMaxHp / hitEnemy), asserting:
//   1) BASELINE: a fresh hero has the whole track LOCKED (0 unlocked), perks all zero, the
//      next milestone at 5 elite kills.
//   2) PANEL UI: the V key opens the reward-track screen (scene 'mastery') and V/ESC closes
//      it — the visible progress indicator the issue requires, driven through real input.
//   3) MILESTONE 1 UNLOCK = REAL +maxHp: crossing 5 elite kills unlocks "Constitución del
//      Cazador" and the hero's EFFECTIVE max HP rises by exactly +20 (derived, not baked).
//   4) PERK BUNDLE PER MILESTONE: at 15 / 35 / 70 lifetime kills the aggregated perk bundle
//      matches the track (crit 6 · +eliteDmg 18 · global dmg 8 + maxHp 35), each unlock flagged.
//   5) REAL COMBAT EFFECT: at the "Verdugo de Élites" milestone one melee hit deals ~18% MORE
//      to an elite-class target than to a normal one (RNG reseeded so crit cancels out).
//   6) PERSISTS ACROSS SESSIONS: after a reload the unlocked milestones + perks + the derived
//      +maxHp survive (rebuilt from the persisted lifetime count — reversible, no backend).
//   7) 60 FPS held with the panel open — perf budget.
//   8) 0 JS errors across the run.
//
// Run: npm run mastery   (or: node tools/cas150-mastery.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "TrackBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

async function key(page, code) {
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
  await wait(60);
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

  // Clear the save on the FIRST document only; preserve it on the reload (step 6) so the
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

  // (1) BASELINE — whole track locked, perks zero, next milestone at 5.
  const base = await page.evaluate(() => window.__dev.masteryTrackSnap());
  const snap0 = await page.evaluate(() => window.__dev.masterySnap());
  const perksZero = base && Object.values(base.perks).every((v) => v === 0);
  const allLocked = base && base.track.length === 4 && base.track.every((m) => !m.unlocked);
  if (base && base.eliteKills === 0 && allLocked && perksZero && snap0.nextMilestone && snap0.nextMilestone.at === 5)
    pass(`[BASELINE] fresh hero: track all LOCKED, perks zero, next milestone "${snap0.nextMilestone.name}" at 5 kills`);
  else fail(`[BASELINE] unexpected starting track: ${JSON.stringify(base)} / next ${JSON.stringify(snap0.nextMilestone)}`);

  // (2) PANEL UI — V opens the reward-track screen, V closes it (real input path).
  await key(page, "KeyV");
  const opened = await page.evaluate(() => window.__dev.scene());
  await key(page, "KeyV");
  const closed = await page.evaluate(() => window.__dev.scene());
  if (opened === "mastery" && closed === "play") pass("[PANEL] V opens the Senda de Maestría panel and closes it (visible progress indicator)");
  else fail(`[PANEL] mastery panel toggle failed: opened='${opened}', closed='${closed}'`);

  // (3) MILESTONE 1 = REAL +maxHp. Use setEliteKills (no rank-bake) so the derived +20 from the
  // milestone is isolated. effMaxHp folds h.mperk.hp → it must rise by exactly 20 at the cross.
  const e4 = await page.evaluate(() => { window.__dev.setEliteKills(4); return window.__dev.masterySnap(); });
  const e5 = await page.evaluate(() => { window.__dev.setEliteKills(5); return window.__dev.masterySnap(); });
  if (e4.unlocked === 0 && e5.unlocked === 1 && e5.effMaxHp === e4.effMaxHp + 20)
    pass(`[UNLOCK] crossing 5 kills unlocks milestone 1 → effective maxHp ${e4.effMaxHp}→${e5.effMaxHp} (+20, derived)`);
  else fail(`[UNLOCK] milestone-1 +maxHp wrong (expected ${e4.effMaxHp + 20}): ${JSON.stringify({ e4, e5 })}`);

  // (4) PERK BUNDLE PER MILESTONE — park at each threshold, read the aggregated bundle.
  const t15 = await page.evaluate(() => { window.__dev.setEliteKills(15); return window.__dev.masteryTrackSnap(); });
  const t35 = await page.evaluate(() => { window.__dev.setEliteKills(35); return window.__dev.masteryTrackSnap(); });
  const t70 = await page.evaluate(() => { window.__dev.setEliteKills(70); return window.__dev.masteryTrackSnap(); });
  const okCrit = t15.perks.crit === 6 && t15.perks.hp === 20 && t15.track.filter((m) => m.unlocked).length === 2;
  const okElite = t35.perks.eliteDmgPct === 18 && t35.track.filter((m) => m.unlocked).length === 3;
  const okSupreme = t70.perks.dmgPct === 8 && t70.perks.hp === 35 && t70.track.every((m) => m.unlocked);
  if (okCrit && okElite && okSupreme)
    pass(`[PERKS] bundle scales per milestone — @15 crit6/hp20 · @35 +eliteDmg18 · @70 dmg8/hp35 (all unlocked)`);
  else fail(`[PERKS] perk aggregation wrong: @15 ${JSON.stringify(t15.perks)} @35 ${JSON.stringify(t35.perks)} @70 ${JSON.stringify(t70.perks)}`);

  // (5) REAL COMBAT — at the "Verdugo de Élites" milestone (35 kills: eliteDmg 18, no global
  // dmg yet) one melee hit deals ~18% more to an elite than a normal target. Reseed before each
  // so the crit roll is identical and cancels in the ratio.
  await page.evaluate(() => window.__dev.setEliteKills(35));
  const dNorm = await page.evaluate(() => { window.__dev.seed(5); return window.__dev.dmgVsTarget(false); });
  const dElite = await page.evaluate(() => { window.__dev.seed(5); return window.__dev.dmgVsTarget(true); });
  if (dNorm > 0 && near(dElite, dNorm * 1.18, Math.max(0.5, dNorm * 0.02)))
    pass(`[COMBAT] one hit deals ${dElite} to an elite vs ${dNorm} to a normal target (+18% — perk is live in hitEnemy)`);
  else fail(`[COMBAT] eliteDmgPct not applied in combat: normal ${dNorm}, elite ${dElite} (expected ~${(dNorm * 1.18).toFixed(2)})`);

  // (6) PERSISTS ACROSS SESSIONS — park at 15, reload, and confirm the unlocked milestones +
  // perks + the derived +20 maxHp rebuild from the persisted lifetime count (no backend).
  await page.evaluate(() => window.__dev.setEliteKills(15));
  const pre = await page.evaluate(() => window.__dev.masteryTrackSnap());
  const preHp = (await page.evaluate(() => window.__dev.masterySnap())).effMaxHp;
  await wait(300);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'play'", { timeout: 15000 });
  const post = await page.evaluate(() => window.__dev.masteryTrackSnap());
  const postHp = (await page.evaluate(() => window.__dev.masterySnap())).effMaxHp;
  const unlockedSame = post.track.filter((m) => m.unlocked).length === 2;
  if (post.eliteKills === 15 && unlockedSame && post.perks.crit === pre.perks.crit && post.perks.hp === 20 && postHp === preHp)
    pass(`[PERSIST] after reload: 15 kills, 2 milestones unlocked, perks ${JSON.stringify(post.perks)}, effMaxHp ${postHp} (rebuilt, no re-bake)`);
  else fail(`[PERSIST] reward track lost/changed on reload (pre ${JSON.stringify(pre.perks)}/${preHp}): ${JSON.stringify(post.perks)}/${postHp}`);

  // (7) PERF — fps with the mastery panel open.
  await key(page, "KeyV");
  const fpsA = await sampleFps(page, 1000);
  const fpsB = await sampleFps(page, 1000);
  await key(page, "KeyV");
  if (Math.min(fpsA, fpsB) >= 58) pass(`[PERF] 60fps held with panel open (${fpsA}, ${fpsB} fps)`);
  else fail(`[PERF] fps dropped: ${fpsA}, ${fpsB}`);

  // (8) zero JS errors.
  if (errors.length === 0) pass("[ERR] zero page errors");
  else fail(`[ERR] ${errors.length} page error(s): ${errors.slice(0, 4).join(" | ")}`);

  log("");
  log(ok ? "✓ CAS-150 Elite-Mastery reward-track self-test passed." : "✗ CAS-150 self-test FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
process.exit(ok ? 0 : 1);
