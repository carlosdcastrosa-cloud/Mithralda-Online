// CAS-111 QA: visual sign-off for the live per-class walk-cycle that the
// sim-side harness (cas110-walk-live.mjs) cannot prove. For warrior (warrior-fam)
// and mage (mage-fam, covers priest recolor) on the DEPLOYED build:
//  (1) capture two hero crops ~160ms apart WHILE walking and assert the pixels
//      differ -> the strip frame actually ADVANCES (a static slide would not),
//  (2) compare a right-walk crop vs a left-walk crop and assert they differ ->
//      L/R flip is applied,
//  (3) collect every console error / pageerror across the whole flow -> 0 JS errors.
// Run: node tools/cas111-walk-visual.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://tender-bridge-504.higgsfield.gg";
const LIVE = `${BASE}/index.html?dev`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLASSES = [["warrior", "Digit1"], ["mage", "Digit3"], ["priest", "Digit5"]];
const CLIP = { x: 360, y: 200, width: 180, height: 200 };
const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }

const key = (fr, code, type = "keydown") =>
  fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Digit", ""), bubbles: true })), code, type);
async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("no game frame");
}
// fraction of differing bytes between two equal-size PNG buffers (rough but enough)
function pctDiff(a, b) {
  const n = Math.min(a.length, b.length); let d = 0;
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) d++;
  return d / n;
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const results = [];
for (const [name, code] of CLASSES) {
  const r = { name, errs: [], advance: 0, flip: 0, pass: false };
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => r.errs.push("pageerror:" + e.message));
  page.on("console", (m) => { if (m.type() === "error") r.errs.push("console:" + m.text()); });
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "WalkQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, code);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  // walk right, grab two crops mid-stride
  await key(fr, "KeyD", "keydown");
  await sleep(250);
  const rA = await page.screenshot({ clip: CLIP });
  await sleep(160);
  const rB = await page.screenshot({ clip: CLIP });
  await key(fr, "KeyD", "keyup");
  await sleep(300);

  // walk left for the flip comparison
  await key(fr, "KeyA", "keydown");
  await sleep(250);
  const lA = await page.screenshot({ clip: CLIP });
  await key(fr, "KeyA", "keyup");

  r.advance = +(pctDiff(rA, rB) * 100).toFixed(2); // frame advanced between rA,rB
  r.flip = +(pctDiff(rB, lA) * 100).toFixed(2);     // right vs left silhouette
  // thresholds: any real gait/flip moves >0.5% of bytes; identical buffers ~0
  r.pass = r.advance > 0.5 && r.flip > 0.5 && r.errs.length === 0;
  results.push(r);
  console.log(`${r.pass ? "✔" : "✖"} ${name}: frame-advance=${r.advance}% flip-diff=${r.flip}% jsErrors=${r.errs.length}`);
  if (r.errs.length) console.log("   " + r.errs.slice(0, 3).join("\n   "));
  await page.close();
}
await browser.close();
const allPass = results.every((r) => r.pass);
console.log(allPass ? "✓ CAS-111 VISUAL PASS: walk-cycle advances + flips, 0 JS errors" : "✖ CAS-111 VISUAL: failure(s) above");
process.exitCode = allPass ? 0 : 1;
