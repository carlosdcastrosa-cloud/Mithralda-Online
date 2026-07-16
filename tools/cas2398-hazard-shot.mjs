// CAS-2398 — capture a LIVE ARENA_HAZARD (needs a boss/elite alive IN a hunt zone; town is safe).
// tp to a hunt zone, advance the hunt to spawn the champion (satisfies the hazard spawn-gate),
// then top up HP every frame and burst-screenshot to catch a planted hazard (soft haze + ⚠ after,
// hard disc+ring before). Run: node tools/cas2398-hazard-shot.mjs <tag> [zone]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const TAG = process.argv[2] || "after";
const ZONE = process.argv[3] || "caldera";     // magma hazard ♨ (orange, distinctive)
const OUT = join(ROOT, "shots", "cas2398");
mkdirSync(OUT, { recursive: true });
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (page, code) => page.evaluate((code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true })), code);
let ok = true;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "HazBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await key(page, "Digit1");
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s) { await key(page, "Enter"); await sleep(200); }
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);

  // Enter the hunt zone (this pops the inter-zone CURSE offer → dismiss it back to play).
  await page.evaluate((z) => { window.__dev.tpZone(z); window.__dev.seed(42); }, ZONE);
  await sleep(300);
  const dismiss = async () => { for (let k = 0; k < 4; k++) {
    const sc = await page.evaluate(() => window.__dev.scene());
    if (sc === "play") return; await key(page, "Escape"); await key(page, "KeyX"); await sleep(200); } };
  await dismiss();
  // Advance the hunt so the champion spawns (satisfies bossOrElitePresent()).
  const info = await page.evaluate((z) => {
    const st = window.__dev.huntState(z); const need = st.need || 0;
    for (let i = 0; i < need; i++) window.__dev.spawnKill(st.base || "orc");
    return { scene: window.__dev.scene(), need, champ: !!window.__dev.huntState(z).champ };
  }, ZONE);
  console.log("hunt:", JSON.stringify(info));
  await dismiss();

  // Burst ~14s: keep in play + top HP each tick so the champion can't kill us; shoot full viewport.
  let frames = 0, hazSeen = 0;
  for (let i = 0; i < 36; i++) {
    const s = await page.evaluate(() => {
      if (window.__dev.scene() !== "play") return { sc: window.__dev.scene(), fx: -1 };
      if (window.__dev.setHeroHp) window.__dev.setHeroHp(9999);
      return { sc: "play", fx: 0 };
    });
    if (s.sc !== "play") await dismiss();
    await sleep(360);
    await page.screenshot({ path: join(OUT, `hz-${TAG}-${String(i).padStart(2, "0")}.png`) });
    frames++;
  }
  console.log(`frames: ${frames}`, errs.length ? ("errs " + errs.slice(0, 3)) : "");
} catch (e) { ok = false; console.error("ERR", e.message); }
finally { await browser.close(); await srv.close?.(); }
process.exit(ok ? 0 : 1);
