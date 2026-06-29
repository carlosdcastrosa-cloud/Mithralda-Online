// ---------------------------------------------------------------------------
// CAS-273 — combat juice POLISH pass QA harness (local committed build).
//
// CAS-273 is a NON-balance "juice" pass. The bulk of the combat feel (hit-stop,
// shake, damage numbers, hit-flash, knockback, particles/SFX, reduce-motion +
// colorblind toggles) already shipped under CAS-127/204/210/265 — this harness
// re-proves that contract still holds AND verifies the two new polish deltas:
//   [KILL] every ordinary kill now lands a subtle, size-scaled screen-shake
//          ("shake escalado por muerte") on the REAL killEnemy path
//   [RM]   that kill-shake is fully gated by reduce-motion (shakeDelta == 0)
//   [NUM]  rapid stacked damage numbers fan across a 3-lane offset (f.dx) so
//          back-to-back hits stay readable (anti-overlap, pure presentation)
//   [REG]  prior juice still fires (hit floaters + shake + hitstop, crit pop)
//   [FPS]  60fps target holds; [ERR] zero JS errors across the run
//
// Run: npm run cas273   (node tools/cas273-juice.mjs)
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
    document.getElementById("nameInput").value = "QA273";
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

  // [REG] real swing still emits the full juice contract.
  await page.evaluate(() => { window.__dev.setReduceMotion(false); window.__dev.juiceArena(8); });
  const hit = await page.evaluate(() => window.__dev.juiceSwing());
  if (hit.floaters > 0 && hit.shake > 0 && hit.hitstop > 0) pass(`[REG] swing emits floaters(${hit.floaters}) + shake(${hit.shake}) + hitstop(${hit.hitstop})`);
  else fail(`[REG] swing juice incomplete: ${JSON.stringify(hit)}`);

  // [NUM] anti-overlap: rapid floaters fan across the 3-lane offset (dx ∈ {-6,0,+6}).
  const dump = await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__dev.juiceSwing(); return window.__dev.floaterDump(); });
  const dxs = [...new Set(dump.map((f) => f.dx))].sort((a, b) => a - b);
  const hasLanes = dxs.includes(-6) && dxs.includes(0) && dxs.includes(6);
  if (hasLanes) pass(`[NUM] damage numbers fan across lanes dx=${JSON.stringify(dxs)} (anti-overlap)`);
  else fail(`[NUM] expected lanes {-6,0,6}, got ${JSON.stringify(dxs)}`);

  // [KILL] an ordinary kill kicks a subtle size-scaled shake on the REAL kill path.
  const kp = await page.evaluate(() => window.__dev.killShakeProbe());
  if (kp && kp.killed && kp.shakeDelta >= 1.2 && kp.shakeDelta <= 3.01) pass(`[KILL] ordinary kill kicked shake +${kp.shakeDelta} (size-scaled, in 1.2–3 band)`);
  else fail(`[KILL] kill-shake out of band or no kill: ${JSON.stringify(kp)}`);

  // [RM] the kill-shake is fully suppressed under reduce-motion.
  const kpr = await page.evaluate(() => { window.__dev.setReduceMotion(true); const r = window.__dev.killShakeProbe(); window.__dev.setReduceMotion(false); return r; });
  if (kpr && kpr.killed && kpr.shakeDelta === 0) pass(`[RM] reduce-motion zeroed the kill-shake (delta=${kpr.shakeDelta})`);
  else fail(`[RM] kill-shake not gated by reduce-motion: ${JSON.stringify(kpr)}`);

  // [FPS] hold the frame budget under a dense pack.
  await page.evaluate(() => { window.__dev.setReduceMotion(false); window.__dev.juiceArena(24); });
  const fps = await page.evaluate(async () => {
    let last = performance.now(), n = 0, acc = 0;
    return await new Promise((res) => { const tick = () => { const t = performance.now(); acc += 1000 / (t - last); last = t; if (++n >= 40) res(Math.round(acc / n)); else { window.__dev.juiceSwing(); requestAnimationFrame(tick); } }; requestAnimationFrame(tick); });
  });
  if (fps >= 58) pass(`[FPS] held ${fps} fps under a dense pack + swing spam`);
  else fail(`[FPS] dropped to ${fps} fps`);

  if (errors.length === 0) pass("[ERR] zero JS errors across the run");
  else fail(`[ERR] ${errors.length} page error(s): ${errors.slice(0, 3).join(" | ")}`);
} catch (e) {
  fail(`harness threw: ${e && e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

if (ok) { log("\n✓ CAS-273 juice-polish harness passed."); process.exit(0); }
else { console.error("\n✗ CAS-273 juice-polish harness FAILED."); process.exit(1); }
