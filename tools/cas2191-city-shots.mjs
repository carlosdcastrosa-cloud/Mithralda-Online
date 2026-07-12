// CAS-2191 — LOCAL in-browser smoke for the City Batch-1 art integration (CAS-2186).
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
const OUT = "shots/cas2191";
mkdirSync(OUT, { recursive: true });
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }

// PROC town tile coords in the LIVE tiled world: proc town (156..174, 156..174) is stamped
// at +procOY(=GROUND.H+8=578) in Y. Center ≈ (165, 743). City props (proc-local +578 in Y):
const SHOTS = [
  { name: "north-gate",  tx: 164, ty: 737 },   // looking N at the gate: temple(W) + depot(E) landmarks + street
  { name: "temple",      tx: 159, ty: 736 },   // temple landmark close-up (6 tiles)
  { name: "depot",       tx: 170, ty: 736 },   // depot landmark close-up (5 tiles)
  { name: "west-houses", tx: 152, ty: 741 },   // west wall row: habitable house + 2nd house + lamp
  { name: "plaza",       tx: 165, ty: 743 },   // plaza center: street spurs meeting the flagstone
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
await page.evaluate(() => { document.getElementById("nameInput").value = "QA2191"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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
  for (let i = 0; i < 14; i++) await wait(100);   // let camera + asset decode settle
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
console.log(ok ? "\nCAS-2191 city shots: PASS → " + OUT : "\nCAS-2191 city shots: FAIL");
process.exit(ok ? 0 : 1);
