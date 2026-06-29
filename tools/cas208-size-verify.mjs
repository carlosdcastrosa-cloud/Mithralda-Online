// ---------------------------------------------------------------------------
// CAS-208 — verify the main character renders ~1.5 tiles tall.
//
// Board request CAS-207: "haz el main character mas pequeño, que mida 1 tile y
// medio de alto aprox." We shrank the hero draw scale (CLASS_ANIM_SCALE 0.32→0.30,
// + the two transient fallbacks) in render/render.js. This boots the REAL game
// locally (served from repo ROOT), drives it into play with each class, hooks the
// canvas ctx.drawImage to capture the hero sprite's drawn pixel height, and asserts
// it lands at ~1.5 × TS(32) — i.e. ~48px figure (≈49.8px cell incl. padding).
// Also screenshots the hero in-world for visual sign-off. Pure read of render
// output; no game logic touched. Run: node tools/cas208-size-verify.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { startBackupHost } from "./backup-host-serve.mjs";

const TS = 32;
const CLASS_FH = 166, FIGURE_H = 160; // render.js / classes.json cell geometry
const CLASSES = [["warrior", "Digit1"], ["paladin", "Digit2"], ["mage", "Digit3"], ["druid", "Digit4"], ["priest", "Digit5"]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
const OUT = join(ROOT, "tools");

const host = await startBackupHost(ROOT, 0);
const BASE = host.url;
console.log(`· serving repo ROOT at ${BASE}`);

const key = (page, code, type = "keydown") =>
  page.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Digit", ""), bubbles: true })), code, type);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const results = [];
try {
  for (const [name, code] of CLASSES) {
    const page = await browser.newPage();
    page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));
    await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?dev`, { waitUntil: "networkidle2", timeout: 45000 });
    await sleep(1500);
    await page.waitForFunction("window.__dev && window.__dev.scene && (window.__dev.scene()==='menu'||window.__dev.scene()==='play'||window.__dev.scene()==='classsel')", { timeout: 20000 });
    const sc0 = await page.evaluate(() => window.__dev.scene());
    if (sc0 === "menu") {
      await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "SizeQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
      await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
    }
    if (await page.evaluate(() => window.__dev.scene()) === "classsel") await key(page, code);
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
    // Hook drawImage ONLY now (in play): record the drawn height of any blit to the
    // MAIN game canvas whose SOURCE cell is the hero class cell (sh≈CLASS_FH). Skip
    // offscreen buffers (the hurt-tint _heroBuf copies the cell at full 166px) by
    // requiring the destination canvas to be large (the on-screen viewport).
    await page.evaluate((CLASS_FH) => {
      window.__heroDraw = { maxDh: 0, samples: 0 };
      const proto = CanvasRenderingContext2D.prototype;
      const orig = proto.drawImage;
      proto.drawImage = function (...a) {
        if (a.length === 9 && this.canvas && this.canvas.width >= 400) {
          const sh = a[4], dh = a[8];
          if (Math.abs(sh - CLASS_FH) <= 1) {
            window.__heroDraw.samples++;
            if (dh > window.__heroDraw.maxDh) window.__heroDraw.maxDh = dh;
          }
        }
        return orig.apply(this, a);
      };
    }, CLASS_FH);
    // let several idle frames render, then a few walking frames
    await sleep(400);
    await key(page, "KeyD");
    await sleep(300);
    await key(page, "KeyD", "keyup");
    await sleep(150);

    const dh = await page.evaluate(() => window.__heroDraw.maxDh);
    const samples = await page.evaluate(() => window.__heroDraw.samples);
    const cellTiles = dh / TS;
    const figurePx = dh * (FIGURE_H / CLASS_FH);
    const figureTiles = figurePx / TS;
    const pass = samples > 0 && Math.abs(figureTiles - 1.5) <= 0.12;
    results.push({ name, samples, cellPx: +dh.toFixed(1), cellTiles: +cellTiles.toFixed(2), figurePx: +figurePx.toFixed(1), figureTiles: +figureTiles.toFixed(2), pass });
    if (name === "warrior" || name === "mage") {
      await page.screenshot({ path: join(OUT, `cas208-size-${name}.png`), clip: { x: 330, y: 150, width: 240, height: 300 } });
    }
    await page.close();
  }
} finally {
  await browser.close();
  await host.close();
}

console.log("\nCAS-208 main-character sizing (target figure ≈1.50 tiles):");
let allPass = true;
for (const r of results) {
  console.log(`  ${r.name.padEnd(8)} cell=${r.cellPx}px(${r.cellTiles}t) figure=${r.figurePx}px(${r.figureTiles}t) samples=${r.samples} ${r.pass ? "PASS" : "FAIL"}`);
  allPass = allPass && r.pass;
}
console.log(allPass ? "\n✔ ALL PASS — main character ≈1.5 tiles tall" : "\n✖ FAIL");
process.exit(allPass ? 0 : 1);
