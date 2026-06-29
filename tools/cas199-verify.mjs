// CAS-199: in-game visual verification of the headless fix + class aura.
// Single page: capture the class-select screen (static clshero_ strips → must show
// heads), then enter play and switch class via __dev.setClass, capturing each class
// in-world (runtime bakeHero composite → face + aura + motes).
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const CLS = ["warrior", "mage", "druid", "priest"];
const errors = [];
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (p, buf) => { writeFileSync(join(ROOT, "tools", p), buf); return p; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await sleep(500);
  console.log("classsel:", save("cas199-classsel.png", await page.screenshot({ clip: { x: 0, y: 80, width: 1100, height: 460 } })));

  // For each class, do a REAL pick (reset → menu → name → classsel → DigitN → play)
  // so the per-class default palette applies and the aura takes the class accent.
  const DIGIT = { warrior: "Digit1", mage: "Digit3", druid: "Digit4", priest: "Digit5" };
  for (let idx = 0; idx < CLS.length; idx++) {
    const cls = CLS[idx];
    if (idx > 0) {
      await page.evaluate(() => window.__dev.resetGame && window.__dev.resetGame());
      await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 10000 });
      await page.evaluate(() => { document.getElementById("nameInput").value = "QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
      await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
    }
    await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent("keydown", { code: k, key: k.replace("Digit", ""), bubbles: true })), DIGIT[cls]);
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
    await sleep(700);
    const hero = await page.evaluate(() => { const c = window.__dev.customizeState(); return { cls: c.cls, sash: c.palette.sash, cloak: c.palette.cloak }; });
    const buf = await page.screenshot({ clip: { x: 470, y: 250, width: 170, height: 180 } });
    console.log(`${cls}: cls='${hero.cls}' cloak=${JSON.stringify(hero.cloak)} sash=${JSON.stringify(hero.sash)} ->`, save(`cas199-inworld-${cls}.png`, buf));
  }
  console.log(errors.length ? ("PAGE ERRORS:\n" + errors.join("\n")) : "zero page errors");
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  await srv.close?.();
}
