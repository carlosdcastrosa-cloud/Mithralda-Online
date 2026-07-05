// CAS-201 — live in-game visual verify of the FOUNTAINS dark-fantasy batch.
// Boots into play, teleports to the CAVES (T_STONE crypt = dungeon flagstone slot
// sourced from the FOUNTAINS dungeon_floor/dark_cobble/dungeon_wall batch), spawns
// skeletons, and screenshots so QA can confirm on-style + cold/dark + silhouette reads.
//   node tools/cas201-dungeon-live.mjs [LIVE_URL]
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import fs from "node:fs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = "shots/cas201";
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
console.log(`… CAS-201 FOUNTAINS dungeon verify against ${LIVE}`);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction("window.__hud && window.__dev", { timeout: 30000 });
const build = await page.evaluate(() => (window.__BUILD || "?"));
console.log(`   live build = ${build}`);

await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "QA201";
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
await key("Digit1");
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
await wait(800);

// teleport into caves (crypt flagstone) and populate with skeletons
const tp = await page.evaluate(() => {
  try { window.__dev.tpZone("caves"); } catch (e) { return "tp-err:" + e.message; }
  return "ok";
});
await wait(700);
// caves entry can raise a "Zone Curse" draft modal — skip it (Esc) to reveal the crypt
for (let k = 0; k < 3; k++) { await key("Escape"); await wait(250); }
await wait(500);
for (let i = 0; i < 6; i++) { await page.evaluate((n) => { try { window.__dev.spawn("skel", (n%3-1)*2, Math.floor(n/3)*2 - 1); } catch(e){} }, i); }
await wait(1200);

const snap = await page.evaluate(() => {
  const d = window.__dev;
  return { scene: d.scene(), hero: d.hero(), enemyCount: d.enemyCount(),
    enemies: (d.enemies() || []).slice(0, 8).map(e => e.type) };
});
console.log("   snapshot:", JSON.stringify(snap), "| tp=", tp);
await page.screenshot({ path: `${OUT}/caves-skeletons.png` });

// also capture ruins (dark_cobble/cracked_flag) and town cobble for tile coverage
for (const z of ["ruins", "town"]) {
  await page.evaluate((zz) => { try { window.__dev.tpZone(zz); } catch(e){} }, z);
  await wait(700);
  for (let k = 0; k < 3; k++) { await key("Escape"); await wait(200); }
  await wait(500);
  await page.screenshot({ path: `${OUT}/zone-${z}.png` });
}

console.log(`   pageerrors: ${errs.length}`);
if (errs.length) console.log(errs.slice(0, 8).join("\n"));
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ live: LIVE, build, snap, tp, errs }, null, 2));
await browser.close();
console.log(errs.length === 0 && snap.enemyCount > 0 ? "PASS: caves+mobs render clean" : "CHECK: see report");
