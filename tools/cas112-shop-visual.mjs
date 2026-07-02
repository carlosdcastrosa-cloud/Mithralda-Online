// CAS-112 QA: independent VISUAL capture of the merchant upgrade shop on the LIVE
// build. Boots, walks the real interact->dialogue->shop path, and screenshots the
// RENDERED shop UI (list/prices/tier labels/gold HUD) — criterion #4 feedback.
// Run: node tools/cas112-shop-visual.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const key = (fr, code) => fr.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c.replace("Digit", ""), bubbles: true })), code);
const errs = [];
let ok = true;
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  let fr;
  const dl = Date.now() + 25000;
  while (Date.now() < dl) { for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) { fr = f; break; } } catch {} } if (fr) break; await sleep(250); }
  if (!fr) throw new Error("no game frame");
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "ShopQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, "Digit1");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await fr.evaluate(() => window.__dev.setGold(1000));
  await fr.evaluate(() => window.__dev.merchantTP());
  await key(fr, "KeyE"); await sleep(150);
  await key(fr, "KeyE"); await key(fr, "KeyE"); await sleep(300);
  const st = await fr.evaluate(() => window.__dev.heroStats());
  console.log("scene after E:", st.scene, "| gold:", st.gold);
  await page.screenshot({ path: "tools/cas112-shop-open.png" });
  console.log("saved tools/cas112-shop-open.png (shop UI + gold HUD)");
  // buy a couple tiers via UI keys if a select/confirm path exists, else via hook, then re-shot to show tier labels + toast
  await fr.evaluate(() => { window.__dev.shopBuy(0); window.__dev.shopBuy(0); });
  await sleep(150);
  await page.screenshot({ path: "tools/cas112-shop-tiers.png" });
  console.log("saved tools/cas112-shop-tiers.png (post-buy: tier labels + toast)");
  if (errs.length) { ok = false; console.error(`${errs.length} error(s):`); errs.forEach((e) => console.error("  - " + e)); }
  else console.log("zero console/page errors during visual capture");
} catch (e) { ok = false; console.error("threw:", e.message); } finally { await browser.close(); }
process.exit(ok ? 0 : 1);
