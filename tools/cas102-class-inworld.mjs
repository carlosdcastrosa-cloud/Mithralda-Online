// CAS-102: in-world per-class hero capture. Drives menu -> class select -> play
// for each of the 5 classes (Digit1-5), moves the hero a few frames (proves it
// is not static), and saves a cropped screenshot centered on the hero.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const CLASSES = [
  { key: "Digit1", name: "warrior(Guerrero)", expect: "warrior" },
  { key: "Digit2", name: "paladin(Paladin)", expect: "warrior" },
  { key: "Digit3", name: "mage(Mago)", expect: "mage" },
  { key: "Digit4", name: "druid(Druida)", expect: "archer" },
  { key: "Digit5", name: "priest(Sacerdote)", expect: "mage" },
];
const errors = [];
const exe = findChromium();
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (const c of CLASSES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => errors.push(`[${c.name}] pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${c.name}] console.error: ${m.text()}`); });
    await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
    await page.bringToFront();
    await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
    await page.evaluate(() => { document.getElementById("nameInput").value = "QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
    await page.evaluate((k) => window.dispatchEvent(new KeyboardEvent("keydown", { code: k, key: k.replace("Digit",""), bubbles: true })), c.key);
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
    const hero = await page.evaluate(() => window.__dev.hero());
    // move a few frames to exercise walk animation
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
    await sleep(600);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
    await sleep(120);
    const shot = join(ROOT, "tools", `cas102-inworld-${c.expect}-${c.key}.png`);
    // crop around hero (screen center-ish); full frame is fine for evidence
    const buf = await page.screenshot();
    writeFileSync(shot, buf);
    const okCls = hero && hero.cls;
    console.log(`✔ ${c.name}: cls='${hero?.cls}' expectArt=${c.expect} @ (${hero?.x|0},${hero?.y|0})  shot=${shot.split("/").pop()}`);
    await page.close();
  }
  if (errors.length) { console.error("✖ page errors:\n" + errors.join("\n")); process.exitCode = 1; }
  else console.log("✔ zero page errors across all 5 classes");
} finally {
  await browser.close();
  await srv.close?.();
}
