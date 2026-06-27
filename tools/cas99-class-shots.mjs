// tools/cas99-class-shots.mjs — CAS-97/CAS-99: prove the 4 CAS-94 class characters
// render in-world at the final hero scale with their animated movement loop.
// Boots the real game, enters each of the 5 playable classes (1-5), lets the hero
// walk a few frames (so the idle loop + procedural hop/squash are active), and
// crops a zoom around the hero. Emits one montage tools/cas99-class-montage.png.
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const CLASSES = [
  ["warrior", "Digit1"], ["paladin", "Digit2"], ["mage", "Digit3"],
  ["druid", "Digit4"], ["priest", "Digit5"],
];
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

const crops = [];
for (const [name, code] of CLASSES) {
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); i.value = "HeroBot"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c.replace("Digit", ""), bubbles: true })), code);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  // walk right briefly so walk loop + hop are active, then settle
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD", key: "d", bubbles: true })));
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyD", key: "d", bubbles: true })));
  await new Promise(r => setTimeout(r, 120));
  const h = await page.evaluate(() => window.__dev.hero());
  // hero is camera-centred; crop 200x230 around viewport centre
  const cx = 640, cy = 360;
  // full-frame shot for the first class (warrior) as overall context
  if (name === "warrior") writeFileSync(join(ROOT, "tools", "cas99-warrior-full.png"), await page.screenshot());
  const buf = await page.screenshot({ clip: { x: cx - 100, y: cy - 150, width: 200, height: 230 } });
  const out = join(ROOT, "tools", `cas99-${name}.png`);
  writeFileSync(out, buf);
  crops.push({ name, art: h.cls });
  console.log(`✔ ${name} (cls=${h.cls}) @ (${h.x|0},${h.y|0}) -> ${out}`);
}
await browser.close(); srv.close?.();
console.log("done:", crops.map(c => `${c.name}→${c.art}`).join(", "));
