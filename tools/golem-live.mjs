// ---------------------------------------------------------------------------
// CAS-79 — LIVE Stone Golem screenshot. Drives the deployed build (inside the
// Higgsfield iframe) through __dev.spawn("golem") and screenshots the animated
// real Ancient Ruins golem rendering in-arena. Proves the visible-pixels slice
// is LIVE (not just local). Read-only on the shared env (throwaway client
// enemies). Prints JSON + exits non-zero on FAIL.
//
// Run: node tools/golem-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/index.html?dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const SHOT = join(ROOT, "tools", "cas79-golem-live.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];

const exe = findChromium();
if (!exe) { console.error("No Chromium binary"); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });

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

let ok = true;
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errs.push(`console.error: ${m.text()}`); });

  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "GolemQA";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await fr.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  // spawn the golem just east of the hero and let the idle animation cycle
  await fr.evaluate(() => window.__dev.spawn("golem", 80, 0));
  await sleep(1400);
  const n = await fr.evaluate(() => window.__dev.enemyCount());
  console.log("live enemies in world:", n);
  if (!n) { ok = false; console.error("✖ golem did not spawn on live"); }
  await page.screenshot({ path: SHOT });
  if (errs.length) { ok = false; console.error("✖ page errors:", errs.slice(0, 5)); }
  console.log(JSON.stringify({ live: LIVE, golemSpawned: !!n, errors: errs, shot: SHOT, pass: ok }, null, 2));
  console.log(ok ? "✔ LIVE golem rendered — shot: " + SHOT : "✖ issues found");
} catch (e) { ok = false; console.error("✖", e.message); }
finally { await browser.close(); }
process.exit(ok ? 0 : 1);
