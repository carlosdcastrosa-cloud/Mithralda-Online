// CAS-110 LIVE: prove the per-class walk-cycle is wired on the DEPLOYED build.
// Boots the live Higgsfield URL (drives the game iframe), and for each of the 5
// classes: select -> play, hold a movement key and confirm the sim reports
// animState==='walk' (the exact branch drawHeroClass uses to pick the clswalk_*
// strip), release and confirm it settles to 'idle'. Also asserts each
// {class}_walk.png serves at 1120x166 from the live origin and captures a moving
// screenshot. Run: node tools/cas110-walk-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const LIVE = `${BASE}/index.html?dev`;
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLASSES = [["warrior","Digit1"],["paladin","Digit2"],["mage","Digit3"],["druid","Digit4"],["priest","Digit5"]];
const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }

async function stripDims(art) {
  const res = await fetch(`${BASE}/assets/erw/hero/classes/${art}_walk.png`, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) return { ok: false, status: res.status };
  const b = Buffer.from(await res.arrayBuffer());
  return { ok: true, w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
async function gameFrame(page) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("game frame with __dev never appeared");
}
const key = (fr, code, type = "keydown") =>
  fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Digit",""), bubbles: true })), code, type);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const results = [];
for (const [name, code] of CLASSES) {
  const r = { name, walkSeen: false, idleSeen: false, dims: null, pass: false };
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  await page.goto(LIVE, { waitUntil: "networkidle2", timeout: 45000 });
  const fr = await gameFrame(page);
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "WalkQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, code);
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });

  r.dims = await stripDims(name);

  await key(fr, "KeyD", "keydown");
  for (let i = 0; i < 12; i++) { await sleep(50); const a = await fr.evaluate(() => window.__dev.heroAnim()); if (a && a.state === "walk") r.walkSeen = true; }
  await page.screenshot({ path: join(OUT, `cas110-live-walk-${name}.png`), clip: { x: 320, y: 140, width: 260, height: 320 } });
  await key(fr, "KeyD", "keyup");
  for (let i = 0; i < 10; i++) { await sleep(60); const a = await fr.evaluate(() => window.__dev.heroAnim()); if (a && a.state === "idle") r.idleSeen = true; }

  const dimsOk = r.dims && r.dims.ok && r.dims.w === 1120 && r.dims.h === 166;
  r.pass = r.walkSeen && r.idleSeen && dimsOk;
  results.push(r);
  console.log(`${r.pass ? "✔" : "✖"} live ${name}: walk=${r.walkSeen} idle=${r.idleSeen} strip=${r.dims?.ok ? r.dims.w + "x" + r.dims.h : "MISSING"}`);
  await page.close();
}
await browser.close();
const allPass = results.every((r) => r.pass);
console.log(allPass ? "✓ CAS-110 LIVE PASS: 5/5 classes walk->idle on the deployed build, strips 1120x166" : "✖ CAS-110 LIVE: some classes failed");
process.exitCode = allPass ? 0 : 1;
