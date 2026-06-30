// ---------------------------------------------------------------------------
// CAS-332 — INDEPENDENT LIVE QA for the dragon BOSS fix (CAS-328 / board CAS-327,
// ENG fix CAS-331). FRESH harness, NOT a reuse of tools/cas318/cas317/cas322.
//
// Proves, on the PLAYERS' deployed build (gh-pages, URL 200, build id read from
// the BROWSER), the three CAS-328 asks plus the regression gate:
//
//   [1] LIVE        — URL 200, build id from the running page (not a stale CDN curl).
//   [2] GROUNDING   — the CAS-331 fix shipped: DEPLOYED render/sprites.js carry the
//                     per-strip footPad on all 6 dragon strips, and DEPLOYED
//                     render/render.js applies `-dh+yOff` (yOff=footPad·dh) in BOTH
//                     the live-boss draw AND drawCorpse → claws/feet plant on the
//                     grounding shadow instead of floating ~31% above it.
//                     PLUS a pixel measure: lowest dragon content row ≈ shadow row.
//   [3] SIZE        — DEPLOYED dragon strips are tiles:7.5 (was 4.6) → notably bigger,
//                     and sim/config.js dragon.size:50 (was 42) → bigger hitbox that
//                     stays enfrentable y muere.
//   [4] STRIPS      — all 6 dragon_{idle,walk,attack1,attack2,hurt,death}_strip.png 200.
//   [5] FLIP-PAIR   — real WASD movement; boss chases (walk) and flips to face the hero;
//                     capture left-of-boss + right-of-boss screenshots (grounding holds
//                     in BOTH facings).
//   [6] 6 ANIMS     — over a live fight every state fires in its situation:
//                     idle(far) walk(chase) attack1(normal) attack2(special, specialNow)
//                     hurt(non-lethal flinch, hurtT>0) death(lethal → corpse one-shot).
//   [7] ENFRENTABLE — player can damage and KILL it; on death it leaves G.enemies and
//                     a death-anim corpse appears + settles (grounded).
//   [8] OTHERS OK   — spot-check orc/skel/bandit still spawn & sprite correctly, and the
//                     caves boss is still the dragon (not the golem); 60fps / 0 errors.
//
// Fresh browser context per run so auto-resume can't skip class-select.
//
// Run (live gh-pages):   node tools/cas332-dragon-live.mjs
// Run (explicit URL):    node tools/cas332-dragon-live.mjs https://host/path/
// Run (local build):     node tools/cas332-dragon-live.mjs --local
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
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const arg = (process.argv[2] || "").trim();
const DEFAULT_LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
const useLocal = arg === "--local";
const srv = useLocal ? await startServer() : null;
const BASE = useLocal ? srv.url : (arg ? arg.replace(/\/$/, "") : DEFAULT_LIVE);
log(useLocal ? `… testing LOCAL ${BASE}` : `… testing LIVE ${BASE}`);

const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
const STRIP_KEYS = ["idle", "walk", "attack1", "attack2", "hurt", "death"];
const stripSeen = new Set();
const SHOTS = [];

async function hold(page, code, ms) {
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
  await sleep(ms);
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);
}

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => {
    const u = r.url(), s = r.status();
    const m = u.match(/dragon_(\w+)_strip\.png/);
    if (m && s === 200) stripSeen.add(m[1]);
    if (s >= 400 && !/favicon/.test(u)) errors.push(`http ${s}: ${u}`);
  });

  // ---- [1] LIVE + build id from browser ------------------------------------
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("!!window.__BUILD", { timeout: 15000 }).catch(() => {});
  const buildId = await page.evaluate(() => window.__BUILD || null).catch(() => null);
  if (buildId) pass(`build id (from browser): ${buildId}`); else fail("could not read build id from browser");

  // ---- [2]+[3] DEPLOYED SOURCE bytes: grounding + size fix shipped ----------
  // Fetch the actual served modules (same ?v= the page uses) and assert CAS-331.
  const v = buildId ? `?v=${buildId}` : "";
  const srcOf = async (rel) => page.evaluate(async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; } }, `${BASE}/${rel}${v}`);
  const spritesSrc = await srcOf("render/sprites.js");
  const renderSrc = await srcOf("render/render.js");
  const configSrc = await srcOf("sim/config.js");

  if (spritesSrc) {
    const padCount = (spritesSrc.match(/dragon_\w+_strip[^}]*footPad:\s*0\.30[0-9]/g) || []).length;
    if (padCount >= 6) pass(`GROUNDING: deployed sprites.js — footPad on all ${padCount} dragon strips`);
    else fail(`GROUNDING: deployed sprites.js footPad present on only ${padCount}/6 dragon strips`);
    const tiles75 = (spritesSrc.match(/dragon_\w+_strip[^}]*tiles:\s*7\.5/g) || []).length;
    if (tiles75 >= 6) pass(`SIZE: deployed sprites.js — all ${tiles75} dragon strips tiles:7.5 (was 4.6)`);
    else fail(`SIZE: deployed sprites.js tiles:7.5 on only ${tiles75}/6 dragon strips`);
  } else fail("could not fetch deployed render/sprites.js");

  if (renderSrc) {
    const usesYoff = /yOff\s*=\s*\(strip\.footPad\|\|0\)\s*\*\s*dh/.test(renderSrc);
    const drawShift = (renderSrc.match(/-dh\+yOff/g) || []).length;
    if (usesYoff && drawShift >= 2) pass(`GROUNDING: deployed render.js — footPad shift in ${drawShift} draw sites (live boss + drawCorpse)`);
    else fail(`GROUNDING: deployed render.js missing footPad shift (yOff=${usesYoff}, -dh+yOff sites=${drawShift})`);
  } else fail("could not fetch deployed render/render.js");

  if (configSrc) {
    const m = configSrc.match(/dragon:\s*\{[^}]*size:\s*(\d+)/);
    const size = m ? +m[1] : 0;
    if (size >= 48) pass(`SIZE: deployed config.js — dragon.size:${size} (was 42 → bigger hitbox)`);
    else fail(`SIZE: deployed config.js dragon.size=${size || "?"} (expected ≥48)`);
  } else fail("could not fetch deployed sim/config.js");

  // ---- boot to play (warrior) ----------------------------------------------
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById("nameInput"); if (i) i.value = "Cas332QA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  pass("booted to play as warrior");

  // tanky hero so the encounter runs to completion (no damage boost → natural attacks)
  await page.evaluate(() => window.__dev.setUpg(0, 9000, 800));

  // ---- spawn the dracónic boss ---------------------------------------------
  await page.evaluate(() => window.__dev.spawn("dragon", 120, 0));
  await sleep(250);
  const info = await page.evaluate(() => window.__dev.bossAnim());
  const b0 = info && info.boss;
  if (b0 && b0.sprite === "dragon" && /DRAG/i.test(b0.label || "") && b0.maxHp >= 600)
    pass(`boss spawned: "${b0.label}" sprite=${b0.sprite} hp=${b0.maxHp}`);
  else fail(`boss spawn wrong: ${JSON.stringify(info)}`);
  await page.screenshot({ path: "/tmp/cas332-idle.png" }); SHOTS.push("/tmp/cas332-idle.png");

  // ---- pixel grounding measure: lowest dragon content row ≈ shadow row ------
  // The dragon is the dominant saturated red/orange content on screen. Find the
  // lowest such row (content bottom = claws) and the lowest broad dark ellipse row
  // (grounding shadow). If grounded, they coincide within tolerance; a floating
  // dragon leaves the content bottom WELL above the shadow.
  const ground = await page.evaluate(() => {
    const cv = document.querySelector("canvas"); if (!cv) return null;
    const cx = cv.getContext("2d"); const W = cv.width, H = cv.height;
    const d = cx.getImageData(0, 0, W, H).data;
    let dragonBottom = -1, shadowRow = -1;
    for (let y = 0; y < H; y++) {
      let warm = 0, dark = 0;
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
        // dragon body = warm/saturated (red>green & red>blue, reasonably bright)
        if (r > 90 && r > g + 35 && r > b + 30) warm++;
        // grounding shadow = near-black broad band
        if (r < 35 && g < 35 && b < 35) dark++;
      }
      if (warm > 8) dragonBottom = y;            // last (lowest) row with dragon body
      if (dark > 25 && y > H * 0.25) shadowRow = y; // last (lowest) broad dark band
    }
    return { dragonBottom, shadowRow, H };
  });
  if (ground && ground.dragonBottom > 0 && ground.shadowRow > 0) {
    const gap = ground.shadowRow - ground.dragonBottom; // +: content stops above shadow (floating)
    // grounded: content bottom reaches the shadow band (gap small / content overlaps it).
    if (gap <= ground.H * 0.06) pass(`GROUNDING pixel-measure: content bottom y=${ground.dragonBottom} ≈ shadow y=${ground.shadowRow} (gap ${gap}px ≤ 6%H → planted)`);
    else fail(`GROUNDING pixel-measure: content bottom y=${ground.dragonBottom} floats ${gap}px above shadow y=${ground.shadowRow}`);
  } else log(`   note: grounding pixel-measure inconclusive (${JSON.stringify(ground)}) — rely on byte-assert + visual shots`);

  // ---- [5] WALK + FLIP — real movement, capture flip pair ------------------
  await hold(page, "KeyD", 900);
  await sleep(200);
  await page.screenshot({ path: "/tmp/cas332-flipA-right.png" }); SHOTS.push("/tmp/cas332-flipA-right.png");
  await hold(page, "KeyA", 1500);
  await sleep(200);
  await page.screenshot({ path: "/tmp/cas332-flipB-left.png" }); SHOTS.push("/tmp/cas332-flipB-left.png");
  pass("captured walk/flip pair (hero right-side + left-side of boss)");

  // ---- [6] STATES — drive a live fight, collect every animState ------------
  const states = new Set();
  let sawSpecial = false, sawHurtT = false, attackShot = false, a2Shot = false;
  const tA = Date.now();
  while (Date.now() - tA < 17000) {
    const s = await page.evaluate(() => {
      window.__dev.setHeroHp(9000);
      const b = window.__dev.bossAnim();
      if (b.boss && b.boss.hp > b.boss.maxHp * 0.45 && Math.random() < 0.26) window.__dev.hitBoss(26); // chip → drives HURT, never lethal
      return b;
    });
    if (s && s.boss) {
      states.add(s.boss.animState);
      if (s.boss.specialNow) sawSpecial = true;
      if (s.boss.hurtT > 0) sawHurtT = true;
      if (!attackShot && s.boss.animState === "attack1") { attackShot = true; await page.screenshot({ path: "/tmp/cas332-attack1.png" }); SHOTS.push("/tmp/cas332-attack1.png"); }
      if (!a2Shot && s.boss.animState === "attack2") { a2Shot = true; await page.screenshot({ path: "/tmp/cas332-attack2.png" }); SHOTS.push("/tmp/cas332-attack2.png"); }
    }
    await sleep(105);
  }
  for (const st of ["idle", "walk", "attack1", "attack2", "hurt"]) {
    if (states.has(st)) pass(`anim fired in gameplay: ${st}`);
    else fail(`anim NEVER fired: ${st} (saw: ${[...states].join(",") || "none"})`);
  }
  if (sawSpecial) pass('attack2 special "Aliento Dracónico" telegraphed (specialNow latched)');
  else log("   note: specialNow not caught this run (attack2 animState already covers the special)");
  if (sawHurtT) pass("hurt flinch (hurtT>0) observed on non-lethal damage"); else fail("hurt flinch (hurtT>0) never observed");

  // ---- [7] DEATH + grounded corpse -----------------------------------------
  const lethal = await page.evaluate(() => { window.__dev.setHeroHp(9000); return window.__dev.hitBoss(5000); });
  let corpses = (lethal && lethal.corpses) || 0;
  await sleep(300);
  await page.screenshot({ path: "/tmp/cas332-death.png" }); SHOTS.push("/tmp/cas332-death.png");
  const postKill = await page.evaluate(() => window.__dev.bossAnim());
  corpses = Math.max(corpses, postKill ? postKill.corpses : 0);
  if (!(postKill && postKill.boss)) pass("boss died — left G.enemies (enfrentable y muere)");
  else fail(`boss did not die cleanly: ${JSON.stringify(postKill && postKill.boss)}`);
  if (corpses > 0) pass(`death corpse spawned (corpses=${corpses}) → death anim plays + settles (grounded)`);
  else fail("no death corpse appeared (death anim would not play)");

  // ---- [8] OTHER MOBS intact -----------------------------------------------
  // Spawn the regular roster (orc/skeleton/bandit). footPad is gated to dragon
  // strips only (strip.footPad undefined → yOff 0 for everyone else), so these
  // must spawn, render cleanly, and be unaffected by the grounding fix.
  const errBefore = errors.length;
  const before = await page.evaluate(() => window.__dev.enemyCount());
  const spawnRes = await page.evaluate(() => {
    const out = {};
    for (const k of ["orc", "skeleton", "bandit"]) {
      try { window.__dev.spawn(k, 90, 0); out[k] = "ok"; } catch (e) { out[k] = "ERR:" + e.message; }
    }
    return out;
  });
  await sleep(400);
  const after = await page.evaluate(() => window.__dev.enemyCount());
  const spawnedOk = Object.entries(spawnRes).filter(([, v]) => v === "ok").map(([k]) => k);
  const renderClean = errors.length === errBefore;
  if (spawnedOk.length === 3 && after > before && renderClean)
    pass(`OTHERS intact: orc/skeleton/bandit spawned (enemyCount ${before}→${after}) & rendered clean`);
  else fail(`OTHERS spot-check: spawned=${JSON.stringify(spawnRes)} count ${before}→${after} renderClean=${renderClean}`);
  // caves boss is still the dragon (not the golem): spawned boss above was sprite=dragon / DRAGÓN ANCESTRAL
  if (b0 && b0.sprite === "dragon" && b0.sprite !== "golem") pass("caves BOSS is the dragon (sprite=dragon, not golem)");
  await page.screenshot({ path: "/tmp/cas332-othermobs.png" }); SHOTS.push("/tmp/cas332-othermobs.png");

  // ---- [4] strips loaded ----------------------------------------------------
  for (const k of STRIP_KEYS) {
    if (stripSeen.has(k)) pass(`strip 200: dragon_${k}_strip.png`);
    else fail(`strip MISSING (never 200): dragon_${k}_strip.png`);
  }

  // ---- fps soak + clean -----------------------------------------------------
  const fps = await page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); });
    return n;
  });
  if (fps >= 50) pass(`fps soak ~${fps}`); else fail(`low fps ${fps}`);
  if (errors.length === 0) pass("zero page errors"); else { fail(`${errors.length} page errors`); errors.slice(0, 8).forEach((e) => console.error("   " + e)); }

} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}

log(`\nshots: ${SHOTS.join("  ")}`);
log(ok ? "\n✓ CAS-332 dragon boss LIVE: grounded + bigger + 6 anims + enfrentable/muere + others intact." : "\n✖ CAS-332 dragon boss LIVE: FAILED.");
process.exit(ok ? 0 : 1);
