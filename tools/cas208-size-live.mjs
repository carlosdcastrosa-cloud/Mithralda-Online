// ---------------------------------------------------------------------------
// CAS-208 — LIVE sizing confirmation against the published backup host.
// Same drawImage-hook measurement as cas208-size-verify.mjs, but it points at
// the LIVE build (carlosdcastrosa-cloud.github.io/Mithralda-Online) instead of a
// local repo-root server. Satisfies the AC: "main character ~1.5 tiles tall on
// the live build." Run: node tools/cas208-size-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const TS = 32;
const CLASS_FH = 166, FIGURE_H = 160;
const CLASSES = [["warrior", "Digit1"], ["paladin", "Digit2"], ["mage", "Digit3"], ["druid", "Digit4"], ["priest", "Digit5"]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
const OUT = join(ROOT, "tools");

const key = (page, code, type = "keydown") =>
  page.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Digit", ""), bubbles: true })), code, type);

console.log(`· LIVE host ${BASE}`);
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const results = [];
try {
  for (const [name, code] of CLASSES) {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));
    await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?dev`, { waitUntil: "networkidle2", timeout: 60000 });
    await sleep(1800);
    await page.waitForFunction("window.__dev && window.__dev.scene && (window.__dev.scene()==='menu'||window.__dev.scene()==='play'||window.__dev.scene()==='classsel')", { timeout: 25000 });
    const sc0 = await page.evaluate(() => window.__dev.scene());
    if (sc0 === "menu") {
      await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "SizeQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
      await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
    }
    if (await page.evaluate(() => window.__dev.scene()) === "classsel") await key(page, code);
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
    await page.evaluate((CLASS_FH) => {
      window.__heroDraw = { maxDh: 0, samples: 0 };
      const proto = CanvasRenderingContext2D.prototype;
      const orig = proto.drawImage;
      proto.drawImage = function (...a) {
        if (a.length === 9 && this.canvas && this.canvas.width >= 400) {
          const sh = a[4], dh = a[8];
          if (Math.abs(sh - CLASS_FH) <= 1) { window.__heroDraw.samples++; if (dh > window.__heroDraw.maxDh) window.__heroDraw.maxDh = dh; }
        }
        return orig.apply(this, a);
      };
    }, CLASS_FH);
    await sleep(400);
    await key(page, "KeyD"); await sleep(300); await key(page, "KeyD", "keyup"); await sleep(150);

    const dh = await page.evaluate(() => window.__heroDraw.maxDh);
    const samples = await page.evaluate(() => window.__heroDraw.samples);
    const errCount = await page.evaluate(() => 0);
    const figurePx = dh * (FIGURE_H / CLASS_FH);
    const figureTiles = figurePx / TS;
    const pass = samples > 0 && Math.abs(figureTiles - 1.5) <= 0.12;
    results.push({ name, samples, cellPx: +dh.toFixed(1), figurePx: +figurePx.toFixed(1), figureTiles: +figureTiles.toFixed(2), pass });
    if (name === "warrior" || name === "mage") {
      await page.screenshot({ path: join(OUT, `cas208-live-${name}.png`), clip: { x: 330, y: 150, width: 240, height: 300 } });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

console.log("\nCAS-208 LIVE main-character sizing (target figure ≈1.50 tiles):");
let allPass = true;
for (const r of results) {
  console.log(`  ${r.name.padEnd(8)} cell=${r.cellPx}px figure=${r.figurePx}px(${r.figureTiles}t) samples=${r.samples} ${r.pass ? "PASS" : "FAIL"}`);
  allPass = allPass && r.pass;
}
console.log(allPass ? "\n✔ ALL PASS — main character ≈1.5 tiles tall on LIVE build" : "\n✖ FAIL");
process.exit(allPass ? 0 : 1);
