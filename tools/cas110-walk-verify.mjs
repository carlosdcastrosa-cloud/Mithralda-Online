// CAS-110: verify the per-class WALK-CYCLE strips are wired in render.js.
// For each of the 5 playable classes (Digit1-5): select -> play, hold a movement
// key and confirm the sim reports animState==='walk' (the exact condition
// drawHeroClass branches on to pick the clswalk_* strip), then release and confirm
// it settles back to 'idle'. Also fetches each {class}_walk.png to assert it serves
// at 1120x166 (8 frames x 140px) so the walk strip never silently falls back to idle.
// Captures a moving + a stopped screenshot per class as evidence, and asserts zero
// JS errors. Pure functional proof — no scale change touched.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const CLASSES = [
  { key: "Digit1", name: "warrior", art: "warrior" },
  { key: "Digit2", name: "paladin", art: "paladin" },
  { key: "Digit3", name: "mage",    art: "mage" },
  { key: "Digit4", name: "druid",   art: "druid" },
  { key: "Digit5", name: "priest",  art: "priest" },
];
const errors = [];
const results = [];
const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// PNG IHDR dims (width/height at byte offsets 16/20) — no image decode needed.
async function stripDims(art) {
  const res = await fetch(`${srv.url}/assets/erw/hero/classes/${art}_walk.png`);
  if (!res.ok) return { ok: false, status: res.status };
  const b = Buffer.from(await res.arrayBuffer());
  return { ok: true, w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

try {
  for (const c of CLASSES) {
    const r = { name: c.name, walkSeen: false, idleSeen: false, dims: null, pass: false };
    const page = await browser.newPage();
    await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => errors.push(`[${c.name}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${c.name}] console.error: ${m.text()}`); });
    await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
    await page.bringToFront();
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
    await page.evaluate(() => { document.getElementById("nameInput").value = "QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
    await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent("keydown", { code: k, key: k.replace("Digit",""), bubbles: true })), c.key);
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });

    // walk strip asset check
    r.dims = await stripDims(c.art);

    // hold movement; sample animState across several frames -> expect 'walk'
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
    for (let i = 0; i < 12; i++) {
      await sleep(50);
      const a = await page.evaluate(() => window.__dev.heroAnim());
      if (a && a.state === "walk") r.walkSeen = true;
    }
    const movingShot = await page.screenshot();
    writeFileSync(join(ROOT, "tools", `cas110-walk-${c.name}.png`), movingShot);

    // release; let it settle -> expect 'idle'
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
    for (let i = 0; i < 10; i++) {
      await sleep(60);
      const a = await page.evaluate(() => window.__dev.heroAnim());
      if (a && a.state === "idle") r.idleSeen = true;
    }
    writeFileSync(join(ROOT, "tools", `cas110-idle-${c.name}.png`), await page.screenshot());

    const dimsOk = r.dims && r.dims.ok && r.dims.w === 1120 && r.dims.h === 166;
    r.pass = r.walkSeen && r.idleSeen && dimsOk;
    results.push(r);
    console.log(`${r.pass ? "✔" : "✖"} ${c.name}: walk=${r.walkSeen} idle=${r.idleSeen} strip=${r.dims?.ok ? r.dims.w + "x" + r.dims.h : "MISSING"}`);
    await page.close();
  }
  const allPass = results.every((r) => r.pass);
  if (errors.length) { console.error("✖ page errors:\n" + errors.join("\n")); process.exitCode = 1; }
  else console.log("✔ zero page errors across all 5 classes");
  if (!allPass) { console.error("✖ some classes failed walk/idle/strip checks"); process.exitCode = 1; }
  else console.log(`✔ CAS-110 PASS: 5/5 classes walk when moving, idle when stopped, walk strip 1120x166`);
} finally {
  await browser.close();
  await srv.close?.();
}
