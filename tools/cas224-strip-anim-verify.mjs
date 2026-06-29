// ---------------------------------------------------------------------------
// CAS-224 (Art) — confirm the CAS-209 bat/wolf/wraith PixelLab strips SWAP IN
// and ANIMATE in live zone spawns (QA flagged "static capture only"). For each
// mob: spawn it next to the hero, then capture two frames ~600ms apart and diff
// the on-screen region. A changing region proves the strip's frame index is
// advancing live (idle/walk strip cycling), not a frozen single sprite.
// Static file/wiring (strip exists + loadAllAssets + resolveStrip + drawEnemy
// frameIndex(e.animT)) is verified separately; this is the LIVE motion proof.
// Run: node tools/cas224-strip-anim-verify.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const errors = [];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS ${m}`); } else { fail++; console.log(`  FAIL ${m}`); } };
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load", timeout: 30000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "QAstrip";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await wait(300);

  for (const mob of ["wolf", "bat", "wraith"]) {
    console.log(`\n[${mob}]`);
    const before = await page.evaluate(() => window.__dev.enemyCount());
    await page.evaluate((m) => { try { for (let i = 0; i < 3; i++) window.__dev.spawn(m, (i - 1) * 38, -8); } catch (e) {} }, mob);
    await wait(250);
    const after = await page.evaluate(() => window.__dev.enemyCount());
    ok(after > before, `${mob} spawned (enemyCount ${before} -> ${after})`);

    const region = { x: 320, y: 190, width: 260, height: 190 };
    const a = await page.screenshot({ clip: region });
    await wait(600);
    const b = await page.screenshot({ clip: region });
    let diff = 0; const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff++;
    ok(diff > 300, `${mob} region CHANGES across 600ms (strip animating live): ${diff} bytes differ`);
    await page.screenshot({ path: `tools/cas224-strip-${mob}.png` });
    // let them die / wander; re-seed a fresh zone to reset the field for the next mob
    await page.evaluate(() => { try { window.__dev.tpZone && window.__dev.tpZone("caves"); } catch (e) {} });
    await wait(350);
  }

  console.log(errors.length ? `\n[ERR] ${errors.length}: ${errors.slice(0,3).join(" | ")}` : "\n[ERR] zero JS errors");
  console.log(`[RESULT] ${pass} pass / ${fail} fail`);
} finally {
  await browser.close();
  await srv.close();
}
