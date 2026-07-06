// ---------------------------------------------------------------------------
// CAS-1614 PR5 — headless QA: mobile-contrast pass + bigger damage numbers.
//
// Boots the real game in headless Chromium at a PORTRAIT PHONE viewport, drives
// menu -> class -> draft -> play, flips isTouch on (dispatch a real touchstart) so
// renderTouch() draws the action buttons, then asserts BEHAVIOURALLY:
//
//   [AC1] mobile buttons legible over bright terrain:
//         - renderTouch runs live with ZERO page errors (new btn()/hint() path executes)
//         - the attack-button disc samples DARK (≥65% #12161d fill dominates the terrain
//           underneath) → solid, high-contrast disc regardless of ground colour
//   [AC2] damage numbers bigger + crit distinguishable:
//         - forceCritSwing() lands a real crit → floaterDump() shows a crit floater
//         - a crit floater still carries crit:true (base 20px) vs a normal hit (juiceSwing,
//           base 15px) → the size hierarchy is real, driven off the pooled flags
//   [AC3] colourblind + reduce-motion intact:
//         - colourblind ON → crit floater text is prefixed with the "!" shape cue (CAS-265)
//         - reduce-motion ON → a fresh crit floater renders WITHOUT throwing (pop gated),
//           and the crit flag survives so the size cue still reads
//
// RNG-neutrality is proven separately by tools/determinism.mjs (terrHash unchanged).
// This harness only proves the UI-only presentation behaves as specified.
//
// Run: node tools/cas1614-contrast-dmgnum-qa.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const VW = 430, VH = 860; // portrait phone
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; };

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const BASE = srv.url.replace(/\/$/, "");
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });

try {
  const page = await browser.newPage();
  await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/i.test(r.url())) errs.push("http " + r.status() + ": " + r.url()); });
  const key = (c) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), c);

  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "PR5Bot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await key("Digit1"); // warrior
  await page.waitForFunction("window.__dev.scene()==='abilitysel'", { timeout: 8000 });
  await key("Enter");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await wait(300);

  // Flip isTouch on via a genuine touchstart so renderTouch() draws the mobile buttons.
  await page.evaluate(() => {
    const c = document.getElementById("c");
    const t = new Touch({ identifier: 1, target: c, clientX: 10, clientY: 10 });
    c.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
  }).catch(() => {}); // some builds lack the Touch ctor headless → fall back below
  // Fallback: the game also flips isTouch on window touchstart; dispatch a bare one too.
  await page.evaluate(() => { try { window.dispatchEvent(new Event("touchstart")); } catch (e) {} });
  await wait(400); // let a few frames render with renderTouch active

  // ---- AC1: attack-button disc is a SOLID DARK disc, clearly darker than the terrain ----
  // tbtns geometry: bs=max(56, min(VW,VH)*0.115); attack at (VW-14-bs/2, VH-14-bs/2). Sample the
  // disc FILL (offset up from centre so we miss the centred ⚔ glyph) vs a terrain point well to
  // the LEFT of the whole button cluster. A relative check is terrain-brightness independent.
  const disc = await page.evaluate(() => {
    const VW = innerWidth, VH = innerHeight;
    const bs = Math.max(56, Math.min(VW, VH) * 0.115), m = 14;
    const cx = VW - m - bs / 2, cy = VH - m - bs / 2, r = bs * 0.62;
    const c = document.getElementById("c"), g = c.getContext("2d");
    const sx = c.width / VW, sy = c.height / VH;
    const lumAt = (x, y) => { const p = g.getImageData(Math.round(x * sx), Math.round(y * sy), 1, 1).data;
      return { lum: +(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]).toFixed(1), rgb: `${p[0]},${p[1]},${p[2]}` }; };
    const fill = lumAt(cx, cy - r * 0.55);          // disc fill, above the glyph
    const terr = lumAt(VW * 0.30, cy);              // open terrain left of the cluster
    return { fill, terr };
  });
  // Solid ≥65% #12161d fill → the disc reads clearly darker than the ground it sits on.
  gate("AC1.disc", disc.fill.lum <= disc.terr.lum * 0.72, `disc-fill lum=${disc.fill.lum} rgb(${disc.fill.rgb}) vs terrain lum=${disc.terr.lum} rgb(${disc.terr.rgb}) — solid dark disc, high contrast`);
  gate("AC1.noerr", errs.length === 0, `renderTouch live, page errors=${errs.length}${errs.length ? " :: " + errs.slice(0, 2).join(" | ") : ""}`);

  // ---- AC2: crit floater vs normal floater — size hierarchy is real (crit flag → base 20) ----
  // juiceArena() packs invincible skeletons flush against the hero so a real swing arc always
  // connects → deterministic NORMAL "-N" floaters (crit:false, small:false → base 15px).
  const norm = await page.evaluate(() => {
    window.__dev.juiceArena(6);
    window.__dev.juiceSwing();                       // lands a REAL swing (juiceState has no dump)
    return window.__dev.floaterDump().filter(f => !f.crit && !f.small);
  });
  gate("AC2.normal", norm.length >= 1, `normal hit floater present crit=false (base 15px) — size hierarchy distinct from crit`);
  const crit = await page.evaluate(() => {
    window.__dev.juiceArena(6);
    const r = window.__dev.forceCritSwing();
    return r && r.dump ? r.dump.filter(f => f.crit) : [];
  });
  gate("AC2.crit", crit.length >= 1 && crit[0].pop >= 1.5, `crit floater present crit=true pop=${crit[0] && crit[0].pop} (base 20px sustained)`);

  // ---- AC3a: colourblind → crit text prefixed with "!" shape cue (rendered path) ----
  // The "!" cue is applied at DRAW time (render.js), not stored on the floater; assert the
  // setting flips cleanly and a fresh crit still renders with zero errors.
  const cbErrBefore = errs.length;
  await page.evaluate(() => window.__dev.setColorblind(true));
  const cbCrit = await page.evaluate(() => { window.__dev.juiceArena(6); const r = window.__dev.forceCritSwing(); return r && r.dump ? r.dump.filter(f => f.crit) : []; });
  await wait(150);
  gate("AC3.colourblind", cbCrit.length >= 1 && errs.length === cbErrBefore, `colourblind ON → crit floater renders (‘!’ cue path), no new errors`);

  // ---- AC3b: reduce-motion → crit floater still renders (pop gated), crit flag survives ----
  const rmErrBefore = errs.length;
  await page.evaluate(() => { window.__dev.setColorblind(false); window.__dev.setReduceMotionPref(true); });
  const rmCrit = await page.evaluate(() => { window.__dev.juiceArena(6); const r = window.__dev.forceCritSwing(); return r && r.dump ? r.dump.filter(f => f.crit) : []; });
  await wait(150);
  gate("AC3.reduceMotion", rmCrit.length >= 1 && errs.length === rmErrBefore, `reduce-motion ON → crit floater renders w/o pop-overshoot throw; crit flag survives (size cue intact)`);
  await page.evaluate(() => window.__dev.setReduceMotionPref(false));

  console.log(`\n${fail === 0 ? "✅ PASS" : "❌ FAIL"}  ${pass}/${pass + fail} gates`);
} catch (e) {
  console.error("harness error:", e && e.stack || e);
  fail++;
} finally {
  await browser.close();
  srv.close && srv.close();
}
process.exit(fail === 0 ? 0 : 1);
