// CAS-2242 — OBSERVABLE verify of the CITY SAFE ZONE / SANCTUARY (sim-authoritative HP regen inside the city,
// $0 art, DARK). Ships DARK (SAFEZONE.enabled:false). The AUTHORITY lives in sim (tickSafeZone); render only adds a
// discreet "Zona segura" badge. QA observes via the __dev.safeZone() hook (sim.dev), which flips the feature IN-MEMORY
// (same A/B pattern as __dev.zone/weather/daynight) so the on-disk config stays false ⇒ byte-identical served build.
// The safe-zone bbox derives PURELY from the SAME world.deco POIs the minimap/zone-banner use (CAS-2226/2234).
//
// Proof (single boot, no config-file edit):
//   1. boots clean to play, 0 JS errors, SAFEZONE.enabled default === false (DARK).
//   2. probe derives the city bbox from POIs + a Templo anchor (deco-derived, same source as minimap).
//   3. DARK byte-safe: flag OFF, hero in city with low HP ⇒ HP does NOT regen (tickSafeZone gated ⇒ == HEAD).
//   4. worldFingerprint stable across enable toggle (0 sim/save drift; regen consumes 0 RNG).
//   5. flip ON in-memory; outside the city ⇒ inZone false ⇒ no regen.
//   6. flip ON; inside the city ⇒ inZone true ⇒ HP regens toward max at ~SAFEZONE.regenPct/s.
//   7. near the Templo ⇒ nearTemple true ⇒ rate ×templeMul (accelerated sanctuary; HP climbs faster than a plain POI).
//   8. regen PAUSES briefly after taking damage (pause hook) — hp holds while pauseT > 0, resumes after.
//   9. a REAL enemy hit sets the pause (end-to-end damageHero wiring) — hp does not climb right after being struck.
//  10. regen CLAMPS at maxHp (never overflows).
//  11. render affordance: the "Zona segura" badge draws ON-in-city and is ABSENT OFF (frame differs; DARK byte-safe).
//  12. fps >= 55 with the feature active in the city (no per-frame allocs).
// Run: node tools/cas2242-safezone-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2242");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TS = 32;

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
  await sleep(500);
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
let ok = true;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  // Freeze the animated LIVE ambient layers so screenshot hashes are valid (per CAS-2231).
  await page.evaluate(() => { window.__dev.daynight({ phase: 0.5 }); window.__dev.weather(0); });

  const A = [];
  const fp = () => page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(1234)));
  const sz = (p) => page.evaluate((pp) => window.__dev.safeZone(pp), p ?? null);
  // tp to the CENTRE of the city bbox (world px → tile) — deterministic, derived from the probe.
  const tpCity = async (g) => { const cx = (g.bbox[0] + g.bbox[2]) / 2, cy = (g.bbox[1] + g.bbox[3]) / 2;
    await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), cx / TS, cy / TS); await sleep(120); };

  // 1. DARK default
  const s0 = await sz();
  A.push(["SAFEZONE.enabled default === false (DARK)", s0.enabled === false]);

  // 2. bbox + temple derived from POIs
  A.push(["city bbox derived from world.deco POIs", Array.isArray(s0.bbox) && s0.bbox.length === 4 && s0.bbox[2] > s0.bbox[0]]);
  A.push(["Templo anchor derived (accelerated-regen POI)", !!s0.temple]);

  // 3. DARK byte-safe (OBSERVABLE): flag OFF, hero inside city, low HP ⇒ NO regen (gate off ⇒ == HEAD).
  await tpCity(s0);
  await page.evaluate(() => window.__dev.safeZone({ setHp: 20 }));
  const darkHp0 = (await sz()).hp;
  await sleep(1200);
  const darkHp1 = (await sz()).hp;
  A.push([`DARK: HP frozen with flag OFF inside city (${darkHp0}→${darkHp1})`, Math.abs(darkHp1 - darkHp0) < 0.01]);

  // 4. worldFingerprint stable across enable toggle
  const fp0 = await fp();
  await page.evaluate(() => window.__dev.safeZone({ enabled: true }));   // flip ON in-memory (disk stays false)
  const fp1 = await fp();
  A.push(["worldFingerprint unchanged across enable toggle (0 sim drift)", fp0 === fp1]);

  // 5. flip ON, OUTSIDE the city ⇒ no regen
  await page.evaluate(() => window.__dev.tp(2, 2));   // far corner, outside any POI/bbox
  await sleep(120);
  const outState = await sz();
  await page.evaluate(() => window.__dev.safeZone({ setHp: 20 }));
  const outHp0 = (await sz()).hp; await sleep(1000); const outHp1 = (await sz()).hp;
  A.push(["outside city ⇒ inZone false", outState.inZone === false]);
  A.push([`outside city ⇒ no regen (${outHp0}→${outHp1})`, Math.abs(outHp1 - outHp0) < 0.01]);

  // 6. flip ON, INSIDE the city (plain area, away from temple) ⇒ regen climbs
  await tpCity(s0);
  let inState = await sz();
  // if the bbox centre happens to sit on the temple, nudge off it for the plain-regen sample
  if (inState.nearTemple) { await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), s0.bbox[0] / TS + 1, s0.bbox[1] / TS + 1); await sleep(120); inState = await sz(); }
  await page.evaluate(() => window.__dev.safeZone({ setHp: 20, pause: 0 }));
  const inHp0 = (await sz()).hp; await sleep(1500); const inHp1 = (await sz()).hp;
  const plainGain = inHp1 - inHp0;
  A.push([`inside city ⇒ inZone true`, inState.inZone === true]);
  A.push([`inside city ⇒ HP regens (${inHp0}→${inHp1.toFixed(1)}, +${plainGain.toFixed(1)})`, plainGain > 1]);

  // 7. near the Templo ⇒ accelerated (rate ×templeMul, HP climbs faster than plain)
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), s0.temple.x / TS, s0.temple.y / TS);
  await sleep(120);
  const tState = await sz();
  await page.evaluate(() => window.__dev.safeZone({ setHp: 20, pause: 0 }));
  const tHp0 = (await sz()).hp; await sleep(1500); const tHp1 = (await sz()).hp;
  const templeGain = tHp1 - tHp0;
  A.push([`near Templo ⇒ nearTemple true + rate ×templeMul (rate=${tState.ratePctPerSec}%/s)`, tState.nearTemple === true && tState.ratePctPerSec > inState.ratePctPerSec + 0.001]);
  A.push([`Templo regen FASTER than plain city (+${templeGain.toFixed(1)} > +${plainGain.toFixed(1)})`, templeGain > plainGain + 0.5]);

  // 8. damage pause (probe-forced): pauseT holds regen, then resumes
  await tpCity(s0);
  await page.evaluate(() => window.__dev.safeZone({ setHp: 20, pause: 1.5 }));
  const pState = await sz();
  const pHp0 = pState.hp; await sleep(800); const pHp1 = (await sz()).hp;   // still within pause window
  A.push([`pauseT set after "damage" (${pState.pauseT}s > 0)`, pState.pauseT > 0]);
  A.push([`regen PAUSED during window (${pHp0}→${pHp1.toFixed(1)}, ~no gain)`, (pHp1 - pHp0) < 0.6]);
  await sleep(1400); const pHp2 = (await sz()).hp;   // pause elapsed → resumes
  A.push([`regen RESUMES after pause (${pHp1.toFixed(1)}→${pHp2.toFixed(1)})`, (pHp2 - pHp1) > 1]);

  // 9. REAL enemy hit sets the pause (end-to-end damageHero wiring). Retry-tolerant (headless aggro is timing-y).
  await tpCity(s0);
  await page.evaluate(() => window.__dev.safeZone({ setHp: 60, pause: 0 }));
  let hitPaused = false;
  for (let i = 0; i < 3 && !hitPaused; i++) {
    await page.evaluate(() => { for (let k = 0; k < 3; k++) window.__dev.spawn("orc", (k - 1) * 10, 6); });
    for (let t = 0; t < 12 && !hitPaused; t++) { await sleep(250); const st = await sz(); if (st.pauseT > 0) hitPaused = true; }
  }
  A.push([`real enemy hit ⇒ regen pause armed (damageHero wiring)`, hitPaused]);

  // 10. clamp at maxHp
  await tpCity(s0);
  const mhp = (await sz()).maxHp;
  await page.evaluate((m) => window.__dev.safeZone({ setHp: m, pause: 0 }), mhp);
  await sleep(700); const clampHp = (await sz()).hp;
  A.push([`regen clamps at maxHp (${clampHp} <= ${mhp})`, clampHp <= mhp + 0.01]);

  // 11. render affordance: badge draws ON-in-city, ABSENT OFF (frame differs ⇒ DARK byte-safe; badge actually draws)
  await tpCity(s0);
  await page.evaluate(() => window.__dev.safeZone({ enabled: false, setHp: 80 }));
  await sleep(200);
  const hOff = createHash("md5").update(await page.screenshot()).digest("hex");
  await page.evaluate(() => window.__dev.safeZone({ enabled: true }));
  await sleep(200);
  await page.screenshot({ path: join(OUT, "safezone-badge.png") });
  const hOn = createHash("md5").update(await page.screenshot()).digest("hex");
  A.push(["affordance: flag-ON-in-city frame DIFFERS from flag-OFF (badge draws)", hOn !== hOff]);

  // 4b. worldFingerprint identical OFF→ON→OFF (no sim/save drift from the whole run)
  await page.evaluate(() => window.__dev.safeZone({ enabled: false }));
  const fp2 = await fp();
  A.push(["worldFingerprint identical after full OFF→ON→OFF run (0 sim/save drift)", fp0 === fp2]);

  // 12. fps with feature active in city
  await page.evaluate(() => window.__dev.safeZone({ enabled: true, setHp: 30 }));
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    (function loop() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(n); })();
  }));
  A.push([`fps >= 55 with safe-zone active (got ${fps})`, fps >= 55]);

  A.push(["0 JS errors during whole run", errors.length === 0]);

  console.log("\nCAS-2242 CITY SAFE ZONE — OBSERVABLE self-verify\n");
  for (const [name, v] of A) { console.log(`  ${v ? "PASS" : "FAIL"}  ${name}`); if (!v) ok = false; }
  if (errors.length) console.log("\n  errors:", errors.slice(0, 5));
  const cfg = await sz();
  console.log(`\n  config: regenPct=4.5%/s base, templeMul=${cfg.templeMul}, templeRadius=${cfg.templeRadius}px, cityMargin=${cfg.cityMargin}px, regenDelay=${cfg.regenDelay}s`);
  console.log(`  bbox=${JSON.stringify(s0.bbox)}  temple=${JSON.stringify(s0.temple)}`);
} finally {
  await srv.close?.();
  await browser.close();
}
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
