// ---------------------------------------------------------------------------
// CAS-80 — Does the LIVE build render the data-driven town tilemap?
//
// Loads the board's exact view (Higgsfield marketplace embed → child iframe
// ?__raw=1), asserts the served session is the town-tilemap build, enters play
// (the hero spawns in Puerto Solana's plaza), and captures a full-frame
// screenshot so we have OBJECTIVE evidence the rounded flagstone plaza + grass
// verges + dirt roads (TOWN_MAP) are live — not "trust me".
//
// Run: node tools/cas80-town-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://tender-bridge-504.higgsfield.gg";
const LIVE = `${BASE}/index.html?dev`;
const EXPECT_BUILD = "2eeb4f64a38b";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { live: LIVE, expectBuild: EXPECT_BUILD, liveBuild: null, errors: [] };

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) {
      try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {}
    }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
async function enterPlay(fr) {
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "TownBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
  await page.setCacheEnabled(false);
  page.on("pageerror", (e) => report.errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") report.errors.push("console.error: " + m.text()); });
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  report.liveBuild = await fr.evaluate(() => window.__BUILD || null);
  await enterPlay(fr);
  await sleep(2500); // let ERW tile + merchant images load and a few frames render
  const shot = join(ROOT, "tools", "cas80-town-live.png");
  await page.screenshot({ path: shot });
  report.screenshot = shot;
  const buildOk = report.liveBuild === EXPECT_BUILD;
  console.log(JSON.stringify(report, null, 2));
  console.log(buildOk ? `\n✔ LIVE build is the town-tilemap build (${EXPECT_BUILD}); screenshot saved.`
                      : `\n✖ LIVE build ${report.liveBuild} != expected ${EXPECT_BUILD}`);
  await browser.close();
  process.exit(buildOk && report.errors.length === 0 ? 0 : 1);
} catch (e) {
  console.error("FAIL:", e.message);
  await browser.close();
  process.exit(1);
}
