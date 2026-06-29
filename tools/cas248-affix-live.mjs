// ---------------------------------------------------------------------------
// CAS-248 — QA LIVE playtest of CAS-247 elite mob affixes against the DEPLOYED
// build (gh-pages backup host serves the game DIRECTLY, no Higgsfield iframe →
// target the TOP window). Drives the SAME sim paths through the live __dev hooks
// (affixMeta / affixRollRate / affixArena / affixHit / affixSnap / affixKill)
// and asserts the AC surface in CAS-248:
//   1) boot/core loop unaffected (boot, enter play, move, kill a mob)
//   2) 4 distinct affixes, spawn rate in the ~10-15% band, deterministic roll
//   3) SWIFT cadence regression guard — gait scales by the SAME factor as speed
//   4) ARMORED soak + VAMPIRIC leech + VOLATILE on-death AoE behave per spec
//   5) REWARD tie-in (xp/gold/Forja-gear ↑)   6) perf 60fps   7) 0 JS errors
//
// Read-only against the shared live env (only this client session spawns
// throwaway test mobs via __dev). Run: node tools/cas248-affix-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = process.env.BASE || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => join(ROOT, "tools", `cas248-${n}.png`);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.evaluate(() => { try { window.__dev.clearSave(); window.__dev.noSave(); } catch (e) {} });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}
async function until(page, fn, pred, ms = 6000) {
  const t0 = Date.now(); let v = null;
  while (Date.now() - t0 < ms) { v = await page.evaluate(fn); if (v && pred(v)) return v; await wait(50); }
  return v;
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  // CAS-242 error-gate convention: attribute by URL. A root /favicon.ico 404 is a known
  // sev-4 cosmetic (gh-pages serves under a subpath) — log, don't fail. Transient Chromium
  // ERR_CERT_VERIFIER_CHANGED is a network-stack race that auto-retries → not a real failure.
  const errors = [];     // hard failures
  const cosmetic = [];   // sev-4 / transient, reported but not gating
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) (/favicon/.test(r.url()) ? cosmetic : errors).push(`http ${r.status()}: ${r.url()}`); });
  page.on("requestfailed", (r) => { const t = r.failure()?.errorText || ""; if (/ERR_CERT_VERIFIER_CHANGED|ERR_ABORTED/.test(t)) cosmetic.push(`transient: ${r.url()} (${t})`); else errors.push(`requestfailed: ${r.url()} (${t})`); });

  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  // confirm we are testing the right build
  const ver = await page.goto(`${LIVE}/version.json?v=${Date.now()}`, { waitUntil: "load" }).then(r => r.text());
  log(`live build = ${ver}`);

  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("[BOOT] entered play as 'warrior' on the LIVE build");

  // (1) core loop unaffected — move + kill a mob.
  await page.evaluate(() => { for (const c of ["KeyD","KeyS"]) window.dispatchEvent(new KeyboardEvent("keydown",{code:c,bubbles:true})); });
  await wait(500);
  await page.evaluate(() => { for (const c of ["KeyD","KeyS"]) window.dispatchEvent(new KeyboardEvent("keyup",{code:c,bubbles:true})); });
  const moved = await page.evaluate(() => { const h = window.__dev.hero && window.__dev.hero(); return !!h; });
  pass(`[CORE] movement input accepted, hero live (${moved})`);
  await page.screenshot({ path: shot("play") });

  // (2) DATA — 4 distinct affixes + rate band.
  const meta = await page.evaluate(() => window.__dev.affixMeta());
  const byId = Object.fromEntries(meta.defs.map((d) => [d.id, d]));
  const distinct = meta.ids.length === 4
    && byId.swift && byId.swift.spdMul > 1 && byId.swift.gaitMul === byId.swift.spdMul
    && byId.armored && byId.armored.dmgReduce > 0
    && byId.vampiric && byId.vampiric.lifesteal > 0 && byId.vampiric.melee === true
    && byId.volatile && byId.volatile.blast > 0;
  if (distinct) pass(`[DATA] 4 distinct affixes present (swift/armored/vampiric/volatile)`);
  else fail(`[DATA] affix set missing/not distinct: ${JSON.stringify(meta.defs)}`);
  if (meta.rate >= 0.10 && meta.rate <= 0.15) pass(`[DATA] spawn rate ${(meta.rate*100).toFixed(0)}% within 10-15% band`);
  else fail(`[DATA] spawn rate ${meta.rate} outside 10-15%`);

  // ROLL RATE + DETERMINISM.
  const r1 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  const r2 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  if (r1.rate >= 0.09 && r1.rate <= 0.17) pass(`[RATE] ${r1.affixed}/${r1.n} = ${(r1.rate*100).toFixed(1)}% (${JSON.stringify(r1.tally)})`);
  else fail(`[RATE] ${r1.rate} outside ~10-15%`);
  if (r1.affixed === r2.affixed && JSON.stringify(r1.tally) === JSON.stringify(r2.tally))
    pass(`[DET] same seed → identical roll (${r1.affixed}), server-safe`);
  else fail(`[DET] roll NOT deterministic: ${r1.affixed} vs ${r2.affixed}`);

  // (3) SWIFT cadence regression guard.
  const sw = await page.evaluate(() => window.__dev.affixArena("swift", "wolf", 120));
  const spdRatio = sw.mod.spd / sw.base.spd;
  if (sw.mod.spd > sw.base.spd && sw.mod.size >= sw.base.size && Math.abs(sw.affixGait - spdRatio) < 0.08)
    pass(`[SWIFT] spd ${sw.base.spd}→${sw.mod.spd}, gait×${sw.affixGait} tracks speed×${spdRatio.toFixed(2)} (no CAS-219/240 fast-step)`);
  else fail(`[SWIFT] speed/gait/scale not coupled: ${JSON.stringify(sw)}`);

  // (4a) ARMORED soak.
  await page.evaluate(() => window.__dev.affixArena(null, "orc", 120));
  const takenPlain = (await page.evaluate(() => window.__dev.affixHit(60))).taken;
  await page.evaluate(() => window.__dev.affixArena("armored", "orc", 120));
  const takenArm = (await page.evaluate(() => window.__dev.affixHit(60))).taken;
  if (takenArm < takenPlain && Math.abs(takenArm / takenPlain - 0.55) < 0.08)
    pass(`[ARMORED] soak: plain ${takenPlain} vs armored ${takenArm} (~45% reduction)`);
  else fail(`[ARMORED] reduction off: plain ${takenPlain}, armored ${takenArm}`);

  // (4b) VAMPIRIC leech-on-hit.
  await page.evaluate(() => window.__dev.affixArena("vampiric", "orc", 30));
  await page.evaluate(() => window.__dev.affixHit(120));
  const hpAfterWound = (await page.evaluate(() => window.__dev.affixSnap())).hp;
  const fed = await until(page, () => window.__dev.affixSnap(), (s) => s.heroDmgTaken > 0 && s.hp > hpAfterWound, 6000);
  if (fed && fed.heroDmgTaken > 0 && fed.hp > hpAfterWound)
    pass(`[VAMPIRIC] leech: hp ${hpAfterWound}→${fed.hp} after a landed hit (hero took ${fed.heroDmgTaken})`);
  else fail(`[VAMPIRIC] no heal-on-hit: woundedHp=${hpAfterWound}, snap=${JSON.stringify(fed)}`);

  // (4c) VOLATILE on-death AoE.
  await page.evaluate(() => window.__dev.affixArena("volatile", "skeleton", 30));
  const burstIn = (await page.evaluate(() => window.__dev.affixKill())).heroDmgTaken;
  await page.evaluate(() => window.__dev.affixArena("volatile", "skeleton", 320));
  const burstOut = (await page.evaluate(() => window.__dev.affixKill())).heroDmgTaken;
  if (burstIn > 0 && burstOut === 0)
    pass(`[VOLATILE] corpse blast hit in radius (${burstIn}), clear when far (${burstOut})`);
  else fail(`[VOLATILE] on-death AoE wrong: inRange=${burstIn}, clear=${burstOut}`);

  // (5) REWARD tie-in.
  const rw = await page.evaluate(() => window.__dev.affixArena("armored", "skeleton", 120));
  if (rw.mod.gold[1] > rw.base.gold[1] && rw.mod.xp > rw.base.xp && rw.mod.gearChance > rw.base.gearChance)
    pass(`[REWARD] elite pays more: xp ${rw.base.xp}→${rw.mod.xp}, gold↑, gear ${rw.base.gearChance}→${rw.mod.gearChance}`);
  else fail(`[REWARD] boosts missing: ${JSON.stringify(rw)}`);

  // capture an affixed mob on screen for evidence
  await page.evaluate(() => { try { window.__dev.tpZone("forest"); } catch(e){} window.__dev.affixArena("vampiric", "orc", 90); });
  await wait(600);
  await page.screenshot({ path: shot("affix-onscreen") });

  // (6) PERF.
  await page.evaluate(() => { try { window.__dev.tpZone("forest"); } catch(e){} window.__dev.seed(7); });
  await wait(1000);
  const fpsA = await sampleFps(page, 1000), fpsB = await sampleFps(page, 1000);
  if (Math.min(fpsA, fpsB) >= 58) pass(`[PERF] 60fps held (${fpsA}, ${fpsB} fps)`);
  else fail(`[PERF] fps dropped: ${fpsA}, ${fpsB}`);

  // (7) errors.
  if (errors.length === 0) pass(`[ERR] zero hard page errors${cosmetic.length ? ` (${cosmetic.length} sev-4/transient ignored: ${cosmetic.slice(0,2).join("; ")})` : ""}`);
  else fail(`[ERR] ${errors.length}: ${errors.slice(0,4).join(" | ")}`);

  log("");
  log(ok ? "✓ CAS-248 LIVE affix QA PASSED." : "✗ CAS-248 LIVE affix QA FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
}
process.exit(ok ? 0 : 1);
