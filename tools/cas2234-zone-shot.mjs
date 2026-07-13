// CAS-2234 QA — clean readable banner shot at the REAL Templo POI (city = non-hunt zone ⇒ no curse
// modal to occlude). Captures a hi-DPR clip of the top band so the gold title legibility is visible.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
const OUT = join(ROOT, "shots", "cas2234");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TS = 32;
async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(500);
}
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 2 });
  await page.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  await page.evaluate(() => { window.__dev.zone({ enabled: true }); window.__dev.daynight({ phase: 0.5 }); window.__dev.weather(0); });
  // tp onto the real Templo POI centre (from derived regions)
  const t = await page.evaluate(() => window.__dev.zone().regions.find((r) => r.name === "Templo"));
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), t.x / TS, t.y / TS);
  await sleep(200);
  for (let i = 0; i < 5; i++) { if ((await page.evaluate(() => window.__dev.scene())) === "play") break;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }))); await sleep(150); }
  // re-enter to fire the banner naturally: step out then back onto Templo
  await page.evaluate(() => window.__dev.zone(null));
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), t.x / TS + 12, t.y / TS);
  await sleep(120);
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), t.x / TS, t.y / TS);
  await sleep(500); // full opacity
  const st = await page.evaluate(() => window.__dev.zone());
  console.log("zone state:", JSON.stringify(st.banner), "current:", st.current);
  await page.screenshot({ path: join(OUT, "templo-natural.png"), clip: { x: 0, y: 0, width: 900, height: 200 } });
  console.log("shot saved templo-natural.png");
} finally { await srv.close?.(); await browser.close(); }
