// CAS-2398 QA — independent LIVE-bytes verification (render-only: grounding-shadow removal + hazard restyle).
// Serves the working tree (render/render.js md5 == origin/gh-pages 6e492f2d; sim/config byte-identical) so this
// exercises the EXACT bytes served on gh-pages build 6357db520a93.
//
// Discriminators are TARGETED (global ellipse/stroke/gradient counts are whole-scene noise):
//  • mob grounding shadow: count ellipse() calls whose CURRENT fillStyle == the removed shadow color
//    "rgba(0,0,0,0.32)" (grep-proven unique to the deleted CAS-317 richAnim/corpse shadow). Expect 0.
//  • hazard restyle: the "⚠" glyph (fillText) is grep-proven UNIQUE to drawHazards ⇒ it is the reliable
//    "a hazard is live on screen" signal. When a ⚠ frame is caught, assert the haze radial gradient is
//    also drawn that frame (restyle present) and screenshot it.
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2398-qa");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = (page, code) => page.evaluate((code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code, bubbles: true })), code);
const keyup = (page, code) => page.evaluate((code) => window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code, bubbles: true })), code);
const hold = (page, code, down) => page.evaluate((code, down) => window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code, bubbles: true })), code, down);
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "✔" : "✖"} ${name}${detail ? " — " + detail : ""}`); };

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console:" + m.text()); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();

  // Instrument: fillStyle-tracked shadow-ellipse counter + hazard-unique ⚠ counter + haze gradient counter.
  await page.evaluate(() => {
    const P = CanvasRenderingContext2D.prototype;
    window.__ic = { mobShadow: 0, radialGrad: 0, warnGlyph: 0 };
    const fsDesc = Object.getOwnPropertyDescriptor(P, "fillStyle");
    Object.defineProperty(P, "fillStyle", {
      configurable: true,
      get() { return fsDesc.get.call(this); },
      set(v) { this.__lastFill = v; return fsDesc.set.call(this, v); },
    });
    const _ellipse = P.ellipse; P.ellipse = function (...a) { if (this.__lastFill === "rgba(0,0,0,0.32)") window.__ic.mobShadow++; return _ellipse.apply(this, a); };
    const _grad = P.createRadialGradient; P.createRadialGradient = function (...a) { window.__ic.radialGrad++; return _grad.apply(this, a); };
    const _ft = P.fillText; P.fillText = function (t, ...a) { if (t === "⚠") window.__ic.warnGlyph++; return _ft.apply(this, [t, ...a]); };
    window.__icReset = () => { window.__ic = { mobShadow: 0, radialGrad: 0, warnGlyph: 0 }; };
  });

  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 15000 });
  check("boot: reaches menu, 0 page errors", errs.length === 0, errs.slice(0, 3).join(" | "));

  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAShadow";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  check("5-class selection screen reached", true);
  await key(page, "Digit1"); // warrior
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s) { await key(page, "Enter"); await sleep(200); }
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(600);
  check("enters play scene", true);

  // Movement smoke.
  const p0 = await page.evaluate(() => window.__dev.hero());
  await hold(page, "KeyD", true); await sleep(500); await hold(page, "KeyD", false); await sleep(150);
  const p1 = await page.evaluate(() => window.__dev.hero());
  check("movement: hero moves on input", Math.abs(p1.x - p0.x) > 4, `dx=${(p1.x - p0.x).toFixed(1)}`);

  // Combat smoke — Digit1 is the fixed numeric ATTACK alias in the play scene (aims at cursor).
  await page.evaluate(() => window.__dev.spawn("quillback", 40, 0));
  await sleep(200);
  let atkSeen = false;
  for (let i = 0; i < 8 && !atkSeen; i++) {
    await key(page, "Digit1"); await sleep(60); await keyup(page, "Digit1");
    for (let j = 0; j < 4; j++) { const a = await page.evaluate(() => window.__dev.heroAnim()); if (a && a.atk) { atkSeen = true; break; } await sleep(60); }
  }
  check("combat: attack input drives an attack animation", atkSeen, atkSeen ? "heroAnim.atk=true observed" : "no atk flag");

  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const loop = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(n); };
    requestAnimationFrame(loop);
  }));
  check("performance: fps >= 50", fps >= 50, `${fps} fps`);

  // (1) MOB GROUNDING SHADOW REMOVED — spawn richAnim mobs, count removed-color shadow ellipses over a burst.
  await page.evaluate(() => { window.__dev.spawn("wendigo", 0, -40); window.__dev.spawn("quillback", -50, 10); window.__dev.spawn("mudlurker", 45, 45); });
  await sleep(500);
  await page.evaluate(() => window.__icReset());
  await sleep(700); // ~40 frames
  const icShadow = await page.evaluate(() => window.__ic);
  await page.screenshot({ path: join(OUT, "mobshadow.png"), clip: { x: 250, y: 130, width: 400, height: 360 } });
  check("shadow: 0 grounding-shadow ellipses (rgba(0,0,0,0.32)) under richAnim mobs", icShadow.mobShadow === 0, `count=${icShadow.mobShadow} over burst`);

  // (2) HAZARD RESTYLE — mirror the GE's proven recipe: park in caldera (magma pool), spawn a boss to satisfy the gate,
  //     dismiss the zone-entry overlay, and KEEP THE HERO ALIVE (setHeroHp each frame — the live zone swarms otherwise
  //     kill the parked hero ⇒ maybeSpawnHazard returns on h.dead). Burst until a ⚠ (hazard-unique) frame.
  const dismiss = async () => { for (let k = 0; k < 4; k++) {
    if (await page.evaluate(() => window.__dev.scene()) === "play") return;
    await key(page, "Escape"); await key(page, "KeyX"); await sleep(150); } };
  await page.evaluate(() => { window.__dev.tpZone("caldera"); window.__dev.seed(42); });
  await sleep(300); await dismiss();
  await page.evaluate(() => window.__dev.spawn("dragon", 220, 40)); // boss-ified ⇒ bossOrElitePresent()
  await sleep(150);
  let hazardSeen = false, icHaz = null;
  for (let i = 0; i < 60 && !hazardSeen; i++) {
    const sc = await page.evaluate(() => { if (window.__dev.scene() === "play") { window.__dev.setHeroHp(9999); return "play"; } return window.__dev.scene(); });
    if (sc !== "play") { await dismiss(); continue; }
    await page.evaluate(() => window.__icReset());
    await sleep(280); // ~16 frames per window
    const snap = await page.evaluate(() => ({ ...window.__ic, ec: window.__dev.enemyCount(), hz: window.__dev.mapInfo().heroZone }));
    if (i % 8 === 0) console.log(`  iter ${i}: warnGlyph=${snap.warnGlyph} radialGrad=${snap.radialGrad} enemies=${snap.ec} zone=${snap.hz}`);
    if (snap.warnGlyph > 0) {
      hazardSeen = true; icHaz = snap;
      await page.screenshot({ path: join(OUT, "hazard.png"), clip: { x: 200, y: 100, width: 500, height: 420 } });
    }
  }
  if (hazardSeen) {
    check("hazard: live hazard captured (⚠ glyph — the new primary danger cue)", icHaz.warnGlyph > 0, `warnGlyph=${icHaz.warnGlyph}`);
    check("hazard: soft radial-gradient HAZE drawn in the same frame window", icHaz.radialGrad > 0, `radialGrad=${icHaz.radialGrad}`);
  } else {
    check("hazard: a live hazard was captured for inspection", false, "no ⚠ hazard within burst window (~11s)");
  }

  check("boot: 0 page/console errors across full session", errs.length === 0, errs.slice(0, 4).join(" | "));
  const pass = results.filter(r => r.pass).length;
  console.log(`\n=== CAS-2398 QA: ${pass}/${results.length} checks passed ===`);
  process.exitCode = pass === results.length ? 0 : 1;
} catch (e) {
  console.error("HARNESS ERROR", e.message, e.stack);
  process.exitCode = 2;
} finally {
  await browser.close();
  await srv.close();
}
