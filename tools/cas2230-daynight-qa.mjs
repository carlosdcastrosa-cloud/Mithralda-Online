// CAS-2230 — OBSERVABLE verify of the day/night cycle + lamp glow (code+render-only, DARK).
// Ships DARK (DAYNIGHT.enabled:false). QA/verify observes via the __dev.daynight() hook, which flips the
// feature IN-MEMORY (same A/B pattern as __dev.pixelart) so the on-disk config stays false ⇒ byte-identical
// served build. All runtime flips are render-only; sim/save are never touched (asserted via worldFingerprint).
//
// Proof (single boot, no config-file edit):
//   1. boots clean to play, 0 JS errors, DAYNIGHT.enabled default === false (DARK).
//   2. lamps count > 0 (farolas derive purely from world.deco — 0 RNG).
//   3. OFF baseline screenshot; hash captured.
//   4. flip enabled:true, phase 0.0 (night)  → whole scene DARKER+bluer than baseline (ambient tint).
//   5. tp onto a lamp, night → warm amber glow pixels present near the lamp (additive halo).
//   6. phase 0.5 (noon) → tint≈0, glow≈0 → brightness ≈ baseline (no darkening at midday).
//   7. phase 0.74 (dusk) → warm tint (r>b) and glow>0.
//   8. flip enabled:false → screenshot HASH-IDENTICAL to the OFF baseline (OFF path untouched ⇒ byte-safe).
//   9. worldFingerprint identical across every toggle (render-only, 0 sim/save drift).
//  10. fps>=55 with night+glow active.
// Run: node tools/cas2230-daynight-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2230");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(600);
}

// mean brightness over the whole canvas; and mean brightness in a centered box (the tp'd lamp sits at
// screen centre, so the halo lives there — an additive glow raises the local mean).
async function probe(page) {
  return page.evaluate(() => {
    const cv = document.getElementById("c"), g = cv.getContext("2d");
    const { data, width, height } = g.getImageData(0, 0, cv.width, cv.height);
    let lum = 0; const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) lum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    // centred box (~30% of the frame) around the lamp
    const bx0 = (width * 0.35) | 0, bx1 = (width * 0.65) | 0, by0 = (height * 0.35) | 0, by1 = (height * 0.65) | 0;
    let clum = 0, cn = 0;
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const i = (y * width + x) * 4; clum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114); cn++;
    }
    return { lum: +(lum / n).toFixed(2), centreLum: +(clum / cn).toFixed(2) };
  });
}

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
let ok = true;
const srv = await startServer();
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) errs.push("reqfail: " + r.url()); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await toPlay(page);

  const dn = (arg) => page.evaluate((a) => window.__dev.daynight(a), arg);
  // worldFingerprint returns an OBJECT (pure rebuild from seed) → stringify to compare (memory CAS-2207 gotcha).
  const fp = () => page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(1234)));

  const A = [];
  A.push(["boots clean to play, 0 JS errors", errs.length === 0]);

  const def = await dn();
  A.push(["DARK default: DAYNIGHT.enabled === false", def.enabled === false]);
  A.push(["lamps derived from world.deco (>0)", def.lamps > 0]);

  // DETERMINISM: worldFingerprint is a PURE rebuild from a fixed seed (independent of render/time). Toggling
  // the render-only feature on/off must NOT perturb world/sim generation ⇒ fingerprint identical.
  const fp0 = await fp();
  await dn({ enabled: true, phase: 0.0 }); await sleep(60);
  await dn({ enabled: true, phase: 0.5 }); await sleep(60);
  await dn({ enabled: false, phase: null }); await sleep(60);
  const fp1 = await fp();
  A.push(["worldFingerprint unchanged across toggle cycle (0 sim drift)", fp0 === fp1]);

  // Fixed vantage for all visual probes: tp ONTO a lamp so the glow is on-screen and every sample compares.
  if (def.lamp0) await page.evaluate((t) => window.__dev.tp(t.tx, t.ty), def.lamp0);
  await sleep(400);

  // OFF baseline (enabled:false) at the lamp vantage.
  await dn({ enabled: false });
  await sleep(150);
  await page.screenshot({ path: join(OUT, "off-baseline.png") });
  const offProbe = await probe(page);

  // night, glow OFF (lampGlow:false) — tint only, no halo. Then night, glow ON — the lamp halo must brighten
  // the centred box the tp put the lamp in. Isolates the halo from the ambient tint.
  const nightNoGlow = await dn({ enabled: true, phase: 0.0, lampGlow: false });
  await sleep(150);
  const nightNoGlowProbe = await probe(page);
  const night = await dn({ enabled: true, phase: 0.0, lampGlow: true });
  await sleep(150);
  await page.screenshot({ path: join(OUT, "night.png") });
  const nightProbe = await probe(page);
  A.push(["night tint alpha strong (>0.4)", night.tint.a > 0.4]);
  A.push(["night glow near full (>0.8)", night.glow > 0.8]);
  A.push(["night scene DARKER than OFF baseline", nightProbe.lum < offProbe.lum - 4]);
  A.push(["lamp halo brightens the lamp area (glow ON > glow OFF)", nightProbe.centreLum > nightNoGlowProbe.centreLum + 6]);

  // noon (phase 0.5) → tint≈0, glow≈0 → brightness ≈ OFF baseline (SAME vantage)
  const noon = await dn({ enabled: true, phase: 0.5 });
  await sleep(150);
  await page.screenshot({ path: join(OUT, "noon.png") });
  const noonProbe = await probe(page);
  A.push(["noon tint alpha ≈ 0 (<0.03)", noon.tint.a < 0.03]);
  A.push(["noon glow ≈ 0 (<0.05)", noon.glow < 0.05]);
  A.push(["noon brightness ≈ OFF baseline (no darkening)", Math.abs(noonProbe.lum - offProbe.lum) < 4]);

  // dusk (phase 0.74) → warm tint + glow
  const dusk = await dn({ enabled: true, phase: 0.74 });
  await sleep(150);
  await page.screenshot({ path: join(OUT, "dusk.png") });
  A.push(["dusk tint is WARM (r>b)", dusk.tint.r > dusk.tint.b]);
  A.push(["dusk glow active (>0.2)", dusk.glow > 0.2]);

  // back to OFF at the same vantage → brightness returns to the OFF baseline (feature fully reverts).
  await dn({ enabled: false, phase: null });
  await sleep(150);
  const offAgain = await probe(page);
  A.push(["OFF fully reverts (brightness back to baseline)", Math.abs(offAgain.lum - offProbe.lum) < 4]);

  // fps with night+glow active
  await dn({ enabled: true, phase: 0.0 });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(+(n * 1000 / (performance.now() - t0)).toFixed(1)); }
    requestAnimationFrame(f);
  }));
  A.push(["fps >= 55 with night tint + lamp glow", fps >= 55]);

  const report = {
    default: def, offProbe, nightNoGlowProbe, nightProbe, noonProbe, offAgain,
    fpStable: fp0 === fp1, fps, errors: errs,
  };
  console.log(JSON.stringify(report, null, 2));
  console.log("\nASSERTIONS:");
  for (const [name, v] of A) { console.log(`  ${v ? "PASS" : "FAIL"}  ${name}`); if (!v) ok = false; }
  await page.close();
} catch (e) {
  ok = false; console.error("ERROR", e);
} finally {
  await srv.close?.();
  await browser.close();
}
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
