// CAS-2234 — OBSERVABLE verify of the ZONE/REGION BANNER (Tibia-style, render+code-only, $0 art, DARK).
// Ships DARK (ZONE_BANNER.enabled:false). QA/verify observes via the __dev.zone() hook, which flips the
// feature IN-MEMORY (same A/B pattern as __dev.weather / __dev.daynight) so the on-disk config stays false
// ⇒ byte-identical served build. All runtime flips are render-only; sim/save are never touched (asserted via
// worldFingerprint). Regions derive PURELY from the SAME world.deco POIs the minimap uses (CAS-2226).
//
// Proof (single boot, no config-file edit):
//   1. boots clean to play, 0 JS errors, ZONE_BANNER.enabled default === false (DARK).
//   2. __dev.zone().regions derives the 4 city POIs (Templo/Depósito/Taberna/Parque) + "Ciudad" container.
//   3. worldFingerprint identical across every toggle (render-only, 0 sim/save drift).
//   4. OFF baseline screenshot + hash; flip OFF again ⇒ HASH-IDENTICAL (OFF path untouched ⇒ byte-safe DARK).
//   5. flip ON in-memory; tp onto each POI centre ⇒ zone().current === that POI label (deterministic derivation).
//   6. crossing into a POI FIRES the banner once (alpha ramps up); staying inside does NOT re-fire.
//   7. banner text renders top-third (gold pixels appear vs OFF baseline) and does NOT cover the action centre.
//   8. fade envelope: alpha rises to ~1 during hold, then decays toward 0 after hold+fade.
//   9. Ciudad container banner carries its "Zona segura" subtitle.
//  10. fps >= 55 with the banner active (no per-frame allocs).
// Run: node tools/cas2234-zone-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2234");
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

  const A = [];
  const fp = () => page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(1234)));
  const zst = () => page.evaluate(() => window.__dev.zone());

  // 1. DARK default
  const z0 = await zst();
  A.push(["ZONE_BANNER.enabled default === false (DARK)", z0.enabled === false]);

  // 2. regions derive the 4 POIs + Ciudad container (deco-derived, same source as minimap)
  const names = z0.regions.map((r) => r.name);
  const poiNames = z0.regions.filter((r) => !r.container).map((r) => r.name).sort();
  const hasCity = z0.regions.some((r) => r.container && r.name === "Ciudad");
  A.push(["4 city POIs derived (Templo/Depósito/Taberna/Parque)",
    JSON.stringify(poiNames) === JSON.stringify(["Depósito", "Parque", "Taberna", "Templo"])]);
  A.push(["'Ciudad' container region derived (bbox of POIs)", hasCity]);

  // 3. worldFingerprint stable across enable toggle (render-only, 0 sim drift)
  const fp0 = await fp();
  await page.evaluate(() => window.__dev.zone({ enabled: true }));  // flip ON in-memory (disk config stays false)
  const fp1 = await fp();
  A.push(["worldFingerprint unchanged across enable toggle (0 sim drift)", fp0 === fp1]);

  // FREEZE the animated LIVE layers (DAYNIGHT + WEATHER are enabled:true and clock-animate every frame) so
  // screenshot-hash comparisons are valid. Noon (phase 0.5) = no tint; weather phase 0 = clear (nothing drawn).
  // Per CAS-2231: byte-safety on a live animated build must be proven with a FROZEN scene, not raw hashes.
  await page.evaluate(() => { window.__dev.daynight({ phase: 0.5 }); window.__dev.weather(0); });

  // 5. tp onto each POI centre → zone().current === that POI label
  const pois = z0.regions.filter((r) => !r.container);
  for (const p of pois) {
    await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), p.x / TS, p.y / TS);
    await sleep(120);
    const cur = (await zst()).current;
    A.push([`tp onto ${p.name} centre ⇒ current === '${p.name}'`, cur === p.name]);
  }

  // 6. crossing FIRES banner once. Move OUT to wilderness first, then INTO Templo.
  const templo = pois.find((r) => r.name === "Templo");
  await page.evaluate(() => window.__dev.tp(2, 2));  // far outside any region → current resets to null
  await sleep(120);
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), templo.x / TS, templo.y / TS);
  await sleep(150);
  const zEnter = await zst();
  A.push(["crossing into Templo FIRES banner (alpha > 0.2)", !!zEnter.banner && zEnter.banner.alpha > 0.2 && zEnter.banner.name === "Templo"]);

  // 7. banner renders in the TOP band and LEAVES THE COMBAT CENTRE UNTOUCHED. Park at the static map corner
  //    (tp 2,2 — no moving entities there, frozen scene) and DIFF banner-cleared vs banner-active. Any curse
  //    modal is present in BOTH frames ⇒ cancels in the diff, isolating exactly what the banner drew. Asserts
  //    two acceptance criteria at once: title drew (top band) + action centre readable (~no centre change).
  await page.evaluate(() => { window.__dev.zone(null); window.__dev.tp(2, 2); });
  await sleep(300);
  await page.evaluate(() => { const cv = document.getElementById("c"), g = cv.getContext("2d");
    window.__zbA = g.getImageData(0, 0, cv.width, cv.height).data; });
  await page.evaluate(() => window.__dev.zone({ name: "Templo", sub: "Zona segura" }));
  await sleep(700);  // past fade-in → full opacity
  await page.screenshot({ path: join(OUT, "banner-templo.png") });
  const bands = await page.evaluate(() => {
    const cv = document.getElementById("c"), g = cv.getContext("2d");
    const B = g.getImageData(0, 0, cv.width, cv.height).data, Ap = window.__zbA, w = cv.width, h = cv.height;
    const ty0 = (h * 0.06) | 0, ty1 = (h * 0.30) | 0, my0 = (h * 0.40) | 0, my1 = (h * 0.60) | 0;
    let top = 0, mid = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4;
      const d = Math.abs(Ap[i] - B[i]) + Math.abs(Ap[i + 1] - B[i + 1]) + Math.abs(Ap[i + 2] - B[i + 2]);
      if (d > 30) { if (y >= ty0 && y < ty1) top++; else if (y >= my0 && y < my1) mid++; } }
    return { top, mid };
  });
  A.push([`banner draws in TOP band (changed px ${bands.top} > 300)`, bands.top > 300]);
  A.push([`combat CENTRE untouched (changed px ${bands.mid} < 80 — readability)`, bands.mid < 80]);
  // re-enter Templo (out→in) so the banner FIRES via zone crossing for the "staying inside" check below
  await page.evaluate(() => { window.__dev.zone(null); window.__dev.tp(2, 2); });
  await sleep(120);
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), templo.x / TS, templo.y / TS);
  await sleep(150);

  // staying inside does NOT re-fire: capture start t, wait, expect t to keep advancing (same banner, not reset)
  const t1 = (await zst()).banner?.t ?? 0;
  await sleep(300);
  await page.evaluate((tx, ty) => window.__dev.tp(tx, ty), templo.x / TS + 0.5, templo.y / TS + 0.5); // nudge, still inside
  await sleep(120);
  const zSame = await zst();
  A.push(["staying inside does NOT re-fire (t advanced, still 'Templo')",
    zSame.current === "Templo" && (zSame.banner === null || zSame.banner.t > t1)]);

  // 8. fade envelope: force a fresh banner, sample alpha over time (rise then decay)
  await page.evaluate(() => window.__dev.zone("Prueba")); // re-trigger to full
  await sleep(700); // > fadeIn (0.6s) → should be ~1 (in hold)
  const aHold = (await zst()).banner?.alpha ?? 0;
  await sleep(3200); // past hold(2.5)+fade(0.6) → decayed to 0/cleared
  const zGone = await zst();
  const aGone = zGone.banner ? zGone.banner.alpha : 0;
  A.push(["fade envelope: hold alpha ~1 (>0.9) then decays to ~0 (<0.1)", aHold > 0.9 && aGone < 0.1]);

  // 9. Ciudad container carries the subtitle
  await page.evaluate(() => window.__dev.zone({ name: "Ciudad", sub: "Zona segura" }));
  await sleep(50);
  const zCity = await zst();
  A.push(["Ciudad banner carries 'Zona segura' subtitle", zCity.banner && zCity.banner.sub === "Zona segura"]);

  // 4. DARK byte-safety (frozen scene). The banner render is gated: with no ACTIVE banner it draws nothing, so
  //    the frame is byte-identical whether the flag is ON or OFF — proving enabled:false ⇒ output == HEAD. Park
  //    at a fixed tile, freeze layers, and hash: (flag OFF, no banner) vs (flag ON, no banner) MUST match; an
  //    ACTIVE banner MUST differ (proves the code actually draws when it should).
  await page.evaluate(() => { window.__dev.zone(null); window.__dev.tp(2, 2); });
  await sleep(250);
  await page.evaluate(() => window.__dev.zone({ enabled: false }));
  await sleep(80);
  const hFlagOff = createHash("md5").update(await page.screenshot()).digest("hex");
  await page.evaluate(() => { window.__dev.zone({ enabled: true }); window.__dev.zone(null); });
  await sleep(60);
  const hFlagOnNoBanner = createHash("md5").update(await page.screenshot()).digest("hex");
  A.push(["frame byte-identical flag-OFF vs flag-ON-no-banner (DARK byte-safe)", hFlagOff === hFlagOnNoBanner]);
  await page.evaluate(() => window.__dev.zone("VisibleAquí"));
  await sleep(300);
  const hActive = createHash("md5").update(await page.screenshot()).digest("hex");
  A.push(["active banner frame DIFFERS from inactive (banner actually draws)", hActive !== hFlagOff]);
  const fp2 = await fp();
  A.push(["worldFingerprint identical OFF→ON→OFF (0 sim/save drift)", fp0 === fp2]);

  // 10. fps with banner active
  await page.evaluate(() => { window.__dev.zone({ enabled: true }); window.__dev.zone("PerfZona"); });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    (function loop() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(loop); else res(n); })();
  }));
  A.push([`fps >= 55 with banner active (got ${fps})`, fps >= 55]);

  A.push(["0 JS errors during whole run", errors.length === 0]);

  console.log("\nCAS-2234 ZONE BANNER — OBSERVABLE self-verify\n");
  for (const [name, v] of A) { console.log(`  ${v ? "PASS" : "FAIL"}  ${name}`); if (!v) ok = false; }
  if (errors.length) console.log("\n  errors:", errors.slice(0, 5));
  console.log(`\n  regions: ${JSON.stringify(names)}`);
} finally {
  await srv.close?.();
  await browser.close();
}
console.log("\n" + (ok ? "ALL PASS ✅" : "FAILURES ❌"));
process.exit(ok ? 0 : 1);
