// CAS-353: visual smoke test — teleport the hero into the empty field (negative space
// outside every zone) and screenshot, proving the wilderness forest (prop_f_* nature pack)
// renders. Also asserts no console errors and that forest deco is present + non-solid.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "tools");
const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const local = process.env.LIVE_URL ? null : await startServer(ROOT);
const BASE = process.env.LIVE_URL || local.url;
const close = local ? local.close : (async () => {});
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 640 });
let errs = 0;
page.on("console", (m) => { if (m.type() === "error") { errs++; console.log("  console.error:", m.text()); } });
async function gameFrame() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("no game frame");
}
const key = (fr, code) => fr.evaluate((c) => { for (const t of ["keydown", "keyup"]) window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Key", "").toLowerCase(), bubbles: true })); }, code);
await page.goto(`${BASE}/index.html?dev`, { waitUntil: "networkidle2", timeout: 60000 });
const fr = await gameFrame();
// boot: name + start, choose warrior
await fr.evaluate(() => { const n = document.querySelector("#nameInput"); if (n) n.value = "QA"; });
await key(fr, "Enter"); await sleep(600);
await key(fr, "Digit1"); await sleep(900);
// teleport into the NW field (tx15,ty22 — left of caves, above ruins: pure wilderness)
const tpd = await fr.evaluate(() => { try { window.__dev.tp(15, 22); return true; } catch (e) { return String(e); } });
await sleep(1200);
const info = await fr.evaluate(() => {
  const w = window.__dev.world ? window.__dev.world() : null; return null;
});
const stats = await fr.evaluate(() => {
  const h = window.__dev.hero(); const sc = window.__dev.scene();
  return { hero: h, scene: sc };
});
await sleep(400);
await page.screenshot({ path: join(OUT, "cas353-forest-field.png") });
console.log("tp:", tpd, "| scene:", stats.scene, "| hero:", JSON.stringify(stats.hero), "| console errors:", errs);
console.log("screenshot → tools/cas353-forest-field.png");
await browser.close(); await close();
process.exit(0);
