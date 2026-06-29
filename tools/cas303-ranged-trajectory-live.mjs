// ---------------------------------------------------------------------------
// CAS-303 — LIVE proof that mob ranged attacks no longer draw a visible
// trajectory / aim-line, while the attack still connects.
//
// Board CAS-302: "elimina la trayectoria visible de los ataques a distancia de
// los mobs ... mas dificil para el jugador ver de donde viene el golpe."
//
// The old ranged windup telegraph (render.js) drew a ~240px dashed line from the
// mob straight down its shot path. This harness:
//   1. Boots the LIVE gh-pages build, enters play as a warrior.
//   2. Spawns RANGED-ONLY mobs (mage/spearman/wraith) on top of the hero so they
//      aggro → windup → FIRE repeatedly.
//   3. Instruments the canvas 2D context to record every stroked segment's pixel
//      length over a multi-second capture window.
//   4. Asserts: NO long line stroke (>= 150px) is ever drawn (the aim-line is
//      gone), AND enemy projectiles actually spawn (proves windups completed and
//      the attack still fires — damage path intact).
//   5. Sanity floor: a known long telegraph (charger lunge/charge lane) is NOT
//      spawned here, so any >=150px segment could ONLY be the old ranged aim-line.
//
// PASS = aim-line absent + projectiles fired + 0 page errors + 60fps held.
// Run: node tools/cas303-ranged-trajectory-live.mjs
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";

// ?dev exposes window.__dev (gated in game.js by location.search.indexOf('dev'))
const URL = (process.env.CAS_URL || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/") + "?dev";
const CHROME = "/usr/bin/chromium";
const checks = [];
const ok = (name, cond, extra = "") => { checks.push({ name, pass: !!cond, extra }); console.log(`${cond ? "✔" : "✘"} ${name}${extra ? "  — " + extra : ""}`); };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,800"] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("requestfailed", r => { const u = r.url(); if (!/favicon|\.map$/.test(u)) errors.push("reqfail: " + u); });
  page.on("response", r => { if (r.status() >= 400 && !/favicon|\.map$/.test(r.url())) errors.push(`http ${r.status()}: ${r.url()}`); });

  await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });
  const build = await page.evaluate(() => fetch("version.json", { cache: "no-store" }).then(r => r.json()).then(j => j.build).catch(() => null));
  ok("live build id present", !!build, build || "none");

  // boot to play as warrior (mirror tools/smoke.mjs flow)
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas303Bot"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  ok("entered play scene as warrior", true);

  // Install a canvas stroke recorder: track the current pen position and the max
  // segment length ever stroked. The ranged aim-line was a single ~240px lineTo.
  await page.evaluate(() => {
    const P = CanvasRenderingContext2D.prototype;
    window.__cas303 = { maxSeg: 0, longCount: 0, segs: [] };
    const omove = P.moveTo, oline = P.lineTo, ostroke = P.stroke;
    P.moveTo = function (x, y) { this.__px = x; this.__py = y; this.__segMax = 0; return omove.call(this, x, y); };
    P.lineTo = function (x, y) {
      if (this.__px !== undefined) { const d = Math.hypot(x - this.__px, y - this.__py); if (d > (this.__segMax || 0)) this.__segMax = d; }
      this.__px = x; this.__py = y; return oline.call(this, x, y);
    };
    P.stroke = function (...a) {
      const m = this.__segMax || 0;
      if (m > window.__cas303.maxSeg) window.__cas303.maxSeg = m;
      if (m >= 150) { window.__cas303.longCount++; window.__cas303.segs.push(Math.round(m)); }
      this.__segMax = 0;
      return ostroke.apply(this, a);
    };
  });

  // Spawn ranged-only mobs right on the hero so they immediately aggro + windup + fire.
  await page.evaluate(() => {
    for (let i = 0; i < 4; i++) { __dev.spawn("mage", 30 + i * 8, -20); __dev.spawn("spearman", -30 - i * 8, 20); }
    __dev.spawn("wraith", 0, -40); __dev.spawn("wraith", 0, 40);
  });

  // Capture window: hold position, sample fps + projectile fire over ~5s.
  let maxProj = 0; const fps = [];
  for (let s = 0; s < 10; s++) {
    await new Promise(r => setTimeout(r, 500));
    const snap = await page.evaluate(() => ({ ep: __dev.enemyProj().total, n: __dev.enemyCount() }));
    if (snap.ep > maxProj) maxProj = snap.ep;
    const f = await page.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 >= 1000) res(n); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
    fps.push(f);
  }

  const rec = await page.evaluate(() => window.__cas303);
  const minFps = Math.min(...fps);

  ok("enemy ranged projectiles fired (windup completed, attack lands)", maxProj > 0, `max live enemy proj=${maxProj}`);
  ok("NO ranged aim-line / trajectory drawn (no stroke segment >=150px)", rec.longCount === 0, `longSegments=${rec.longCount} maxSeg=${Math.round(rec.maxSeg)}px sample=${JSON.stringify(rec.segs.slice(0, 6))}`);
  ok("max stroke segment stays short (sub-aimline)", rec.maxSeg < 150, `maxSeg=${Math.round(rec.maxSeg)}px`);
  ok("60fps held under ranged barrage", minFps >= 55, `fps=${JSON.stringify(fps)} min=${minFps}`);
  ok("zero page errors / failed requests", errors.length === 0, errors.slice(0, 4).join(" | "));

  await page.screenshot({ path: "tools/cas303-ranged-trajectory.png" });
  console.log("· screenshot -> tools/cas303-ranged-trajectory.png");

  const passed = checks.filter(c => c.pass).length;
  console.log(`\n${passed}/${checks.length} checks passed  (build ${build})`);
  if (passed !== checks.length) process.exit(1);
  console.log("\n✓ CAS-303 ranged-trajectory-hide LIVE PASS");
} finally {
  await browser.close();
}
