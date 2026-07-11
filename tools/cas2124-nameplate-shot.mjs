// CAS-2124: capture enemy nameplates (Tibia-style HP bar + name). Spawns a normal mob,
// a ranged caster and a boss around the hero, damages the boss so the %HP gradient shows
// (green>60% → yellow → orange → red), then screenshots the play scene. Serves the working
// tree so the RENDER-ONLY change is what paints. tools/ is excluded from the build-id.
// Run: node tools/cas2124-nameplate-shot.mjs [outSuffix]
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const suffix = process.argv[2] || "after";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
try {
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("[pageerror]", e.message.slice(0, 200)));
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  // name → warrior → (customize/abilitysel) → play
  await page.evaluate(() => { document.getElementById("nameInput").value = "Demo"; document.getElementById("nameInput").blur();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "customize") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 }); }
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }))); }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  // clear any first-entry curse modal
  for (let i = 0; i < 4; i++) {
    const sc = await page.evaluate(() => { try { return window.__dev.scene(); } catch (e) { return "?"; } });
    if (sc === "play") break;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
    await wait(200);
  }
  // spawn a spread of mobs + a boss; damage the boss so the gradient bands show
  await page.evaluate(() => {
    __dev.spawn("wolf", -60, 20);      // normal → white name, full green bar
    __dev.spawn("orc", 60, 10);        // normal → white name
    __dev.spawn("skeleton", 0, 55);    // normal → white name
    __dev.spawn("golem", 0, -70);      // boss → orange-red name + wide bar
  });
  await wait(400);
  await page.evaluate(() => { for (let i = 0; i < 14; i++) __dev.hitBoss(28); }); // drop boss into yellow/orange band
  await wait(500);
  const snap = await page.evaluate(() => ({ n: __dev.enemyCount(), scene: __dev.scene(),
    boss: (__dev.enemies().find(e => e.type === "golem") || null) }));
  await page.screenshot({ path: `tools/cas2124-nameplate-${suffix}.png` });
  // tight high-DPI crop around the hero/mob cluster (viewport 900x600, hero centered ~450,300; DPR2)
  await page.screenshot({ path: `tools/cas2124-nameplate-${suffix}-zoom.png`, clip: { x: 220, y: 80, width: 460, height: 400 } });
  console.log(`✔ tools/cas2124-nameplate-${suffix}.png (+zoom)`, JSON.stringify(snap));
} finally { await browser.close(); await srv.close(); }
