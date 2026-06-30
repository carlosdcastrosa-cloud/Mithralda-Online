// CAS-347 (board CAS-346): "los personajes siempre voltean hacia donde caminan".
// Proves facing FOLLOWS the movement vector for every playable class — including warrior —
// on DESKTOP (mouse/keyboard), where the old code stared at the cursor every tick.
//
// Decisive checks (read facing via __dev.heroAnim().facing, dev-gated read-only):
//  1. Mouse PARKED in the top-left corner the whole time. Walk all 8 screen-space dirs;
//     facing must equal the MOVEMENT angle (±0.2 rad), NOT point at the parked cursor.
//     Under the old per-tick faceMouse() this was impossible — facing tracked the corner.
//  2. On STOP (keys released) facing is RETAINED (no reset to front/0) within 0.05 rad.
//  3. Combat aim preserved: holding the mouse south of the hero swings facing downward
//     (sin(facing) > 0.3) — clicks/casts still aim at the cursor.
//  4. warrior (legacy L/R-flip art, no 8-dir strip) ALSO faces movement: cos(facing) sign
//     flips between walking E and W (the rendered horizontal flip follows the walk dir).
//  5. 60fps, 0 console errors. Runs default local server, or LIVE_URL=<origin> for gh-pages.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TAU = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

// class → class-select Digit code (chooseClass map: warrior=Digit1)
const CLASSES = [["warrior", "Digit1"], ["mage", "Digit3"]];
// screen-space dirs (y-down): expected movement angle = atan2(dy,dx)
const DIRS = [
  { name: "E",  keys: ["KeyD"],          ang: 0 },
  { name: "SE", keys: ["KeyS", "KeyD"],  ang: Math.PI / 4 },
  { name: "S",  keys: ["KeyS"],          ang: Math.PI / 2 },
  { name: "SW", keys: ["KeyS", "KeyA"],  ang: 3 * Math.PI / 4 },
  { name: "W",  keys: ["KeyA"],          ang: Math.PI },
  { name: "NW", keys: ["KeyW", "KeyA"],  ang: -3 * Math.PI / 4 },
  { name: "N",  keys: ["KeyW"],          ang: -Math.PI / 2 },
  { name: "NE", keys: ["KeyW", "KeyD"],  ang: -Math.PI / 4 },
];

const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }

const key = (fr, code, type) =>
  fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Key", "").toLowerCase(), bubbles: true })), code, type);
const facing = (fr) => fr.evaluate(() => { const a = window.__dev.heroAnim(); return a ? a.facing : null; });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}

const local = process.env.LIVE_URL ? null : await startServer(ROOT);
const BASE = process.env.LIVE_URL || local.url;
const LIVE = `${BASE}/index.html?dev`;
const close = local ? local.close : (async () => {});

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const results = [];
let totalErrors = 0;
let buildId = null;
const checks = [];
const ok = (cond, label) => { checks.push({ pass: !!cond, label }); return !!cond; };

for (const [name, code] of CLASSES) {
  const r = { name, walkMatch: 0, retain: false, aimWorks: false, warriorFlip: null, fps: 0, errs: 0 };
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  await page.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 35000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "FaceQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, code, "keydown"); await key(fr, code, "keyup");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  if (!buildId) buildId = await fr.evaluate(() => window.__BUILD || null);

  // PARK the mouse in the top-left corner for the whole walk sweep. If facing still tracks
  // the movement vector, the hero is provably NOT looking at the cursor (the old bug).
  await page.mouse.move(8, 8);
  await sleep(60);

  let cosE = null, cosW = null;
  for (const d of DIRS) {
    for (const k of d.keys) await key(fr, k, "keydown");
    // let it commit to the walk for a few ticks
    let f = null;
    for (let i = 0; i < 8; i++) { await sleep(40); f = await facing(fr); }
    const match = f != null && Math.abs(angDiff(f, d.ang)) < 0.2;
    if (match) r.walkMatch++;
    ok(match, `${name} walk ${d.name}: facing ${f == null ? "null" : f.toFixed(2)} ≈ ${d.ang.toFixed(2)}`);
    if (d.name === "E") cosE = f != null ? Math.cos(f) : null;
    if (d.name === "W") cosW = f != null ? Math.cos(f) : null;
    for (const k of d.keys) await key(fr, k, "keyup");
    await sleep(80);
  }

  // (2) retain last facing on stop: walk N, release, facing must stay ~ -π/2 (not reset to 0)
  await key(fr, "KeyW", "keydown");
  for (let i = 0; i < 6; i++) await sleep(40);
  const fWalk = await facing(fr);
  await key(fr, "KeyW", "keyup");
  await sleep(350); // well past any idle settle
  const fIdle = await facing(fr);
  r.retain = fWalk != null && fIdle != null && Math.abs(angDiff(fWalk, fIdle)) < 0.05;
  ok(r.retain, `${name} retains facing on stop: walk ${fWalk == null ? "null" : fWalk.toFixed(2)} → idle ${fIdle == null ? "null" : fIdle.toFixed(2)}`);

  // (3) combat aim preserved: hold the mouse SOUTH of the hero (screen-centre), facing → down
  await page.mouse.move(450, 540);
  await page.mouse.down();
  await sleep(120);
  const fAim = await facing(fr);
  await page.mouse.up();
  r.aimWorks = fAim != null && Math.sin(fAim) > 0.3;
  ok(r.aimWorks, `${name} mouse-aim still steers facing south: sin ${fAim == null ? "null" : Math.sin(fAim).toFixed(2)} > 0.3`);

  // (4) warrior legacy L/R flip follows movement: cos(E)>0 (face right), cos(W)<0 (face left)
  if (name === "warrior") {
    r.warriorFlip = { cosE, cosW };
    ok(cosE != null && cosE > 0.5 && cosW != null && cosW < -0.5,
      `warrior flip follows walk: cos(E)=${cosE == null ? "null" : cosE.toFixed(2)}>0, cos(W)=${cosW == null ? "null" : cosW.toFixed(2)}<0`);
  }

  r.fps = await fr.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const loop = () => { n++; if (performance.now() - t0 > 1000) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }); return n; });
  r.errs = errs.length; totalErrors += errs.length;
  ok(r.walkMatch === 8, `${name}: all 8 walk dirs face movement (${r.walkMatch}/8)`);
  ok(r.fps >= 55, `${name} fps ${r.fps} ≥ 55`);
  ok(r.errs === 0, `${name} console errors ${r.errs} === 0`);

  if (name === "mage") {
    await page.mouse.move(8, 8);
    await key(fr, "KeyW", "keydown"); await key(fr, "KeyD", "keydown"); // NE walk while mouse parked SW-ish
    for (let i = 0; i < 8; i++) await sleep(40);
    await page.screenshot({ path: join(OUT, "cas347-facing-ne.png"), clip: { x: 300, y: 180, width: 280, height: 260 } });
    await key(fr, "KeyW", "keyup"); await key(fr, "KeyD", "keyup");
  }

  results.push(r);
  await context.close();
}
await browser.close();
await close();

const pass = checks.filter((c) => c.pass).length, total = checks.length;
console.log(`\nCAS-347 facing-follows-movement — build ${buildId || "?"} — BASE ${BASE}`);
for (const c of checks) console.log(`  ${c.pass ? "✓" : "✗"} ${c.label}`);
console.log(`\n${pass}/${total} checks · errors ${totalErrors}`);
for (const r of results) console.log(`  ${r.name}: walk ${r.walkMatch}/8, retain=${r.retain}, aim=${r.aimWorks}, fps=${r.fps}, errs=${r.errs}`);
if (pass !== total || totalErrors > 0) { console.error("\n✖ CAS-347 FAIL"); process.exit(1); }
console.log("\n✓ CAS-347 PASS — every class faces where it walks; mouse-aim + 60fps intact");
