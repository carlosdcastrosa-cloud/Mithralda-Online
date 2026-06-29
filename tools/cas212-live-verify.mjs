// CAS-212: verify the CAS-199 interim headless fix on the LIVE backup host.
// Loads the real player URL (no local server) so we measure exactly what the CDN
// serves players: class-select strips must show heads, in-world bake must show a
// face + aura, zero JS errors. Backup host serves the game directly (no iframe).
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const CLS = ["warrior", "mage", "druid", "priest"];
const DIGIT = { warrior: "Digit1", mage: "Digit3", druid: "Digit4", priest: "Digit5" };
const errors = [];
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (p, buf) => { writeFileSync(join(ROOT, "tools", p), buf); return p; };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 720, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404) errors.push("404: " + r.url()); });
  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  await page.bringToFront();
  console.log("live build:", await page.evaluate(() => fetch("version.json", { cache: "no-store" }).then(r => r.json()).then(v => v.build).catch(() => "?")));
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  await sleep(700);
  console.log("classsel ->", save("cas212-live-classsel.png", await page.screenshot({ clip: { x: 0, y: 80, width: 1100, height: 460 } })));

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
    await sleep(800);
    const hero = await page.evaluate(() => { const c = window.__dev.customizeState(); return { cls: c.cls, cloak: c.palette.cloak }; });
    const buf = await page.screenshot({ clip: { x: 478, y: 286, width: 150, height: 150 } });
    console.log(`${cls}: cls='${hero.cls}' cloak=${JSON.stringify(hero.cloak)} ->`, save(`cas212-live-inworld-${cls}.png`, buf));
  }
  console.log(errors.length ? ("PAGE ERRORS:\n" + errors.join("\n")) : "zero page errors");
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
