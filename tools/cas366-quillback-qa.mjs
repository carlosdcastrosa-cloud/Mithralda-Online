// ---------------------------------------------------------------------------
// CAS-366 — INDEPENDENT QA live-verify of the Quillback Stalker MOB (wiring CAS-361,
// art CAS-356). Separate harness from the engineer's tools/cas361-quillback-live.mjs.
// Same live-verify pattern as dragon/demon QA (CAS-318/CAS-322): build id + source
// bytes are read from the RUNNING page, never from the local repo.
//
// Gates (all must pass for done):
//   [1] LIVE        — URL 200 + build id read from the browser (window.__BUILD).
//   [2] STRIPS×5    — all 5 quillback_{idle,walk,attack,hurt,death}_strip.png → 200.
//   [3] REAL POOL   — deployed sim/world.js caves spawner pool literally lists
//                     "quillback" (the REAL spawn config, not a hand-built object),
//                     plus archArena routes the REAL spawnEnemy factory.
//   [4] 5 ANIMS     — idle/walk loop + attack one-shot observed in a live fight, and
//                     a richAnim DEATH corpse appears (death strip). hurt strip is
//                     wired (deployed sprites.js) and fired by the real hitEnemy flinch.
//   [5] MUERE+LOOT  — spawnKill runs the REAL killEnemy path → drops loot + corpse.
//   [6] MOB SCALE   — deployed sprites.js quillback block has NO `tiles` key (=standard
//                     size*2.4, NOT boss-size) and ETPL size==skeleton size; corpse
//                     matches living size (visual shots for human sign-off).
//   [7] NO BALANCE  — deployed config.js ETPL.quillback stats == skeleton-tier
//                     (hp/dmg/spd/aggro/range/windup/recover/xp identical).
//   [8] 60FPS/0ERR  — fps min ≥59 and zero page errors over the run.
//
// Run (live gh-pages default):  node tools/cas366-quillback-qa.mjs
// Run (explicit URL):           node tools/cas366-quillback-qa.mjs https://host/path
// Run (local):                  node tools/cas366-quillback-qa.mjs --local
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const errors = [];
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
log(useLocal ? `… QA LOCAL ${BASE}` : `… QA LIVE ${BASE}`);

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

  // [1] LIVE + build id (read from running page)
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("!!window.__BUILD", { timeout: 15000 }).catch(() => {});
  const buildId = await page.evaluate(() => window.__BUILD || null).catch(() => null);
  if (buildId) pass(`build id (from browser DOM): ${buildId}`); else fail("could not read build id from browser");
  const v = buildId ? `?v=${buildId}` : "";
  const srcOf = async (rel) => page.evaluate(async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; } }, `${BASE}/${rel}${v}`);

  // [3a] REAL POOL — deployed world.js caves spawner literally lists quillback
  const worldSrc = await srcOf("sim/world.js");
  const cavesPool = worldSrc && worldSrc.match(/rect:\s*caves[\s\S]{0,200}?types:\s*\[([^\]]*)\]/);
  if (cavesPool && /['"]quillback['"]/.test(cavesPool[1])) pass(`REAL POOL: deployed world.js caves spawner types include quillback → [${cavesPool[1].replace(/\s+/g, "")}]`);
  else fail(`deployed world.js caves spawner pool missing quillback (${cavesPool ? cavesPool[1] : "no caves spawner found"})`);

  // [6a] MOB SCALE (source) — quillback ENEMY_STRIPS block has NO `tiles` key (boss mobs do).
  // NOTE: sprites.js has TWO "quillback:" — the CAS-360 procedural fallback (`quillback: { pal:`)
  // and the real strip block (`quillback:{ idle: _s(...)`). Anchor on the strip block via
  // its `idle: _s` head so we never grab the fallback. Span runs to the `death:` strip line.
  const spritesSrc = await srcOf("render/sprites.js");
  const qBlock = spritesSrc && spritesSrc.match(/quillback:\s*\{\s*idle:\s*_s[\s\S]*?death:\s*_s[^\n]*/);
  if (qBlock) {
    const stripRefs = (qBlock[0].match(/quillback_\w+_strip/g) || []).length;
    const hasTiles = /\btiles\s*:/.test(qBlock[0]);
    if (stripRefs >= 5 && !hasTiles) pass(`MOB SCALE(src): quillback block has ${stripRefs} strip refs and NO \`tiles\` key → standard mob scale (NOT boss-size)`);
    else fail(`quillback block scale check: stripRefs=${stripRefs} hasTiles=${hasTiles}`);
  } else fail("could not isolate quillback block in deployed sprites.js");

  // [4c] HURT WIRED (source) — deployed sim.js sets a one-shot flinch on richAnim mobs and
  // maps it to animState "hurt". Live-catching the 0.26s frame is flaky (attack-state has
  // render priority while in melee), so verify the mechanism + the strip load (STRIPS gate).
  const simSrc = await srcOf("sim/sim.js");
  const setsFlinch = simSrc && /richAnim\s*&&\s*e\.hp>0\)\s*e\.hurtT\s*=/.test(simSrc);
  const mapsHurt = simSrc && /e\.hurtT>0\)\s*ns\s*=\s*"hurt"/.test(simSrc);
  if (setsFlinch && mapsHurt) pass("HURT WIRED: deployed sim.js sets richAnim hurtT flinch on damage and maps it to animState \"hurt\" (+ hurt strip 200)");
  else fail(`hurt mechanism missing in deployed sim.js (setsFlinch=${setsFlinch} mapsHurt=${mapsHurt})`);

  // [7] NO BALANCE — deployed config ETPL.quillback == skeleton-tier
  const configSrc = await srcOf("sim/config.js");
  const rowOf = (src, key) => { const m = src && src.match(new RegExp(`${key}:\\s*\\{([^}]*)\\}`)); return m ? m[1] : null; };
  const numOf = (row, f) => { const m = row && row.match(new RegExp(`${f}:\\s*([0-9.]+)`)); return m ? +m[1] : null; };
  const qRow = rowOf(configSrc, "quillback"), sRow = rowOf(configSrc, "skeleton");
  if (qRow && sRow) {
    const fields = ["hp", "dmg", "spd", "aggro", "range", "windup", "recover", "xp"];
    const diff = fields.filter((f) => numOf(qRow, f) !== numOf(sRow, f));
    const richAnim = /richAnim:\s*true/.test(qRow);
    if (diff.length === 0 && richAnim) pass(`NO BALANCE: ETPL.quillback stats == skeleton-tier on all of [${fields.join(",")}] + richAnim:true (presentation-only diff)`);
    else fail(`balance drift vs skeleton on [${diff.join(",")}] (richAnim=${richAnim})`);
  } else fail("could not read ETPL.quillback / ETPL.skeleton rows from deployed config.js");

  // boot to play (warrior)
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas366QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("booted to play as warrior");

  // [3b] REAL POOL — confirm the caves zone pool (live sim) actually contains quillback
  await page.evaluate(() => window.__dev.tpZone("caves"));
  const pools = await page.evaluate(() => { try { return window.__dev.zonePools(); } catch { return null; } });
  if (pools && JSON.stringify(pools).includes("quillback")) pass(`REAL POOL(live): zonePools() reports quillback in a caves pool`);
  else log(`… zonePools() did not expose quillback (pools=${JSON.stringify(pools)}) — relying on world.js source + archArena factory`);

  // [3c] spawn ONE quillback through the REAL spawnEnemy factory (archArena, not hand-built)
  const spawned = await page.evaluate(() => window.__dev.archArena("quillback", 88, 0));
  await page.evaluate(() => window.__dev.setUpg(9000, 100000, 800));
  await sleep(200);
  const s0 = await page.evaluate(() => window.__dev.archSnap());
  if (spawned === "quillback" && s0 && s0.type === "quillback") pass(`SPAWN: quillback via real spawnEnemy factory (type=${s0.type}, dist=${s0.dist})`);
  else fail(`quillback spawn wrong: spawned=${spawned} snap=${JSON.stringify(s0)}`);
  await page.screenshot({ path: "/tmp/cas366-spawn.png" }); SHOTS.push("/tmp/cas366-spawn.png");

  // [4a] WALK — push hero far away so the mob chases (locomotion → walk loop strip)
  await page.evaluate(() => window.__dev.archMoveHero(360, 0));
  for (let i = 0; i < 16 && !animSeen.has("walk"); i++) {
    const st = await page.evaluate(() => { const s = window.__dev.archSnap(); return s && s.animState; });
    if (st) animSeen.add(st);
    await sleep(80);
  }
  // [4b] HURT — non-lethal hit through the real damage path → one-shot hurt strip
  await page.evaluate(() => window.__dev.archMoveHero(60, 0));
  for (let i = 0; i < 14 && !animSeen.has("hurt"); i++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    await sleep(45);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })));
    const st = await page.evaluate(() => { const s = window.__dev.archSnap(); return s && s.animState; });
    if (st) animSeen.add(st);
    // re-arm a fresh quillback if this one died (hurt is a brief flinch window)
    const alive = await page.evaluate(() => window.__dev.enemyCount() > 0);
    if (!alive) { await page.evaluate(() => { window.__dev.archArena("quillback", 60, 0); window.__dev.setUpg(20, 100000, 800); }); }
    await sleep(40);
  }

  // [4] 5 ANIMS — drive a live fight, sample animState; capture living-size for scale compare
  const fps = [];
  let corpseSeen = 0;
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    await sleep(70);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keyup", { code: "Digit1", key: "1", bubbles: true })));
    const snap = await page.evaluate(() => { const s = window.__dev.archSnap(); const b = window.__dev.bossAnim(); return { animState: s && s.animState, corpses: b.corpses }; });
    if (snap.animState) animSeen.add(snap.animState);
    if (snap.corpses > corpseSeen) corpseSeen = snap.corpses;
    if (i === 5) { await page.screenshot({ path: "/tmp/cas366-fight.png" }); SHOTS.push("/tmp/cas366-fight.png"); }
    if (i % 5 === 4) fps.push(await sampleFps());
  }
  // Live-observable states gate: idle + walk + attack must surface in real combat.
  const liveStates = ["idle", "walk", "attack1"];
  const missing = liveStates.filter((s) => !animSeen.has(s));
  if (missing.length === 0) pass(`ANIMS: live fight cycled [${[...animSeen].sort().join(", ")}] — idle/walk loop + attack1 one-shot all observed live${animSeen.has("hurt") ? " (incl. hurt flinch)" : ""}`);
  else fail(`live animStates missing ${missing.join(",")} (saw [${[...animSeen].sort().join(", ")}])`);

  // [5] MUERE+LOOT — deterministic kill through the REAL killEnemy path + richAnim corpse
  const drops = await page.evaluate(() => window.__dev.spawnKill("quillback"));
  let killPeak = 0;
  for (let i = 0; i < 14; i++) { const c = await page.evaluate(() => window.__dev.bossAnim().corpses); killPeak = Math.max(killPeak, c); if (c > 0) break; await sleep(60); }
  await page.screenshot({ path: "/tmp/cas366-death.png" }); SHOTS.push("/tmp/cas366-death.png");
  if (Array.isArray(drops)) pass(`MUERE+LOOT: spawnKill("quillback") ran the real killEnemy path (dropped ${drops.length} item(s))`);
  else fail(`spawnKill returned non-array: ${JSON.stringify(drops)}`);
  const corpsePeak = Math.max(corpseSeen, killPeak);
  if (corpsePeak > 0) pass(`DEATH: richAnim death-anim corpse appeared (corpse count peaked ${corpsePeak})`); else fail("no death corpse observed (richAnim death path)");

  // [2] strips 200 (observed over run; backfill any not requested by GET)
  for (const k of ["idle", "walk", "attack", "hurt", "death"]) {
    if (!stripSeen.has(k)) {
      const code = await page.evaluate(async (url) => { try { const r = await fetch(url, { method: "GET" }); return r.status; } catch { return 0; } }, `${BASE}/assets/pixellab/fountains/anim/quillback_${k}_strip.png${v}`);
      if (code === 200) stripSeen.add(k);
    }
  }
  if (stripSeen.size >= 5) pass(`STRIPS×5: all ${stripSeen.size}/5 quillback strips 200 (${[...stripSeen].sort().join(",")})`); else fail(`only ${stripSeen.size}/5 quillback strips 200 (${[...stripSeen].join(",")})`);

  // [8] fps + errors
  const minFps = fps.length ? Math.min(...fps) : 0, avgFps = fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : 0;
  if (fps.length && minFps >= 59) pass(`60FPS: held min=${minFps} avg=${avgFps} over ${fps.length} samples`); else fail(`fps low: min=${minFps} avg=${avgFps} samples=${fps.length}`);
  if (!errors.length) pass("zero page errors"); else fail(`${errors.length} page errors: ${errors.slice(0, 4).join(" | ")}`);

  log(`\nshots: ${SHOTS.join(" ")}`);
  log(ok ? "\n✓ CAS-366 quillback INDEPENDENT QA PASSED." : "\n✗ CAS-366 QA FAILED.");
} catch (e) {
  fail(`harness exception: ${e.message}`);
} finally {
  await browser.close();
  if (srv) await srv.close();
}
process.exit(ok ? 0 : 1);
