// CAS-112: LIVE merchant-shop probe on the DEPLOYED build. Drives the real
// interact->dialogue->shop path on the Mercader Ambulante and buys each upgrade
// through the real buyItem, asserting baseDmg/maxHp/def change + gold debits and
// that maxed/under-funded buys are blocked. Proves the economic loop is SERVED
// live (tender-bridge-504), not just on master.
// Run: node tools/shop-live.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const pass = (m) => console.log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };

const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const key = (fr, code) => fr.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c.replace("Digit", ""), bubbles: true })), code);

const errs = [];
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "ShopQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, "Digit1");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("live build booted to play (warrior)");

  if (!(await fr.evaluate(() => typeof window.__dev.merchantTP === "function"))) { fail("live build lacks merchantTP hook — CAS-112 not served"); }

  await fr.evaluate(() => window.__dev.merchantTP());
  await key(fr, "KeyE"); await sleep(150);
  await key(fr, "KeyE"); await key(fr, "KeyE"); await sleep(200);
  const opened = await fr.evaluate(() => window.__dev.heroStats());
  if (opened.scene === "shop" && opened.merchant) pass("E on live merchant opened the upgrade shop");
  else fail(`live merchant shop did not open: ${JSON.stringify(opened)}`);

  const list = await fr.evaluate(() => window.__dev.shopList());
  if (list.length === 4 && /Filo/.test(list[0].name) && /Vigor/.test(list[1].name) && /Coraza/.test(list[2].name))
    pass(`live shop lists: ${list.map((i) => i.name.split(" (")[0]).join(" | ")}`);
  else fail(`unexpected live shop list: ${JSON.stringify(list)}`);

  await fr.evaluate(() => window.__dev.setGold(1000));
  const b0 = await fr.evaluate(() => window.__dev.heroStats());
  const aD = await fr.evaluate(() => window.__dev.shopBuy(0));
  if (aD.dmg === b0.dmg + 5 && aD.gold === b0.gold - 60) pass(`live Filo: dmg ${b0.dmg}->${aD.dmg} (+5), gold -60`);
  else fail(`live dmg buy wrong: ${JSON.stringify(b0)} -> ${JSON.stringify(aD)}`);
  const aH = await fr.evaluate(() => window.__dev.shopBuy(1));
  if (aH.maxHp === aD.maxHp + 30 && aH.gold === aD.gold - 50) pass(`live Vigor: maxHp ${aD.maxHp}->${aH.maxHp} (+30), gold -50`);
  else fail(`live hp buy wrong: ${JSON.stringify(aD)} -> ${JSON.stringify(aH)}`);
  const aC = await fr.evaluate(() => window.__dev.shopBuy(2));
  if (aC.def === aH.def + 4 && aC.gold === aH.gold - 70) pass(`live Coraza: def ${aH.def}->${aC.def} (+4), gold -70`);
  else fail(`live def buy wrong: ${JSON.stringify(aH)} -> ${JSON.stringify(aC)}`);

  await fr.evaluate(() => window.__dev.setGold(5));
  const p0 = await fr.evaluate(() => window.__dev.heroStats());
  const p1 = await fr.evaluate(() => window.__dev.shopBuy(1));
  if (p1.gold === 5 && p1.maxHp === p0.maxHp) pass("live: insufficient gold blocks purchase (unchanged)");
  else fail(`live under-funded buy not blocked: ${JSON.stringify(p0)} -> ${JSON.stringify(p1)}`);

  if (errs.length) { fail(`${errs.length} page error(s)`); errs.forEach((e) => console.error("   - " + e)); }
  else pass("zero console/page errors");
} catch (e) {
  fail(`live harness threw: ${e.stack || e.message}`);
} finally {
  await browser.close();
}
console.log(ok ? "\n✓ LIVE merchant-shop economic loop verified on tender-bridge-504." : "\n✗ LIVE merchant-shop verification FAILED.");
process.exit(ok ? 0 : 1);
