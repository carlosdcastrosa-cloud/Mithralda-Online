// ---------------------------------------------------------------------------
// CAS-397 collision harness — proves the board bug ("personajes traspasan
// arboles y piedras") is fixed: the hero is BLOCKED by wilderness trees AND
// rocks, still walks freely on open grass (no over-blocking), and fps holds.
// Runs against the LOCAL repo build (my edits), not the live deploy.
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = await startServer();
let browser, ok = true;
const log = (pass, msg) => { console.log(`${pass ? "✔" : "✖"} ${msg}`); if (!pass) ok = false; };

try {
  browser = await puppeteer.launch({ headless: "new", executablePath: findChromium() || undefined, args: LAUNCH_ARGS });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/favicon/i.test(m.text())) errors.push(m.text()); });

  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });

  // boot -> menu -> class 1 -> play
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { try { window.__dev.clearSave && window.__dev.clearSave(); window.__dev.noSave && window.__dev.noSave(); } catch (e) {} });
  await page.evaluate(() => {
    const i = document.getElementById("nameInput"); if (i) i.value = "CAS397";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  log(true, "booted to play");

  // Pull the authoritative solids, TS, and terrain so we can pick real targets.
  const meta = await page.evaluate(() => {
    const fp = window.__dev.worldFingerprint();
    return { solids: fp.solids, count: fp.solids.length };
  });
  const trees = meta.solids.filter((s) => /prop_f_(tree|pine)/.test(s[3]));
  const rocks = meta.solids.filter((s) => /prop_f_rock/.test(s[3]));
  log(trees.length > 100, `wilderness TREE solids present: ${trees.length}`);
  log(rocks.length > 20, `wilderness ROCK solids present: ${rocks.length}`);
  log(meta.count > 800, `total solids (spatial-grid backed): ${meta.count}`);

  const press = (c) => page.evaluate((x) => window.dispatchEvent(new KeyboardEvent("keydown", { code: x, key: x, bubbles: true })), c);
  const release = (c) => page.evaluate((x) => window.dispatchEvent(new KeyboardEvent("keyup", { code: x, key: x, bubbles: true })), c);
  const heroPos = () => page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  const TS = 32;

  // Pick a target solid with a long CLEAR lane to its WEST (no other solid on the
  // approach row) so (a) the block we observe is caused by THIS object and (b) the
  // same lane doubles as a free-walk control in the opposite direction.
  function pickIsolated(list) {
    for (const s of list) {
      const [x, y, r] = s;
      const clear = !meta.solids.some((o) => o !== s && Math.abs(o[1] - y) < 22 && o[0] < x && o[0] > x - 200);
      if (clear && x > 220 && y > 120) return s;
    }
    return list[0];
  }

  async function walkInto(target, label) {
    const [tx, ty, tr] = target;
    // teleport hero just west of the target, same row (tp bypasses collision)
    await page.evaluate((px, py) => window.__dev.tp(px / 32, py / 32), tx - 46, ty);
    await sleep(60);
    const start = await heroPos();
    await press("KeyD"); await sleep(1600); await release("KeyD");
    await sleep(80);
    const end = await heroPos();
    const moved = end.x - start.x;
    const heroR = 12;
    const penetrated = end.x > tx - tr + heroR * 0.5; // crossed into the trunk/rock footprint
    log(moved > 4 && !penetrated,
      `${label}: hero approached but STOPPED (start x=${start.x.toFixed(0)} → end x=${end.x.toFixed(0)}, obstacle x=${tx.toFixed(0)} r=${tr}, moved ${moved.toFixed(0)}px, penetrated=${penetrated})`);
  }

  const isoTree = pickIsolated(trees);
  await walkInto(isoTree, "TREE block");
  await walkInto(pickIsolated(rocks), "ROCK block");

  // Control: the SAME isolated tree's west lane is guaranteed clear for 200px → put the
  // hero there and walk WEST (away). Free movement here proves collision does not
  // over-block open field grass (no regression to normal walking).
  {
    const [tx, ty] = isoTree;
    await page.evaluate((px, py) => window.__dev.tp(px / 32, py / 32), tx - 60, ty);
    await sleep(60);
    const s0 = await heroPos();
    await press("KeyA"); await sleep(900); await release("KeyA");
    await sleep(60);
    const s1 = await heroPos();
    const moved = s0.x - s1.x;
    log(moved > 90, `OPEN-FIELD control: hero walks freely west on clear grass lane (moved ${moved.toFixed(0)}px, no false block)`);
  }

  // FPS while moving across the populated field.
  const dirs = ["KeyD", "KeyS", "KeyA", "KeyW", "KeyD", "KeyW"];
  const samples = [];
  for (const c of dirs) {
    await press(c);
    const f0 = await page.evaluate(() => window.__frames);
    const t0 = Date.now();
    await sleep(600);
    const f1 = await page.evaluate(() => window.__frames);
    const t1 = Date.now();
    await release(c);
    samples.push(Math.round(((f1 - f0) * 1000) / (t1 - t0)));
  }
  const minFps = Math.min(...samples);
  log(minFps >= 55, `fps under movement across field: min=${minFps} samples=[${samples}]`);

  log(errors.length === 0, `page errors: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
} catch (e) {
  log(false, `harness threw: ${e && e.stack || e}`);
} finally {
  if (browser) await browser.close();
  await srv.close();
  console.log(ok ? "\nRESULT: PASS" : "\nRESULT: FAIL");
  process.exit(ok ? 0 : 1);
}
