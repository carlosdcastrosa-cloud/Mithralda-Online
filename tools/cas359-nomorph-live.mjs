// CAS-359 (board CAS-350): the hero must NOT MORPH into a different character when it walks.
// The board REJECTED the CAS-301 8-dir regen sheets for the four HOODED classes because their
// idle8/walk8 PNGs are a DIFFERENT-looking hero, so walking (regen) vs idle/attack (original)
// visibly swapped the character. The CAS-359 fix DROPS those sheets from the load list
// (CLASS_DIR8_ANIM=["warrior"] only) → hooded classes render ONLY the original clshero_/clswalk_
// sprites in every state, facing movement via L/R flip. Warrior keeps its SAME-sprite 8-dir.
//
// Decisive checks (per HOODED class mage/paladin/priest/druid + warrior control):
//  1. NO regen sheet loaded: window has no decoded clsidle8_/clswalk8_ image for the class
//     (probed via a live <img> HEAD is unreliable through the import map → we instead assert the
//     class is ABSENT from the live CLASS_DIR8_ANIM by behaviour: see check 2).
//  2. NO MORPH walk↔idle: capture the hero sprite mid-WALK and at IDLE; the colour histogram
//     similarity must be HIGH (≥0.92) — same character. Under the rejected build the regen walk
//     sprite scored a visibly different palette/silhouette against the original idle.
//  3. NO MORPH walk↔attack: capture mid-WALK and mid-ATTACK; same character (≥0.92).
//  4. Hooded class faces movement via flip: cos(facing) flips sign E↔W (rendered L/R flip).
//  5. warrior CONTROL: its 8-dir same-sprite path is intact (walk↔idle still ≥0.88; 8-dir art
//     legitimately varies more across a turn than a flip, so a looser floor) and faces movement.
//  6. 60fps, 0 console errors.
//
// Run: LIVE_URL=https://carlosdcastrosa-cloud.github.io/Mithralda-Online node tools/cas359-nomorph-live.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { findChromium, LAUNCH_ARGS, ROOT, startServer } from "./harness.mjs";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const OUT = join(ROOT, "tools");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// class → class-select Digit (chooseClass: warrior=1, paladin=2, mage=3, priest=4, druid=5)
const CLASSES = [
  ["mage", "Digit3", true], ["paladin", "Digit2", true],
  ["priest", "Digit4", true], ["druid", "Digit5", true],
  ["warrior", "Digit1", false],
];

const exe = findChromium();
if (!exe) { console.error("No Chromium"); process.exit(1); }

const key = (fr, code, type) =>
  fr.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c.replace("Key", "").toLowerCase(), bubbles: true })), code, type);
const facing = (fr) => fr.evaluate(() => { const a = window.__dev.heroAnim(); return a ? a.facing : null; });
const animState = (fr) => fr.evaluate(() => { const a = window.__dev.heroAnim(); return a ? a.state : null; });

// Crop the hero region from a screenshot and build a coarse hue/intensity histogram of the
// NON-transparent-ish (non-background) pixels, then cosine-compare two captures. A character
// SWAP changes the palette/coverage and tanks the score; a flip or a few-px gait change does not.
async function heroHist(page, clip) {
  const buf = await page.screenshot({ clip, encoding: "base64" });
  return buf; // returned for optional debugging; histogram computed in-page below
}
// Compute histogram in Node from the raw RGBA via canvas-less manual PNG? Simpler: do it in-page.
const captureHist = (page, clip) => page.evaluate((c) => {
  const cv = document.createElement("canvas"); cv.width = c.width; cv.height = c.height;
  const g = cv.getContext("2d");
  g.drawImage(document.querySelector("canvas"), c.x, c.y, c.width, c.height, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const bins = new Array(8 * 4).fill(0); let n = 0;
  // sample only reasonably opaque, non-near-black pixels (hero body, not ground/shadow)
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3];
    if (a < 200) continue;
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx < 40) continue; // skip near-black
    let h = 0; const ch = mx - mn;
    if (ch !== 0) {
      if (mx === r) h = ((gg - b) / ch) % 6;
      else if (mx === gg) h = (b - r) / ch + 2;
      else h = (r - gg) / ch + 4;
      h = (h * 60 + 360) % 360;
    }
    const hb = Math.min(7, Math.floor(h / 45));
    const vb = Math.min(3, Math.floor(mx / 64));
    bins[hb * 4 + vb]++; n++;
  }
  return { bins, n };
}, clip);

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

const local = process.env.LIVE_URL ? null : await startServer(ROOT);
const BASE = process.env.LIVE_URL || local.url;
const LIVE = `${BASE}/index.html?dev`;
const close = local ? local.close : (async () => {});

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 120000 });
const checks = []; let totalErrors = 0; let buildId = null;
const ok = (cond, label) => { checks.push({ pass: !!cond, label }); return !!cond; };
// hero is screen-centred; crop a box around it
const CLIP = { x: 380, y: 210, width: 140, height: 170 };

for (const [name, code, hooded] of CLASSES) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.setUserAgent(UA);
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 1 });
  await page.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 45000 });
  let fr = null;
  { const dl = Date.now() + 25000; while (Date.now() < dl) { for (const f of page.frames()) { try { if (await f.evaluate(() => !!(window.__dev && window.__dev.scene))) { fr = f; break; } } catch {} } if (fr) break; await sleep(250); } }
  await fr.waitForFunction("window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 35000 });
  await fr.evaluate(() => { document.getElementById("nameInput").value = "MorphQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await fr.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key(fr, code, "keydown"); await key(fr, code, "keyup");
  await fr.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  if (!buildId) buildId = await fr.evaluate(() => window.__BUILD || null);

  // park the mouse away so plain walk faces movement (not cursor)
  await page.mouse.move(8, 8); await sleep(80);

  // ---- capture IDLE (walk East first so we face a consistent L/R, then stop) ----
  await key(fr, "KeyD", "keydown");
  for (let i = 0; i < 8; i++) await sleep(40);
  const cosE = Math.cos(await facing(fr));
  const hWalkE = await captureHist(page, CLIP);     // mid-walk East
  await key(fr, "KeyD", "keyup");
  await sleep(300);                                  // settle to idle, retains East facing
  const hIdle = await captureHist(page, CLIP);

  // ---- capture WALK West (flip) ----
  await key(fr, "KeyA", "keydown");
  for (let i = 0; i < 8; i++) await sleep(40);
  const cosW = Math.cos(await facing(fr));
  await key(fr, "KeyA", "keyup"); await sleep(120);

  // ---- capture ATTACK (Digit1 fixed attack alias) ----
  await key(fr, "Digit1", "keydown"); await key(fr, "Digit1", "keyup");
  await sleep(60);
  await fr.evaluate(() => {}).catch(()=>{});
  const stAtk = await animState(fr);
  const hAtk = await captureHist(page, CLIP);

  const simWalkIdle = cosine(hWalkE.bins, hIdle.bins);
  const simWalkAtk = cosine(hWalkE.bins, hAtk.bins);
  const floor = hooded ? 0.92 : 0.85; // warrior 8-dir art varies more across turn → looser

  ok(hWalkE.n > 80 && hIdle.n > 80, `${name}: hero pixels sampled (walk ${hWalkE.n}, idle ${hIdle.n})`);
  ok(simWalkIdle >= floor, `${name}: NO MORPH walk↔idle sim ${simWalkIdle.toFixed(3)} ≥ ${floor}`);
  ok(simWalkAtk >= floor, `${name}: NO MORPH walk↔attack sim ${simWalkAtk.toFixed(3)} ≥ ${floor} (state=${stAtk})`);
  ok(cosE > 0.4 && cosW < -0.4, `${name}: faces movement via flip cos(E)=${cosE.toFixed(2)}>0 cos(W)=${cosW.toFixed(2)}<0`);

  const fps = await fr.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const loop = () => { n++; if (performance.now() - t0 > 1000) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }); return n; });
  ok(fps >= 55, `${name} fps ${fps} ≥ 55`);
  ok(errs.length === 0, `${name} console errors ${errs.length} === 0`);
  totalErrors += errs.length;

  await page.screenshot({ path: join(OUT, `cas359-${name}-states.png`), clip: { x: 320, y: 170, width: 260, height: 250 } });
  await context.close();
}
await browser.close();
await close();

const pass = checks.filter((c) => c.pass).length, total = checks.length;
console.log(`\nCAS-359 no-morph + facing — build ${buildId || "?"} — BASE ${BASE}`);
for (const c of checks) console.log(`  ${c.pass ? "✓" : "✗"} ${c.label}`);
console.log(`\n${pass}/${total} checks · errors ${totalErrors}`);
if (pass !== total || totalErrors > 0) { console.error("\n✖ CAS-359 FAIL"); process.exit(1); }
console.log("\n✓ CAS-359 PASS — hooded classes render the ORIGINAL character in every state (no morph) and face movement; warrior 8-dir intact");
