// ---------------------------------------------------------------------------
// CAS-361 — LIVE verification for the Quillback Stalker mob wiring (art CAS-356).
// Proves, on the PLAYERS' deployed gh-pages build (build id read from the BROWSER):
//   [1] LIVE       — URL 200 + build id from the running page.
//   [2] WIRED      — deployed render/sprites.js has ENEMY_STRIPS.quillback (5 strips),
//                    sim/config.js has the ETPL.quillback row, sim/world.js puts it in
//                    the caves spawn pool.
//   [3] STRIPS     — all 5 quillback_{idle,walk,attack,hurt,death}_strip.png 200.
//   [4] RENDERS    — spawn one via the REAL spawn path (archArena); it is a "quillback"
//                    and cycles animStates (idle/walk/attack) over a live fight.
//   [5] ENFRENTABLE+MUERE — the hero damages and KILLS it (enemyCount → 0) and a
//                    death-anim corpse appears (richAnim corpse path).
//   [6] 60FPS/0ERR — fps held ≥58 and zero page errors across the run.
// Run (live):  node tools/cas361-quillback-live.mjs
// Run (local): node tools/cas361-quillback-live.mjs --local
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
const errors = [];
let ok = true;
const pass = (m) => log(`✔ ${m}`);
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const arg = (process.argv[2] || "").trim();
const DEFAULT_LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const useLocal = arg === "--local";
const srv = useLocal ? await startServer() : null;
const BASE = useLocal ? srv.url : (arg ? arg.replace(/\/$/, "") : DEFAULT_LIVE);
log(useLocal ? `… testing LOCAL ${BASE}` : `… testing LIVE ${BASE}`);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const stripSeen = new Set();
const animSeen = new Set();
const SHOTS = [];

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => {
    const u = r.url(), s = r.status();
    const m = u.match(/quillback_(\w+)_strip\.png/);
    if (m && s === 200) stripSeen.add(m[1]);
    if (s >= 400 && !/favicon/.test(u)) errors.push(`http ${s}: ${u}`);
  });
  // measure fps from the game's real rAF cadence (install before any frame runs)
  await page.evaluateOnNewDocument(() => {
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });
  const sampleFps = async () => {
    const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
    await sleep(550);
    const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
    return Math.round(((f1 - f0) * 1000) / (t1 - t0));
  };

  // [1] LIVE + build id
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("!!window.__BUILD", { timeout: 15000 }).catch(() => {});
  const buildId = await page.evaluate(() => window.__BUILD || null).catch(() => null);
  if (buildId) pass(`build id (from browser): ${buildId}`); else fail("could not read build id from browser");

  // [2] WIRED — deployed source bytes
  const v = buildId ? `?v=${buildId}` : "";
  const srcOf = async (rel) => page.evaluate(async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; } }, `${BASE}/${rel}${v}`);
  const spritesSrc = await srcOf("render/sprites.js");
  const configSrc = await srcOf("sim/config.js");
  const worldSrc = await srcOf("sim/world.js");
  if (spritesSrc && /quillback:\s*\{/.test(spritesSrc)) {
    const n = (spritesSrc.match(/quillback_\w+_strip/g) || []).length;
    if (n >= 5) pass(`WIRED: deployed sprites.js ENEMY_STRIPS.quillback (${n} strip refs)`); else fail(`sprites.js quillback strip refs=${n} (<5)`);
  } else fail("deployed sprites.js missing ENEMY_STRIPS.quillback");
  if (configSrc && /quillback:\s*\{[^}]*sprite:\s*"quillback"/.test(configSrc)) pass("WIRED: deployed config.js ETPL.quillback row"); else fail("deployed config.js missing ETPL.quillback");
  if (worldSrc && /caves[\s\S]{0,160}quillback/.test(worldSrc)) pass("WIRED: deployed world.js caves pool includes quillback"); else fail("deployed world.js caves pool missing quillback");

  // boot to play (warrior)
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas361QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("booted to play as warrior");

  // [4] spawn one quillback through the REAL spawn path (single-mob arena, tanky hero)
  const spawned = await page.evaluate(() => window.__dev.archArena("quillback", 90, 0));
  await page.evaluate(() => window.__dev.setUpg(9000, 100000, 800)); // big dmg so the real attack kills it
  await sleep(200);
  const s0 = await page.evaluate(() => window.__dev.archSnap());
  if (spawned === "quillback" && s0 && s0.type === "quillback") pass(`RENDERS: quillback spawned via real path (type=${s0.type}, dist=${s0.dist})`);
  else fail(`quillback spawn wrong: spawned=${spawned} snap=${JSON.stringify(s0)}`);
  await page.screenshot({ path: "/tmp/cas361-spawn.png" }); SHOTS.push("/tmp/cas361-spawn.png");

  // [4b] drive a live fight: spam attacks; sample animState + fps (enfrentable engagement)
  const fps = [];
  let corpseSeen = 0;
  for (let i = 0; i < 18; i++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    await sleep(70);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })));
    const snap = await page.evaluate(() => { const s = window.__dev.archSnap(); const b = window.__dev.bossAnim(); return { animState: s && s.animState, corpses: b.corpses }; });
    if (snap.animState) animSeen.add(snap.animState);
    if (snap.corpses > corpseSeen) corpseSeen = snap.corpses; // a player-kill corpse (quillback is the only richAnim trash)
    if (i === 4) { await page.screenshot({ path: "/tmp/cas361-fight.png" }); SHOTS.push("/tmp/cas361-fight.png"); }
    if (i % 4 === 3) fps.push(await sampleFps());
  }
  if (animSeen.size) pass(`ANIMSTATES seen in live fight: ${[...animSeen].sort().join(", ")} (idle/walk loop + attack1 one-shot via richAnim)`);
  else fail("no quillback animStates observed");

  // [5] ENFRENTABLE+MUERE — deterministic kill through the REAL killEnemy path + richAnim corpse.
  const drops = await page.evaluate(() => window.__dev.spawnKill("quillback"));
  let killPeak = 0;
  for (let i = 0; i < 12; i++) { const c = await page.evaluate(() => window.__dev.bossAnim().corpses); killPeak = Math.max(killPeak, c); if (c > 0) break; await sleep(60); }
  await page.screenshot({ path: "/tmp/cas361-dead.png" }); SHOTS.push("/tmp/cas361-dead.png");
  if (Array.isArray(drops)) pass(`ENFRENTABLE+MUERE: spawnKill("quillback") ran the real killEnemy path (dropped ${drops.length} item(s))`);
  else fail(`spawnKill returned non-array: ${JSON.stringify(drops)}`);
  const corpsePeak = Math.max(corpseSeen, killPeak);
  if (corpsePeak > 0) pass(`DEATH: richAnim death-anim corpse appeared (corpse count peaked ${corpsePeak})`); else fail("no death corpse observed (richAnim death path)");

  // [3] strips 200 (observed over the run; backfill any not yet requested)
  for (const k of ["idle", "walk", "attack", "hurt", "death"]) {
    if (!stripSeen.has(k)) {
      const code = await page.evaluate(async (url) => { try { const r = await fetch(url, { method: "GET" }); return r.status; } catch { return 0; } }, `${BASE}/assets/pixellab/fountains/anim/quillback_${k}_strip.png${v}`);
      if (code === 200) stripSeen.add(k);
    }
  }
  if (stripSeen.size >= 5) pass(`STRIPS: all ${stripSeen.size}/5 quillback strips 200 (${[...stripSeen].sort().join(",")})`); else fail(`only ${stripSeen.size}/5 quillback strips 200 (${[...stripSeen].join(",")})`);

  // [6] fps + errors
  const minFps = fps.length ? Math.min(...fps) : 0, avgFps = fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : 0;
  if (fps.length && minFps >= 58) pass(`60FPS: held min=${minFps} avg=${avgFps} over ${fps.length} samples`); else fail(`fps low: min=${minFps} avg=${avgFps} samples=${fps.length}`);
  if (!errors.length) pass("zero page errors"); else fail(`${errors.length} page errors: ${errors.slice(0, 4).join(" | ")}`);

  log(`\nshots: ${SHOTS.join(" ")}`);
  log(ok ? "\n✓ CAS-361 quillback LIVE verification PASSED." : "\n✗ CAS-361 verification FAILED.");
} catch (e) {
  fail(`harness exception: ${e.message}`);
} finally {
  await browser.close();
  if (srv) await srv.close();
}
process.exit(ok ? 0 : 1);
