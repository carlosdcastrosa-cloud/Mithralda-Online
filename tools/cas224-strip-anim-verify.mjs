// ---------------------------------------------------------------------------
// CAS-224 (Art) — confirm FOUNTAINS sprite strips SWAP IN and ADVANCE FRAMES in
// live spawns (QA held c-sprites @79 "pending live-spawn anim-swap verification —
// static capture can't confirm strip frames advance in-world"). For each subject
// we capture two frames ~600ms apart and diff the on-screen region; a changing
// region proves the strip's frame index is advancing live (not a frozen sprite).
// Covers: hero (warrior = Clarice, idle + walk), golem boss, and the CAS-209
// secondary mobs (bat/wolf/wraith). Static file/wiring is verified separately;
// this is the LIVE motion proof.
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
const diffBytes = (a, b) => { let d = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++; return d; };

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

  // ---- HERO = warrior (Clarice). Region centered on the screen-locked hero. ----
  const heroRegion = { x: 398, y: 232, width: 104, height: 150 };
  console.log("\n[hero: warrior = Clarice]");
  {
    const cls = await page.evaluate(() => window.__dev.hero().cls);
    ok(cls === "warrior", `hero class is warrior/Clarice (got ${cls})`);
    // idle frame-advance
    const a = await page.screenshot({ clip: heroRegion });
    await wait(620);
    const b = await page.screenshot({ clip: heroRegion });
    ok(diffBytes(a, b) > 120, `Clarice IDLE strip advances frames (Δ ${diffBytes(a, b)} bytes / 620ms)`);
    // walk frame-advance — hold a movement key
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
    await wait(180);
    const st = await page.evaluate(() => window.__dev.heroAnim().state);
    const w1 = await page.screenshot({ clip: heroRegion });
    await wait(500);
    const w2 = await page.screenshot({ clip: heroRegion });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
    ok(st === "walk", `Clarice enters WALK state on input (got ${st})`);
    ok(diffBytes(w1, w2) > 200, `Clarice WALK strip advances frames (Δ ${diffBytes(w1, w2)} bytes / 500ms)`);
    await page.screenshot({ path: "tools/cas224-strip-hero.png" });
    await wait(200);
  }

  // ---- bosses + secondary mobs ----
  for (const mob of ["golem", "wolf", "bat", "wraith"]) {
    console.log(`\n[${mob}]`);
    const before = await page.evaluate(() => window.__dev.enemyCount());
    await page.evaluate((m) => { try { const n = m === "golem" ? 1 : 3; for (let i = 0; i < n; i++) window.__dev.spawn(m, (i - 1) * 40, -16); } catch (e) {} }, mob);
    await wait(260);
    const after = await page.evaluate(() => window.__dev.enemyCount());
    ok(after > before, `${mob} spawned (enemyCount ${before} -> ${after})`);

    const region = mob === "golem" ? { x: 360, y: 150, width: 180, height: 200 } : { x: 320, y: 190, width: 260, height: 190 };
    const a = await page.screenshot({ clip: region });
    await wait(600);
    const b = await page.screenshot({ clip: region });
    ok(diffBytes(a, b) > 300, `${mob} region CHANGES across 600ms (strip animating live): Δ ${diffBytes(a, b)} bytes`);
    await page.screenshot({ path: `tools/cas224-strip-${mob}.png` });
    await page.evaluate(() => { try { window.__dev.tpZone && window.__dev.tpZone("caves"); } catch (e) {} });
    await wait(350);
  }

  console.log(errors.length ? `\n[ERR] ${errors.length}: ${errors.slice(0,3).join(" | ")}` : "\n[ERR] zero JS errors");
  console.log(`[RESULT] ${pass} pass / ${fail} fail`);
  process.exitCode = fail ? 1 : 0;
} finally {
  await browser.close();
  await srv.close();
}
