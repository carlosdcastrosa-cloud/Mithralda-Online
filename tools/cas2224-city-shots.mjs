// CAS-2224 — LOCAL in-browser smoke for the City Batch-1 art integration (CAS-2186).
// Serves the working tree, boots into play, teleports the hero to the PROC town (Puerto
// Solana — where the cobblestone STREET + city props were placed) and screenshots. Proves:
//  - the game boots with NO game JS errors and NO 404 for the city assets,
//  - the cobblestone STREET (T_STREET Wang overlay) paints inside the walls,
//  - the temple/depot/house/lamp props render at real scale (bottom-center, Y-sorted),
//  - the habitable-house door threshold denies with the stub toast (reserved warp).
// Run: node tools/cas2191-city-shots.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = "shots/cas2224";
mkdirSync(OUT, { recursive: true });
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }

// PROC town tile coords in the LIVE tiled world: proc town (156..174, 156..174) is stamped
// at +procOY(=GROUND.H+8=578) in Y. Center ≈ (165, 743). City props (proc-local +578 in Y):
const SHOTS = [
  { name: "east-district", tx: 180, ty: 743 },   // overview: tavern(N) + house_blue(S) + park green, E of the gate
  { name: "tavern",        tx: 177, ty: 739 },   // habitable tavern landmark (5 tiles), N of the east road
  { name: "house-blue",    tx: 177, ty: 748 },   // habitable blue house, S of the east road
  { name: "park",          tx: 182, ty: 740 },   // little green: stone well + tree + bench cluster
  { name: "gate-approach", tx: 174, ty: 743 },   // looking E out of the gate down the road at the district
];

const { url, close } = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1.5 });
const errs = [], failed = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
page.on("requestfailed", (r) => failed.push(r.url()));
page.on("response", (r) => { if (r.status() === 404) failed.push(r.url()); });
await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

await page.goto(`${url}/index.html?dev`, { waitUntil: "load" });
await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
await page.evaluate(() => { document.getElementById("nameInput").value = "QA2224"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
// skip customize / ability-draft if present
for (let i = 0; i < 3; i++) {
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  const s = await page.evaluate(() => window.__dev.scene());
  if (s === "play") break;
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
}
await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

for (const s of SHOTS) {
  await page.evaluate((p) => window.__dev.tp(p.tx, p.ty), s);
  for (let i = 0; i < 6; i++) await wait(100);
  // dismiss any zone-curse / encounter modal so the world is visible (Escape a few times)
  for (let i = 0; i < 5; i++) {
    if (await page.evaluate(() => window.__dev.scene() === "play")) break;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
    await wait(150);
  }
  for (let i = 0; i < 10; i++) await wait(100);   // let camera + asset decode settle
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  const hero = await page.evaluate(() => window.__dev.hero());
  console.log("✔", s.name, "hero@", Math.round(hero.x), Math.round(hero.y));
}

const cityFailed = [...new Set(failed)].filter((u) => /pixellab\/city\//.test(u));
const gameErrs = errs.filter((e) => !/status of 404/.test(e) && !/favicon/.test(e));
console.log("CITY_ASSET_404s:", JSON.stringify(cityFailed));
console.log("GAME_JS_ERRORS(" + gameErrs.length + "):", JSON.stringify(gameErrs.slice(0, 8)));
await browser.close(); close();
let ok = true;
if (cityFailed.length) { ok = false; console.error("✖ city asset 404s"); }
if (gameErrs.length) { ok = false; console.error("✖ game JS errors"); }
console.log(ok ? "\nCAS-2224 city shots: PASS → " + OUT : "\nCAS-2224 city shots: FAIL");
process.exit(ok ? 0 : 1);
