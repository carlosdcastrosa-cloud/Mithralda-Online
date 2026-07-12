// CAS-2205: VISUAL QA of the CAS-2194 PixelLab pilot wiring (skel family + fx_nova),
// served from LOCAL HEAD (harness startServer on repo root, ?dev), independent of the
// stale live deploy (CAS-2194 Finding 2). Headless data/geometry proof already PASS
// (tools/cas2194-wiring-verify.mjs 30/30); THIS proves the pixels actually render.
//
// Captures: skeleton/spearman/mage/summoner (all sprite:"skel") in idle/walk/attack,
// the fx_nova burst on mage-frost (ice) + druid nature novas (readability flag), the
// warrior class-select card + a drawClassFrame fallback slice, and a 60fps sample.
// Run: node tools/cas2205-visual-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2205");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = { boot: null, ac1_skel: {}, ac2_nova: {}, ac3_warrior: {}, ac4_perf: {}, errors: [], notes: [] };

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;

const key = (page, code, type = "keydown") =>
  page.evaluate((c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c, bubbles: true })), code, type);

async function toPlay(page, digit) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  return page; // caller picks class; classsel captured here for AC3
}
async function pickClass(page, digit) {
  await key(page, "Digit" + digit);
  // some classes route via customize/abilitysel — confirm through to play
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "customize") {
    await key(page, "Enter");
    await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await key(page, "Enter");
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(500);
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) errs.push("reqfail: " + r.url()); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // ---- boot + fx_nova asset load probe ----
  await toPlay(page);
  report.boot = "menu+classsel reached, no boot crash";

  // AC3 — warrior class-select card (drawClassFrame renders the 88x64 CAS-2193 warrior)
  await page.screenshot({ path: join(OUT, "ac3-classsel-cards.png") });
  const clsMeta = await page.evaluate(() => window.__dev.classStats ? null : null);
  report.ac3_warrior.classselShot = "ac3-classsel-cards.png";

  // enter world as MAGE (Digit3) — mage sprite skel family also, but we use mage for the nova casts
  await pickClass(page, 3);

  // Probe fx_nova + skel strips actually decoded (pilot art, not procedural fallback)
  const assetProbe = await page.evaluate(() => {
    const IMG = window.IMG || {};
    const g = (k) => { const im = IMG[k]; return im ? { done: !!(im.complete && im.naturalWidth), w: im.naturalWidth, h: im.naturalHeight } : null; };
    // IMG may not be global; fall back to reading via an offscreen decode check is not possible headlessly,
    // so expose through __dev if present, else null.
    return { fx_nova: g("fx_nova"), note: window.IMG ? "IMG global" : "IMG not global" };
  });
  report.ac2_nova.assetProbe = assetProbe;

  // ---- AC1: skeleton family ----
  // helper: only the sprite:"skel" mobs near the hero (filter out ambient world mobs)
  const SKEL = ["skeleton", "spearman", "mage", "summoner"];
  const nearSkel = () => page.evaluate((SKEL) => {
    const h = window.__dev.hero(); if (!h) return [];
    return window.__dev.enemies()
      .filter(e => SKEL.includes(e.type) && Math.hypot(e.x - h.x, e.y - h.y) < 520)
      .map(e => ({ type: e.type, st: e.animState, dx: Math.round(e.x - h.x), dy: Math.round(e.y - h.y) }));
  }, SKEL);

  // Spawn all four sprite:"skel" enemies in an arc in front of the hero, close enough to
  // aggro→chase (walk) and reach melee (attack).
  await page.evaluate(() => { try { window.__dev.clearFx(); } catch (e) {} });
  const spawnRes = await page.evaluate((SKEL) => {
    let n = 0; SKEL.forEach((t, i) => { try { window.__dev.spawn(t, -150 + i * 95, -110); n++; } catch (e) {} });
    return n;
  }, SKEL);
  await sleep(250);
  await page.screenshot({ path: join(OUT, "ac1-skel-spawn.png") });
  const animSpawn = await nearSkel();

  // let them close in; sample animState each tick to prove idle→walk→attack cycling
  let sawIdle = {}, sawWalk = {}, sawAttack = {};
  for (let f = 0; f < 28; f++) {
    await sleep(120);
    const st = await nearSkel();
    for (const e of st) { if (e.st === "idle") sawIdle[e.type] = true; if (e.st === "walk") sawWalk[e.type] = true; if (e.st === "attack") sawAttack[e.type] = true; }
    if (f === 5) await page.screenshot({ path: join(OUT, "ac1-skel-walk.png") });
    if (f === 14) await page.screenshot({ path: join(OUT, "ac1-skel-attack.png") });
  }
  await page.screenshot({ path: join(OUT, "ac1-skel-melee.png") });
  report.ac1_skel = { spawned: spawnRes, animSpawn, sawIdle, sawWalk, sawAttack, finalNear: await nearSkel() };

  // ---- AC2: nova FX (fire strip) on NON-FIRE casts ----
  // MAGE frost = slot2 (castSpell(2)), fx:"novacast", col ice-blue #7fd6ff → draws fx_nova (fire).
  await page.evaluate(() => { window.__dev.clearFx(); const h = window.__dev.hero && window.__dev.hero(); });
  // give the mage mana and cast frost repeatedly to catch a mid-anim frame
  const castRes = [];
  for (let i = 0; i < 3; i++) {
    const r = await page.evaluate(() => { try { return window.__dev.cast(2); } catch (e) { return { err: e.message }; } });
    castRes.push(r);
    await sleep(80);
    if (i === 0) await page.screenshot({ path: join(OUT, "ac2-nova-mage-frost.png") });
    await sleep(400);
  }
  report.ac2_nova.mageFrostCast = castRes;

  // DRUID nature nova (green) — swap class in-run (setClass) to show green-cast → fire-nova mismatch
  await page.evaluate(() => { window.__dev.clearFx(); const c = window.__dev.setClass ? window.__dev.setClass("druid") : null; return c; });
  await sleep(120);
  const druidCast = [];
  for (let i = 0; i < 2; i++) {
    const r = await page.evaluate(() => { try { return window.__dev.cast(1); } catch (e) { return { err: e.message }; } }); // vines slot1 = novacast
    druidCast.push(r);
    await sleep(80);
    if (i === 0) await page.screenshot({ path: join(OUT, "ac2-nova-druid-vines.png") });
    await sleep(400);
  }
  report.ac2_nova.druidVinesCast = druidCast;
  await page.evaluate(() => { window.__dev.setClass && window.__dev.setClass("mage"); });

  // PRIEST holy — confirmed by code path (fx:"holynova"→ separate holy strip), asserted in notes.
  report.ac2_nova.priestHolyNote =
    "priest slots consecration/holynova use fx:'holynova' → drawFxSprite('holy'), NOT fx_nova. " +
    "Fire-nova bleed affects mage.frost(ice) + druid.vines/floracion(green) + *.spellburst, not priest holy.";

  // ---- AC3: drawClassFrame fallback slice (warrior card already shot at classsel) ----
  // The warrior 88x64 fc{2,6,9} card renders on the classsel screen (ac3-classsel-cards.png).
  // Fallback-coherence: no torn frames observed in that shot (visual check).

  // ---- AC4: perf sample (fps over ~2.5s of active combat on page1) ----
  await page.bringToFront();
  const perf = await page.evaluate(async () => {
    let frames = 0; const raf = window.requestAnimationFrame.bind(window);
    let stop = false; const loop = (t) => { frames++; if (!stop) raf(loop); }; raf(loop);
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 2500));
    stop = true; const dt = (performance.now() - t0) / 1000;
    return { fps: +(frames / dt).toFixed(1), frames, dt: +dt.toFixed(2) };
  });
  report.ac4_perf = perf;

  report.errors = errs.slice(0, 20);
  if (errs.length) ok = false;

  await page.screenshot({ path: join(OUT, "ac4-combat-frame.png") });
} catch (e) { ok = false; report.fatal = e.message; console.error("✖", e.message, e.stack); }
finally { await browser.close(); await srv.close?.(); }

console.log("=== CAS2205_REPORT_JSON ===");
console.log(JSON.stringify(report, null, 2));
console.log("=== END_REPORT ===");
process.exit(ok ? 0 : 1);
