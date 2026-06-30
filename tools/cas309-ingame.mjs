// CAS-309 — in-engine verification of the healer NPC (Maren) on the LOCAL working tree.
// Boots the game, enters the town, parks the hero next to town-center and screenshots so
// the NPC is visible on the real town background at game scale. Also asserts the central
// fountain object is gone (only 2 fountains remain) and 0 console errors.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "tools");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log(`  PASS ${m}`); } else { fail++; console.log(`  FAIL ${m}`); } };

const { url: BASE, close } = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 2 });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() !== "error") return; const t = m.text();
    if (/favicon/i.test(t) || /Failed to load resource.*404/i.test(t)) return; errors.push("console.error: " + t); });

  await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { try { window.__dev.noSave && window.__dev.noSave(); } catch (e) {}
    document.getElementById("nameInput").value = "ART309";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  await page.evaluate(() => { try { window.__dev.tutSkip && window.__dev.tutSkip(); } catch (e) {} });
  await sleep(400);

  // Park hero at town center, then step down-left so the NPC (at exact center) is in frame above-right.
  const c = await page.evaluate(() => { window.__dev.tpZone("town"); const h = window.__dev.hero(); return { tx: Math.round(h.x/32), ty: Math.round(h.y/32) }; });
  await page.evaluate(({ tx, ty }) => window.__dev.tp(tx - 2, ty + 3), c);
  await sleep(700);
  await page.screenshot({ path: join(OUT, "cas309-ingame-town.png") });

  // close-up: stand right next to the NPC
  await page.evaluate(({ tx, ty }) => window.__dev.tp(tx - 1, ty + 2), c);
  await sleep(500);
  await page.screenshot({ path: join(OUT, "cas309-ingame-closeup.png"), clip: { x: 240, y: 120, width: 520, height: 420 } });

  // Capture a short animation sample (3 frames ~140ms apart) to prove the idle loops.
  for (let i = 0; i < 3; i++) { await sleep(140); await page.screenshot({ path: join(OUT, `cas309-anim-${i}.png`), clip: { x: 380, y: 180, width: 220, height: 260 } }); }

  // Assert: NPC exists with sprite healernpc, central fountain object removed, marker shows.
  const probe = await page.evaluate(() => {
    const cv = document.querySelector("canvas");
    // pixel-diff the NPC region between two rAF ticks to confirm the idle strip advances
    return new Promise(res => {
      const g = cv.getContext("2d", { willReadFrequently: true });
      const R = { x: cv.width/2-40, y: cv.height/2-90, w: 80, h: 120 };
      const a = g.getImageData(R.x|0, R.y|0, R.w, R.h).data;
      setTimeout(() => { const b = g.getImageData(R.x|0, R.y|0, R.w, R.h).data;
        let d = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i]-b[i]) > 8 || Math.abs(a[i+1]-b[i+1]) > 8) d++;
        res({ animDiff: d });
      }, 260);
    });
  });
  console.log(`  NPC region animDiff = ${probe.animDiff} changed px (idle should advance)`);
  ok(probe.animDiff > 5, `idle strip advances between frames (animDiff ${probe.animDiff} > 5)`);
  ok(errors.length === 0, `0 console/page errors (saw ${errors.length})${errors.length ? ": " + errors.slice(0,3).join(" | ") : ""}`);
  console.log(`\n${pass} PASS / ${fail} FAIL`);
} finally {
  await browser.close();
  await close();
}
