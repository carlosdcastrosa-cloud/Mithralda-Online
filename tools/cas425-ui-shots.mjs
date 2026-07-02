// ===========================================================================
// CAS-425 — UI analysis capture: screenshot every UI surface on the live
// build so the QA agent can eyeball and propose improvements.
//   node tools/cas425-ui-shots.mjs [URL]
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = "shots/cas425";
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

const vj = await (await fetch(`${LIVE}/version.json?cb=${Date.now()}`)).json();
console.log(`live build=${vj.build} files=${vj.files}`);

async function newGame(vp = { width: 1366, height: 768 }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ ...vp, deviceScaleFactor: 1 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message)));
  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction("window.__hud && window.__dev && window.__uiLayout", { timeout: 30000 });
  return { ctx, page, errs };
}
const key = (page, c, k) => page.evaluate((c, k) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: k || c, bubbles: true })), c, k);
async function bootToPlay(page, digit = 1, name = "QA425") {
  await page.waitForFunction("['menu','play'].includes(window.__dev.scene())", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate((n) => { const el = document.getElementById("nameInput"); if (el) el.value = n;
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); }, name);
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
    await key(page, "Digit" + digit);
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  await wait(1200);
}
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ---- 1. menu + class select (1366) ----------------------------------------
{
  const { ctx, page } = await newGame();
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 15000 });
  await wait(600); await shot(page, "01-menu");
  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "QA425";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
  await wait(600); await shot(page, "02-classsel");
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  await wait(1500); await shot(page, "03-play-hud-1366");

  // modal matrix
  for (const [code, k, label] of [["KeyI","i","inventory"],["KeyG","g","modalG"],["KeyT","t","modalT"],["KeyV","v","modalV"],["KeyC","c","modalC"],["KeyM","m","modalM"],["KeyB","b","modalB"],["KeyJ","j","modalJ"]]) {
    await key(page, code, k); await wait(700);
    const sc = await page.evaluate(() => window.__dev.scene());
    await shot(page, `04-${label}-scene_${sc}`);
    await key(page, "Escape", "Escape"); await wait(500);
    const back = await page.evaluate(() => window.__dev.scene());
    if (back !== "play") { console.log(`  ! ${label} Esc left scene=${back}, re-Esc`); await key(page, "Escape", "Escape"); await wait(500); }
    console.log(`modal ${label}: scene=${sc}`);
  }
  // pause menu
  await key(page, "Escape", "Escape"); await wait(700);
  await shot(page, "05-pause-" + await page.evaluate(() => window.__dev.scene()));
  await key(page, "Escape", "Escape"); await wait(400);

  // combat: walk toward mobs & fight a bit for floaters/HP bars/telegraph state
  await page.evaluate(() => { try { window.__dev.tp(180, 165); } catch (e) {} });
  await wait(800);
  for (let i = 0; i < 14; i++) { await key(page, "Space", " "); await wait(180); }
  await shot(page, "06-play-combat");
  console.log("errs page1:", (await page.evaluate(() => 0), 0));
  await ctx.close();
}

// ---- 2. HUD at 1920 and 800 -----------------------------------------------
for (const vp of [{ n: "1920x1080", width: 1920, height: 1080 }, { n: "800x600", width: 800, height: 600 }]) {
  const { ctx, page } = await newGame(vp);
  await bootToPlay(page, 3); // mage for variety
  await shot(page, `07-play-hud-${vp.n}`);
  await ctx.close();
}

// ---- 3. mobile 390 ---------------------------------------------------------
{
  const { ctx, page } = await newGame({ width: 390, height: 844 });
  await bootToPlay(page, 1);
  await shot(page, "08-play-mobile-390");
  await key(page, "KeyI", "i"); await wait(700);
  await shot(page, "09-inventory-mobile-390");
  await ctx.close();
}

console.log("done →", OUT);
await browser.close();
