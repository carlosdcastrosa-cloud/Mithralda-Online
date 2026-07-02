// ---------------------------------------------------------------------------
// TRUE-LIVE QA probe for CAS-127 — hits the deployed build at tender-bridge-504
// (not a local server) and verifies the game-feel / juice pass behaves on the
// SHIPPED bundle: real-swing feedback, distinct crit pop, small DoT ticks, pooled
// caps under a dense pack, reduce-motion + mute toggles, 60fps, 0 JS errors.
// Mirrors tools/cas127-juice.mjs assertions against the LIVE URL (iframe frame).
// Run: node tools/cas127-juice-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.juiceState))) return f; } catch {}
    }
    await wait(250);
  }
  throw new Error("game frame with __dev.juiceState never appeared (build may predate CAS-127)");
}
async function enterPlay(fr) {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QALive127";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  log(`→ loading LIVE ${LIVE}`);
  await page.goto(LIVE, { waitUntil: "load", timeout: 45000 });
  const fr = await gameFrame(page);
  const build = await fr.evaluate(async () => { try { const r = await fetch("/version.json", { cache: "no-store" }); return await r.json(); } catch (e) { return null; } });
  log(`   live build = ${JSON.stringify(build)}`);
  await enterPlay(fr);
  pass("entered play on LIVE build as 'warrior'");

  const st0 = await fr.evaluate(() => { window.__dev.clearFx(); return window.__dev.juiceState(); });
  if (st0.fxCap > 0 && st0.floaterCap > 0) pass(`[CAP] hard caps present LIVE: floaters≤${st0.floaterCap}, fx≤${st0.fxCap}`);
  else fail(`[CAP] caps missing: ${JSON.stringify(st0)}`);

  await fr.evaluate(() => window.__dev.juiceArena(12));
  const hit = await fr.evaluate(() => window.__dev.juiceSwing());
  if (hit.floaters > 0) pass(`[HIT] real swing spawned ${hit.floaters} damage floater(s)`);
  else fail(`[HIT] no floaters: ${JSON.stringify(hit)}`);
  if (hit.shake > 0) pass(`[HIT] real swing kicked shake (${hit.shake})`);
  else fail(`[HIT] no shake: ${JSON.stringify(hit)}`);
  if (hit.hitstop > 0) pass(`[HIT] real swing produced hitstop (${hit.hitstop}f)`);
  else fail(`[HIT] no hitstop: ${JSON.stringify(hit)}`);

  const nums = await fr.evaluate(() => window.__dev.floaterDump());
  if (nums.some((f) => f.pop > 1)) pass(`[NUM] damage numbers carry a pop scale (max ${Math.max(...nums.map((f) => f.pop))})`);
  else fail(`[NUM] no popping numbers: ${JSON.stringify(nums)}`);
  await page.screenshot({ path: "tools/cas127-live-hit.png" });

  await fr.evaluate(() => { window.__dev.juiceArena(4); window.__dev.clearFx(); });
  const crit = await fr.evaluate(() => window.__dev.forceCritSwing());
  const cf = (crit.dump || []).find((f) => f.crit);
  const normPop = Math.max(0, ...(nums.filter((f) => !f.crit && !f.small).map((f) => f.pop)));
  if (cf && cf.crit && cf.pop > normPop) pass(`[CRIT] crit number pops bigger & distinct (crit ${cf.pop} > normal ${normPop}, "${cf.txt}")`);
  else fail(`[CRIT] crit floater not distinct: ${JSON.stringify(crit.dump)}`);
  if (crit.shakeDelta > 0) pass(`[CRIT] crit adds extra shake (+${crit.shakeDelta})`);
  else fail(`[CRIT] no crit shake: ${JSON.stringify(crit)}`);

  await fr.evaluate(() => { window.__dev.statusArena("skeleton", 30, 0); window.__dev.applyStatusTo("enemy", "poison", { dmg: 4 }); window.__dev.clearFx(); });
  await wait(1400);
  const ticks = await fr.evaluate(() => window.__dev.floaterDump());
  if (ticks.some((f) => f.small)) pass(`[NUM] status ticks render small + distinct (${ticks.filter((f) => f.small).length} ticks)`);
  else fail(`[NUM] no small DoT-tick floaters: ${JSON.stringify(ticks)}`);

  const dense = await fr.evaluate(() => { window.__dev.juiceArena(40); for (let i = 0; i < 30; i++) window.__dev.juiceSwing(); return window.__dev.juiceState(); });
  if (dense.floaters <= dense.floaterCap && dense.fx <= dense.fxCap)
    pass(`[POOL] bounded under spam: floaters ${dense.floaters}/${dense.floaterCap}, fx ${dense.fx}/${dense.fxCap}`);
  else fail(`[POOL] overflowed caps: ${JSON.stringify(dense)}`);

  await fr.evaluate(() => { window.__dev.setReduceMotion(true); window.__dev.juiceArena(6); window.__dev.clearFx(); });
  const rmHit = await fr.evaluate(() => window.__dev.juiceSwing());
  if (rmHit.shake === 0) pass(`[RM] reduce-motion suppressed shake on a real hit`);
  else fail(`[RM] shake still fired under reduce-motion: ${rmHit.shake}`);
  await fr.evaluate(() => { window.__dev.setReduceMotion(false); window.__dev.juiceArena(6); window.__dev.clearFx(); });
  const onHit = await fr.evaluate(() => window.__dev.juiceSwing());
  if (onHit.shake > 0) pass(`[RM] shake restored when reduce-motion off`);
  else fail(`[RM] shake did not return: ${onHit.shake}`);

  const muteOff = await fr.evaluate(() => { window.__dev.setSound(false); return window.__dev.juiceState().sound; });
  const muteOn = await fr.evaluate(() => { window.__dev.setSound(true); return window.__dev.juiceState().sound; });
  if (muteOff === false && muteOn === true) pass(`[MUTE] SFX mute toggle works (off→${muteOff}, on→${muteOn})`);
  else fail(`[MUTE] mute toggle broken: off=${muteOff} on=${muteOn}`);

  await fr.evaluate(() => { window.__dev.juiceArena(30); ["orc", "wraith", "bandit", "skeleton"].forEach((t, i) => window.__dev.spawn(t, 80 * Math.cos(i), 80 * Math.sin(i))); });
  const fps = await fr.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps LIVE under a dense mixed pack`);
  else fail(`[FPS] dropped to ${fps} fps`);

  if (errors.length === 0) pass("[ERR] zero JS errors across the LIVE run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
}
log(ok ? "\n✓ CAS-127 LIVE probe passed." : "\n✗ CAS-127 LIVE probe FAILED.");
process.exit(ok ? 0 : 1);
