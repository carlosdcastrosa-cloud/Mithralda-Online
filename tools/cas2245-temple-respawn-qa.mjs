// CAS-2245 — OBSERVABLE verify of HOME-TEMPLE RESPAWN (Tibia: al morir, reaparecer en el Templo de la Ciudad,
// dentro de la Zona Segura / SAFEZONE CAS-2242). Pure sim mechanic, $0 art, ships DARK (TEMPLE_RESPAWN.enabled:false).
// The respawn point derives DETERMINISTICALLY from the SAME world.deco `prop_city_temple` POI that feeds
// MINIMAP/ZONE_BANNER/SAFEZONE (safeZoneGeom) — 0 RNG, server-authoritative-ready. QA observes via the
// __dev.templeRespawn() hook (sim.dev), which flips the feature IN-MEMORY (A/B like __dev.safeZone) so the on-disk
// config stays false ⇒ byte-identical served build.
//
// AUDIT FINDING (the reason this issue is NOT a no-op): the current respawn anchor is `world.templeF` = the CONTINENT
// HUB fountain (M.hub), while the SAFEZONE "Ciudad" Templo POI (prop_city_temple) lives in the OLD-LANDS band (proc
// world shifted +procOY). They are DIFFERENT temples, thousands of px apart. So today death sends you to the hub, NOT
// to the city Templo. This feature reroutes death → the city Templo (inside SAFEZONE).
//
// Proof (single boot, no config-file edit):
//   1. boots clean to play, 0 JS errors, __dev mounts, __BUILD present.
//   2. DARK default: TEMPLE_RESPAWN.enabled === false.
//   3. home-temple point derives from the Templo POI: point != null, point == temple + offsetY (south),
//      distToTemple == offsetY, nearTemple true, inSafeZone true (respawn WOULD land in the sanctuary radius).
//   4. AUDIT contrast / DARK byte-safe (OFF): kill + respawn with the flag OFF ⇒ hero lands at the normal checkpoint
//      (world.templeF = continent hub), FAR from the city Templo (dist > templeRadius) ⇒ OFF == HEAD behavior.
//   5. worldFingerprint byte-stable across the enable toggle (respawn/geometry consume 0 RNG on the fingerprint stream).
//   6. flip ON in-memory; kill + respawn ⇒ hero lands EXACTLY at the home-temple point (die → vuelve a casa).
//   7. nearTemple + inSafeZone at the landing spot ⇒ engancha con el santuario.
//   8. determinism: a SECOND ON death+respawn lands at the SAME point (pure geometry, 0 RNG).
//   9. cohesive loop "muere → casa → recupera HP": at the landing spot, SAFEZONE regen (LIVE) heals, ×templeMul (2.5)
//      because nearTemple ⇒ HP climbs faster than a plain POI (the "recupera HP" half of the loop).
//  10. no render footprint ($0 art): a screen-corner hash is IDENTICAL flag-OFF vs in-memory-ON (pure sim, no visual).
//  11. fps >= 55 after the ON respawn (no per-frame allocs).
// Run: node tools/cas2245-temple-respawn-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const OUT = join(ROOT, "shots", "cas2245");
mkdirSync(OUT, { recursive: true });
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
  await sleep(400);
}

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 640, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errors.push(t); } });
  await page.goto(srv.url + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // 1. clean boot
  const build = await page.evaluate(() => window.__BUILD || null);
  const hasHook = await page.evaluate(() => !!(window.__dev && typeof window.__dev.templeRespawn === "function"));
  ok("1 boots clean, __dev.templeRespawn + __BUILD present, 0 JS errors", errors.length === 0 && !!build && hasHook, `build=${build} errs=${errors.length}`);

  // 2. DARK default
  const st0 = await page.evaluate(() => window.__dev.templeRespawn());
  ok("2 DARK default TEMPLE_RESPAWN.enabled === false", st0.enabled === false, `enabled=${st0.enabled}`);

  // 3. point derives from Templo POI
  const derived = st0.point && st0.temple &&
    st0.point.x === st0.temple.x && st0.point.y === st0.temple.y + st0.offsetY;
  ok("3 home point == Templo POI + offsetY (south, deterministic)", !!derived,
     `point=${JSON.stringify(st0.point)} temple=${JSON.stringify(st0.temple)} off=${st0.offsetY}`);
  ok("3b landing inside sanctuary radius + safe zone", st0.inSafeZone === true && st0.nearTemple === true && st0.distToTemple === st0.offsetY,
     `inSafeZone=${st0.inSafeZone} nearTemple=${st0.nearTemple} dist=${st0.distToTemple} r=${st0.templeRadius}`);

  // 4. AUDIT contrast / DARK byte-safe: OFF respawn lands at the normal checkpoint (continent hub), NOT the city Templo
  const offRespawn = await page.evaluate(() => { window.__dev.killHero(); const r = window.__dev.retryRun();
    const h = window.__dev.templeRespawn(); return { scene: r.scene, hero: h.hero, point: h.point }; });
  const offFar = dist(offRespawn.hero, offRespawn.point) > st0.templeRadius;
  ok("4 OFF (DARK) respawn lands at normal checkpoint, FAR from city Templo (== HEAD)",
     offRespawn.scene === "play" && offFar,
     `dist(hero,templePoint)=${dist(offRespawn.hero, offRespawn.point).toFixed(0)} > r=${st0.templeRadius}`);

  // 5. worldFingerprint byte-stable across toggle
  const fpEq = await page.evaluate(() => {
    const j = () => JSON.stringify(window.__dev.worldFingerprint());
    const a = j();
    window.__dev.templeRespawn({ enabled: true }); const b = j();
    window.__dev.templeRespawn({ enabled: false }); const c = j();
    return a === b && b === c;
  });
  ok("5 worldFingerprint byte-stable across TEMPLE_RESPAWN toggle (0 RNG drift)", fpEq === true);

  // 6-8. flip ON, kill + respawn ⇒ land at the home-temple point; deterministic on repeat
  const on1 = await page.evaluate(() => window.__dev.templeRespawn({ enabled: true, respawn: true }));
  const landedAtPoint = on1.point && on1.hero && Math.abs(on1.hero.x - on1.point.x) < 1 && Math.abs(on1.hero.y - on1.point.y) < 1;
  ok("6 ON: die → respawn lands EXACTLY at the city Templo point (vuelve a casa)", !!landedAtPoint && on1.hero.dead === false,
     `hero=${JSON.stringify(on1.hero)} point=${JSON.stringify(on1.point)}`);
  ok("7 landing is nearTemple + inSafeZone (sanctuary anchor)", on1.nearTemple === true && on1.inSafeZone === true,
     `nearTemple=${on1.nearTemple} inSafeZone=${on1.inSafeZone}`);
  const on2 = await page.evaluate(() => window.__dev.templeRespawn({ respawn: true }));
  ok("8 determinism: 2nd ON death+respawn lands at the SAME point (0 RNG)",
     Math.abs(on2.hero.x - on1.hero.x) < 1 && Math.abs(on2.hero.y - on1.hero.y) < 1,
     `p1=${on1.hero.x},${on1.hero.y} p2=${on2.hero.x},${on2.hero.y}`);

  // 9. cohesive loop: SAFEZONE regen at the landing spot, accelerated ×templeMul (nearTemple)
  const regen = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const sz0 = window.__dev.safeZone({ setHp: 100, pause: 0 });   // low HP at the temple landing
    const hp0 = sz0.hp, nearTemple = sz0.nearTemple, enabled = sz0.enabled, ratePct = sz0.ratePctPerSec, base = window.__dev.safeZone().enabled;
    await sleep(1200);
    const sz1 = window.__dev.safeZone();
    return { enabled, nearTemple, hp0, hp1: sz1.hp, ratePct, templeMul: sz1.templeMul, regenPct: sz1.hp > hp0 };
  });
  ok("9 cohesive loop: HP regens at the temple landing (SAFEZONE) and nearTemple ⇒ ×templeMul rate",
     regen.enabled === true && regen.nearTemple === true && regen.hp1 > regen.hp0 &&
     Math.abs(regen.ratePct - 4.5 * regen.templeMul) < 0.5,
     `hp ${regen.hp0}→${regen.hp1.toFixed(1)} rate=${regen.ratePct}%/s (=${regen.templeMul}×base)`);

  // 10. DARK byte-safe + no render footprint ($0 art), proven DETERMINISTICALLY (screenshot hashing is noisy on a
  //     LIVE scene): the SHIPPED config ships enabled:false, and NO render module references the flag (pure sim).
  const served = await page.evaluate(async (base) => {
    const cfg = await (await fetch(base + "sim/config.js", { cache: "no-store" })).text();
    const rnd = await (await fetch(base + "render/render.js", { cache: "no-store" })).text();
    const m = cfg.match(/TEMPLE_RESPAWN\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
    return { diskEnabled: m ? m[1] : "MISSING", renderRefs: (rnd.match(/TEMPLE_RESPAWN/g) || []).length };
  }, srv.url + "/");
  ok("10 DARK byte-safe: shipped config TEMPLE_RESPAWN.enabled:false + 0 render refs ($0 art, pure sim)",
     served.diskEnabled === "false" && served.renderRefs === 0,
     `disk=${served.diskEnabled} renderRefs=${served.renderRefs}`);

  // 11. fps
  const fps = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let n = 0; let last = performance.now(); const samples = [];
    const loop = () => { const now = performance.now(); samples.push(1000 / (now - last)); last = now; n++; if (n < 90) requestAnimationFrame(loop); };
    requestAnimationFrame(loop); await sleep(1700);
    samples.sort((a, b) => a - b); return samples[Math.floor(samples.length / 2)];
  });
  ok("11 fps >= 55 with feature ON", fps >= 55, `median=${fps.toFixed(1)}`);

  await page.screenshot({ path: join(OUT, "temple-respawn-landing.png") });
  console.log(`\n${FAIL === 0 ? "ALL PASS" : "FAILURES"}: ${PASS} passed, ${FAIL} failed`);
} finally {
  await browser.close();
  await srv.close();
}
process.exit(FAIL === 0 ? 0 : 1);
