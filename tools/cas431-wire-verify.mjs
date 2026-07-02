// CAS-431 — ENG verify: warrior idle8+walk8+dash8 (hand-authored CAS-400/405/407) wired
// into render.js. Run LOCAL=1 pre-deploy, then bare (live gh-pages) post-deploy.
//   A. bundle wiring: CLASS_DIR8_ANIM/CLASS_DASH8_ANIM include "warrior", WALK8_FC=8, DASH8_FC=8
//   B. sheets served with the installed dims (idle8 140x1328, walk8 1120x1328, dash8 3200x1336)
//   C. in-game: 8 distinct facings while walking (N/S/E pairwise distinct — impossible under
//      flip-only, which reuses the south art for every heading) + idle holds the facing row;
//      per-direction shots for the eyeball no-morph gate
//   D. dash8: roll fires animState "roll" and renders (mid-roll shots N/E/S)
//   E. hooded classes untouched: only warrior_*8.png sheets are requested; ~60fps; 0 errors
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "shots");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }
const local = process.env.LOCAL ? await startServer(ROOT) : null;
const BASE = local ? local.url : (process.env.LIVE_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online");
const close = local ? local.close : (async () => {});
let pass = 0, fail = 0;
const gate = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"} ${msg}`); ok ? pass++ : fail++; };

// A. bundle wiring
const build = await (await fetch(`${BASE}/version.json`, { headers: { "cache-control": "no-cache" } })).json().catch(() => ({}));
const js = await (await fetch(`${BASE}/render/render.js`, { headers: { "cache-control": "no-cache" } })).text();
const dir8 = (js.match(/CLASS_DIR8_ANIM\s*=\s*(\[[^\]]*\])/) || [])[1] || "";
const dash8 = (js.match(/CLASS_DASH8_ANIM\s*=\s*(\[[^\]]*\])/) || [])[1] || "";
const wfc = (js.match(/CLASS_WALK8_FC\s*=\s*(\d+)/) || [])[1];
const dfc = (js.match(/CLASS_DASH8_FC\s*=\s*(\d+)/) || [])[1];
console.log(`build=${build.build || "?"}`);
gate(/warrior/.test(dir8), `A1 CLASS_DIR8_ANIM includes warrior (${dir8})`);
gate(/warrior/.test(dash8), `A2 CLASS_DASH8_ANIM includes warrior (${dash8})`);
gate(wfc === "8", `A3 CLASS_WALK8_FC=8 (${wfc})`);
gate(dfc === "8", `A4 CLASS_DASH8_FC=8 (${dfc})`);

// B. sheet dims (PNG IHDR from served bytes)
const DIMS = { warrior_idle8: [140, 1328], warrior_walk8: [1120, 1328], warrior_dash8: [3200, 1336] };
for (const [name, [w, h]] of Object.entries(DIMS)) {
  const r = await fetch(`${BASE}/assets/erw/hero/classes/${name}.png`, { headers: { "cache-control": "no-cache" } });
  const b = Buffer.from(await r.arrayBuffer());
  const gw = b.readUInt32BE(16), gh = b.readUInt32BE(20);
  gate(r.status === 200 && gw === w && gh === h, `B ${name}.png ${gw}x${gh} (want ${w}x${h})`);
}

// C/D/E. in-game
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const context = await browser.createBrowserContext();
const page = await context.newPage();
const errs = [], sheetReqs = [];
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
page.on("pageerror", (e) => errs.push(String(e)));
page.on("request", (r) => { const m = r.url().match(/([a-z]+_(?:idle8|walk8|dash8))\.png/); if (m) sheetReqs.push(m[1]); });
await page.setUserAgent(UA); await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
await page.goto(`${BASE}/index.html?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
const fr = await (async () => {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) return f; } catch {} }
    await sleep(250);
  }
  throw new Error("no game frame");
})();
const key = (code, type) => fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Key", "").toLowerCase(), bubbles: true })), code, type);
await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 35000 });
await fr.evaluate(() => { document.getElementById("nameInput").value = "Wire8"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
await key("Digit1", "keydown"); await key("Digit1", "keyup"); // class 1 = warrior
await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
await sleep(3200); // let strips finish loading

const CX = 330, CY = 180, CW = 240, CH = 300;
const shot = (name) => page.screenshot({ path: join(OUT, name), clip: { x: CX, y: CY, width: CW, height: CH } });
const sampleSig = () => fr.evaluate((cx, cy, cw, ch) => {
  const cv = document.querySelector("canvas"); if (!cv) return null;
  const sc = document.createElement("canvas"); sc.width = 20; sc.height = 24;
  const g = sc.getContext("2d"); g.imageSmoothingEnabled = false;
  g.drawImage(cv, cx, cy, cw, ch, 0, 0, 20, 24);
  const px = g.getImageData(0, 0, 20, 24).data; const out = [];
  for (let i = 0; i < px.length; i += 4) out.push((px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) | 0);
  return out;
}, CX + 60, CY + 60, CW - 120, CH - 120);
const mad = (a, b) => { if (!a || !b) return 0; let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

// C. walk + idle in 8 directions
const DIRSK = [["E", ["KeyD"]], ["SE", ["KeyD", "KeyS"]], ["S", ["KeyS"]], ["SW", ["KeyA", "KeyS"]], ["W", ["KeyA"]], ["NW", ["KeyA", "KeyW"]], ["N", ["KeyW"]], ["NE", ["KeyD", "KeyW"]]];
const wsig = {}, isig = {};
for (const [d, ks] of DIRSK) {
  for (const k of ks) await key(k, "keydown");
  await sleep(320); wsig[d] = await sampleSig(); await shot(`cas431-walk-${d}.png`);
  for (const k of ks) await key(k, "keyup");
  await sleep(450); isig[d] = await sampleSig(); await shot(`cas431-idle-${d}.png`);
}
const pairs = [["N", "S"], ["E", "S"], ["N", "E"], ["NE", "SE"], ["NE", "NW"]];
for (const [a, b] of pairs) {
  const wm = mad(wsig[a], wsig[b]), im = mad(isig[a], isig[b]);
  gate(wm > 2.5, `C walk ${a} vs ${b} distinct (mad=${wm.toFixed(1)})`);
  gate(im > 2.5, `C idle ${a} vs ${b} distinct (mad=${im.toFixed(1)})`);
}

// D. dash8 roll in 3 headings
for (const [d, ks] of [["N", ["KeyW"]], ["E", ["KeyD"]], ["S", ["KeyS"]]]) {
  for (const k of ks) await key(k, "keydown");
  await sleep(60); await key("Space", "keydown"); await key("Space", "keyup");
  let saw = false;
  for (let i = 0; i < 10; i++) { await sleep(25); const a = await fr.evaluate(() => window.__dev.heroAnim()); if (a && (a.state === "roll" || a.rolling)) { saw = true; if (i === 2) await shot(`cas431-dash-${d}.png`); } }
  for (const k of ks) await key(k, "keyup");
  gate(saw, `D roll fired heading ${d}`);
  await sleep(900);
}

// E. sheet requests, fps, errors
const reqSet = [...new Set(sheetReqs)].sort();
gate(reqSet.every(n => n.startsWith("warrior_")) && ["warrior_dash8", "warrior_idle8", "warrior_walk8"].every(n => reqSet.includes(n)), `E1 only warrior 8-dir sheets requested: [${reqSet}]`);
let fps = 0; for (let i = 0; i < 3; i++) fps = Math.max(fps, await fr.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise(res => { const loop = () => { n++; if (performance.now() - t0 > 1000) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }); return n; }));
gate(fps >= 55, `E2 fps=${fps}`);
gate(errs.length === 0, `E3 console errors=${errs.length}${errs.length ? " :: " + errs.slice(0, 3).join(" | ") : ""}`);

await page.close(); await context.close(); await browser.close(); await close();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} (${pass}/${pass + fail}) build=${build.build || "?"}`);
process.exit(fail ? 1 : 0);
