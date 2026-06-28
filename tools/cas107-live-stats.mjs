// CAS-107: LIVE per-class balance probe on the DEPLOYED build. For each class,
// selects it, reads the spawned hero's live base stats (hp/mp/dmg/speed) plus
// the dev classStats projection (L1->L10), and captures any console/page errors.
// Proves CAS-100 per-class stats are actually SERVED live, not just on master.
// Run: node tools/cas107-live-stats.mjs
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://tender-bridge-504.higgsfield.gg/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLASSES = [["warrior","Digit1"],["paladin","Digit2"],["mage","Digit3"],["druid","Digit4"],["priest","Digit5"]];
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
const key = (fr, code) => fr.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c.replace("Digit",""), bubbles: true })), code);

const allErrors = [];
const rows = [];
for (const [name, code] of CLASSES) {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "BalanceQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, code);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  const h = await fr.evaluate(() => window.__dev.hero());
  const cs = await fr.evaluate((c) => (window.__dev.classStats ? window.__dev.classStats(c) : null), name);
  rows.push({ name, cls: h && h.cls, hp: h && h.maxHp, mp: h && h.maxMp, dmg: h && h.baseDmg, spd: h && (h.moveSpeed || h.spd), cs });
  if (errs.length) allErrors.push({ name, errs });
  await page.close();
}
await browser.close();
console.log("LIVE per-class spawned stats (deployed build):");
for (const r of rows) console.log(`  ${r.name.padEnd(8)} cls=${String(r.cls).padEnd(8)} hp=${r.hp} mp=${r.mp} dmg=${r.dmg} spd=${r.spd}`);
console.log("\nclassStats L1->L10 projection (live dev hook):");
for (const r of rows) { const c = r.cs; if (c) console.log(`  ${r.name.padEnd(8)} L1 hp=${c.hp} mp=${c.mp} -> L10 hp=${c.lvl10?.hp} mp=${c.lvl10?.mp} dmg=${c.lvl10?.dmg}`); }
console.log(allErrors.length ? `\n✖ ERRORS:\n${JSON.stringify(allErrors,null,2)}` : "\n✔ zero console/page errors across all 5 classes");
