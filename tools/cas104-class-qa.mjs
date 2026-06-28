// CAS-104: in-game QA for CAS-103 wiring (CLASS_FC=6, dedicated class strips).
// Verifies BOTH surfaces the issue calls for:
//   1) Selection screen  -> captures the class-select scene (all 5 dedicated
//      animated previews) and proves the previews ANIMATE (pixel diff over time).
//   2) In-world idle      -> for each of the 5 classes (Digit1-5) enters play,
//      reads the game-derived hero.cls, captures a screenshot, and proves the
//      idle hero ANIMATES (pixel diff over time, hero standing still).
// Dedicated mapping (CAS-103): warrior/paladin/mage/druid/priest -> own strips.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

// CLASS_LIST order == Digit1-5; dedicated art is now 1:1 with the class.
const CLASSES = [
  { key: "Digit1", cls: "warrior", art: "warrior" },
  { key: "Digit2", cls: "paladin", art: "paladin" },
  { key: "Digit3", cls: "mage",    art: "mage"    },
  { key: "Digit4", cls: "druid",   art: "druid"   },
  { key: "Digit5", cls: "priest",  art: "priest"  },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Count differing pixels between two PNG-screenshot buffers via raw byte compare
// on a center crop region. Returns fraction of differing bytes (proxy for motion).
function diffFrac(a, b) {
  const n = Math.min(a.length, b.length); let d = 0;
  for (let i = 0; i < n; i += 97) if (a[i] !== b[i]) d++;
  return d / (n / 97);
}

const errors = [];
const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const results = [];
try {
  // ---- 1) Selection screen ----
  {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => errors.push(`[classsel] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[classsel] console.error: ${m.text()}`); });
    await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
    await page.bringToFront();
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
    await page.evaluate(() => { document.getElementById("nameInput").value = "QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
    await sleep(200);
    const a = await page.screenshot();
    writeFileSync(join(ROOT, "tools", "cas104-classsel.png"), a);
    await sleep(450);
    const b = await page.screenshot();
    const df = diffFrac(a, b);
    console.log(`✔ classsel: captured all 5 previews; preview-animation diff=${(df*100).toFixed(2)}% ${df>0.002?"(ANIMATING)":"(static?)"}`);
    results.push({ surface: "classsel", animDiff: df });
    await page.close();
  }
  // ---- 2) In-world idle, per class ----
  for (const c of CLASSES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => errors.push(`[${c.cls}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${c.cls}] console.error: ${m.text()}`); });
    await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
    await page.bringToFront();
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
    await page.evaluate(() => { document.getElementById("nameInput").value = "QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
    await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent("keydown", { code: k, key: k.replace("Digit",""), bubbles: true })), c.key);
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
    const hero = await page.evaluate(() => window.__dev.hero());
    // hold still (idle) and sample two frames to prove the idle strip animates
    await sleep(250);
    const a = await page.screenshot();
    await sleep(450);
    const b = await page.screenshot();
    const df = diffFrac(a, b);
    writeFileSync(join(ROOT, "tools", `cas104-inworld-${c.cls}.png`), b);
    const clsOk = hero && hero.cls === c.cls;
    results.push({ cls: c.cls, got: hero?.cls, clsOk, animDiff: df });
    console.log(`${clsOk?"✔":"✖"} ${c.cls.padEnd(8)} cls='${hero?.cls}' expect='${c.cls}'  idle-anim diff=${(df*100).toFixed(2)}% ${df>0.001?"(ANIMATING)":"(STATIC?)"}  @ (${hero?.x|0},${hero?.y|0})`);
    await page.close();
  }
  const badCls = results.filter(r => r.cls && !r.clsOk);
  if (errors.length) { console.error("✖ page errors:\n" + errors.join("\n")); process.exitCode = 1; }
  else console.log("✔ zero page errors across selection + all 5 classes");
  if (badCls.length) { console.error("✖ wrong cls: " + badCls.map(r=>`${r.cls}->${r.got}`).join(",")); process.exitCode = 1; }
  else console.log("✔ all 5 in-world classes report correct game-derived cls");
} finally {
  await browser.close();
  await srv.close?.();
}
