// ---------------------------------------------------------------------------
// Headless smoke + FPS harness.
//
// Boots the real game in headless Chromium, drives menu -> class select -> play
// via synthetic input, then sustains movement while sampling the frame rate.
// Asserts:
//   - zero uncaught page errors / failed requests
//   - the scene actually reaches "play"
//   - a hero exists and enemies spawn into the world
//   - FPS stays >= MIN_FPS across sustained movement
// Saves a screenshot artifact and prints the FPS samples + its path.
//
// Run: npm run smoke
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const MIN_FPS = 58;
const SAMPLES = 6;            // number of FPS windows
const WINDOW_MS = 500;        // each FPS window
const SHOT = join(ROOT, "tools", "smoke-screenshot.png");

const errors = [];
const log = (m) => console.log(m);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
const failWith = (m) => { ok = false; console.error(`✖ ${m}`); };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

  // Collect every signal of a broken page.
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} (${r.failure()?.errorText})`));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });

  // Install a frame counter BEFORE any page script runs, so FPS is measured
  // from the game's real requestAnimationFrame cadence (not a proxy timer).
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // 1) menu reached
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  log("✔ booted to menu");

  // 2) menu -> class select (type a name, press Enter)
  await page.evaluate(() => {
    const i = document.getElementById("nameInput");
    i.value = "SmokeBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  log("✔ name entered -> class select");

  // 3) class select -> ability draft (choose class 1 = warrior)
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  // CAS-1570: the run-start ability-draft scene now sits between class-select and play.
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 5000 });
  log("✔ class select -> ability draft");
  // seed is pre-filled with the default loadout (2 abilities) so Enter confirms straight through.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
  const hero = await page.evaluate(() => window.__dev.hero());
  if (hero && hero.cls) log(`✔ entered play as '${hero.cls}' at (${hero.x | 0}, ${hero.y | 0})`);
  else failWith("scene is 'play' but no hero present");

  // 4) sustained movement + FPS sampling. Hold a direction, flip it each window
  //    so the camera + world keep updating (stresses render + spawns).
  const press = (code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
  const release = (code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);

  const dirs = ["KeyD", "KeyS", "KeyA", "KeyW", "KeyD", "KeyS"];
  const fpsSamples = [];
  for (let i = 0; i < SAMPLES; i++) {
    const dir = dirs[i % dirs.length];
    await press(dir);
    const f0 = await page.evaluate(() => window.__frames);
    const t0 = await page.evaluate(() => performance.now());
    await new Promise((r) => setTimeout(r, WINDOW_MS));
    const f1 = await page.evaluate(() => window.__frames);
    const t1 = await page.evaluate(() => performance.now());
    await release(dir);
    const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
    fpsSamples.push(fps);
    log(`   sample ${i + 1}/${SAMPLES}: ${fps} fps  (dir ${dir})`);
  }

  // 5) entities spawned during play
  const enemies = await page.evaluate(() => window.__dev.enemyCount());
  if (enemies > 0) log(`✔ entities spawned: ${enemies} enemies live`);
  else failWith("no enemies spawned after sustained play");

  // 6) FPS assertion
  const minFps = Math.min(...fpsSamples);
  const avgFps = Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length);
  log(`\nFPS samples: [${fpsSamples.join(", ")}]  min=${minFps}  avg=${avgFps}  (threshold >= ${MIN_FPS})`);
  if (minFps < MIN_FPS) failWith(`FPS dropped below ${MIN_FPS} (min observed ${minFps})`);
  else log(`✔ FPS held >= ${MIN_FPS}`);

  // 7) screenshot artifact
  const shot = await page.screenshot();
  writeFileSync(SHOT, shot);
  log(`✔ screenshot saved: ${SHOT}`);

  // 8) zero page errors
  if (errors.length) { failWith(`${errors.length} page error(s):`); errors.forEach((e) => console.error(`   - ${e}`)); }
  else log("✔ zero page errors");
} catch (e) {
  failWith(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  await srv.close();
}

if (!ok) { console.error("\n✖ SMOKE FAILED."); process.exit(1); }
console.log("\n✓ Smoke test passed.");
