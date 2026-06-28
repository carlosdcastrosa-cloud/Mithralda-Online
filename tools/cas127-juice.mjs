// ---------------------------------------------------------------------------
// CAS-127 — game-feel / juice pass QA harness (local committed build).
//
// Boots the real game headless and drives the REAL combat path (heroAttack →
// applyHeroMelee → hitEnemy), then asserts the juice fires, stays pooled/capped,
// and the toggles work — all WITHOUT injecting synthetic feedback:
//   [HIT]    a real swing emits floaters + screen shake + hitstop
//   [CRIT]   a crit pops a bigger, distinct number + brighter feedback (extra shake)
//   [NUM]    damage numbers carry a pop scale; DoT/status ticks render small + coloured
//   [POOL]   under a dense pack + spam, floaters/fx stay bounded by their hard caps
//   [RM]     reduce-motion zeroes screen shake (and trims flourishes)
//   [MUTE]   the SFX mute toggle flips audio on/off
//   [FPS]    60fps target holds under a dense mixed pack
//   [ERR]    zero JS errors across the run
//
// Run: npm run juice   (node tools/cas127-juice.mjs)
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
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { if (window.__dev.noSave) window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QAJuice";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // caps are exposed (proof the systems are bounded by design)
  const st0 = await page.evaluate(() => { window.__dev.clearFx(); return window.__dev.juiceState(); });
  if (st0.fxCap > 0 && st0.floaterCap > 0) pass(`[CAP] hard caps present: floaters≤${st0.floaterCap}, fx≤${st0.fxCap}`);
  else fail(`[CAP] caps missing: ${JSON.stringify(st0)}`);

  // [HIT] a REAL swing into a packed arena emits floaters + shake + hitstop.
  await page.evaluate(() => window.__dev.juiceArena(12));
  const hit = await page.evaluate(() => window.__dev.juiceSwing());
  if (hit.floaters > 0) pass(`[HIT] a real swing spawned ${hit.floaters} damage floater(s)`);
  else fail(`[HIT] swing produced no floaters: ${JSON.stringify(hit)}`);
  if (hit.shake > 0) pass(`[HIT] swing kicked screen shake (${hit.shake})`);
  else fail(`[HIT] no shake on hit: ${JSON.stringify(hit)}`);
  if (hit.hitstop > 0) pass(`[HIT] swing produced hitstop (${hit.hitstop} frames)`);
  else fail(`[HIT] no hitstop on hit: ${JSON.stringify(hit)}`);

  // [NUM] the spawned numbers carry a pop scale > 1.
  const nums = await page.evaluate(() => window.__dev.floaterDump());
  if (nums.some((f) => f.pop > 1)) pass(`[NUM] damage numbers carry a pop scale (max ${Math.max(...nums.map((f) => f.pop))})`);
  else fail(`[NUM] no popping numbers: ${JSON.stringify(nums)}`);

  // [CRIT] a forced crit pops a bigger, distinct number + adds extra shake.
  await page.evaluate(() => { window.__dev.juiceArena(4); window.__dev.clearFx(); });
  const crit = await page.evaluate(() => window.__dev.forceCritSwing());
  const cf = (crit.dump || []).find((f) => f.crit);
  const normPop = Math.max(0, ...(nums.filter((f) => !f.crit && !f.small).map((f) => f.pop)));
  if (cf && cf.crit && cf.pop > normPop) pass(`[CRIT] crit number pops bigger & distinct (crit pop ${cf.pop} > normal ${normPop}, txt "${cf.txt}")`);
  else fail(`[CRIT] crit floater not distinct: ${JSON.stringify(crit.dump)}`);
  if (crit.shakeDelta > 0) pass(`[CRIT] crit adds an extra shake kick (+${crit.shakeDelta})`);
  else fail(`[CRIT] crit added no shake: ${JSON.stringify(crit)}`);

  // [NUM] DoT/status ticks render small + status-coloured (distinct from hits).
  await page.evaluate(() => { window.__dev.statusArena("skeleton", 30, 0); window.__dev.applyStatusTo("enemy", "poison", { dmg: 4 }); window.__dev.clearFx(); });
  await wait(1400); // let the poison tick a few times on the real clock
  const ticks = await page.evaluate(() => window.__dev.floaterDump());
  if (ticks.some((f) => f.small)) pass(`[NUM] status ticks render small + distinct (${ticks.filter((f) => f.small).length} small ticks)`);
  else fail(`[NUM] no small DoT-tick floaters seen: ${JSON.stringify(ticks)}`);

  // [POOL] dense pack + spam swings — floaters/fx stay bounded by their caps.
  const dense = await page.evaluate(async () => {
    window.__dev.juiceArena(40);
    for (let i = 0; i < 30; i++) { window.__dev.juiceSwing(); }
    const s = window.__dev.juiceState();
    return s;
  });
  if (dense.floaters <= dense.floaterCap && dense.fx <= dense.fxCap)
    pass(`[POOL] bounded under spam: floaters ${dense.floaters}/${dense.floaterCap}, fx ${dense.fx}/${dense.fxCap}, pool=${dense.pool}`);
  else fail(`[POOL] overflowed caps: ${JSON.stringify(dense)}`);

  // [RM] reduce-motion zeroes screen shake even on a real hit.
  await page.evaluate(() => { window.__dev.setReduceMotion(true); window.__dev.juiceArena(6); window.__dev.clearFx(); });
  const rmHit = await page.evaluate(() => window.__dev.juiceSwing());
  if (rmHit.shake === 0) pass(`[RM] reduce-motion suppressed screen shake on a real hit (shake=${rmHit.shake})`);
  else fail(`[RM] shake still fired under reduce-motion: ${rmHit.shake}`);
  await page.evaluate(() => { window.__dev.setReduceMotion(false); window.__dev.juiceArena(6); window.__dev.clearFx(); });
  const onHit = await page.evaluate(() => window.__dev.juiceSwing());
  if (onHit.shake > 0) pass(`[RM] shake restored when reduce-motion off (shake=${onHit.shake})`);
  else fail(`[RM] shake did not return after toggling reduce-motion off: ${onHit.shake}`);

  // [MUTE] SFX mute toggle flips audio enabled state.
  const muteOff = await page.evaluate(() => { window.__dev.setSound(false); return window.__dev.juiceState().sound; });
  const muteOn = await page.evaluate(() => { window.__dev.setSound(true); return window.__dev.juiceState().sound; });
  if (muteOff === false && muteOn === true) pass(`[MUTE] SFX mute toggle works (off→${muteOff}, on→${muteOn})`);
  else fail(`[MUTE] mute toggle broken: off=${muteOff} on=${muteOn}`);

  // [FPS] dense mixed pack holds the frame budget.
  await page.evaluate(() => { window.__dev.juiceArena(30); ["orc", "wraith", "bandit", "skeleton"].forEach((t, i) => window.__dev.spawn(t, 80 * Math.cos(i), 80 * Math.sin(i))); });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps under a dense mixed pack`);
  else fail(`[FPS] dropped to ${fps} fps`);

  await page.screenshot({ path: "tools/cas127-juice-screenshot.png" });
  if (errors.length === 0) pass("[ERR] zero JS errors across the run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? "\n✓ CAS-127 juice harness passed." : "\n✗ CAS-127 juice harness FAILED.");
process.exit(ok ? 0 : 1);
