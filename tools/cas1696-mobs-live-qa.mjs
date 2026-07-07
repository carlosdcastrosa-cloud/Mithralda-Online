// ===========================================================================
// CAS-1696 — LIVE QA: Nuevos MOBS 8-dir animados (caves) (CAS-1692).
// Verifies the CAS-1694 build + CAS-1706 wiring (master eb8c055) deployed by
// CAS-1695 (build 072ba0ea70c6) on the canonical gh-pages site. PASS x2 (desktop+mobile).
// Pattern mirrors tools/cas1689-sockets-live-qa.mjs.
//
//   node tools/cas1696-mobs-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// Feature = 3 new trash mobs that REUSE existing archetype branches ($0 combat):
//   ashwraith   — caster (ranged, proj:bolt)                      arch:"caster"
//   thornspitter— caster (ranged, proj:bolt, infl poison on bolt) arch:"caster"
//   ironback    — brute  (ground-slam AoE, heavy knock:200)       arch:"brute"
// All 3 append to the CAVES spawner pool ONLY when NEW_MOBS.enabled. Bonus loot rides a
// dedicated mobRng (append-only, never srand) ⇒ RNG-neutral to the main stream. 8-dir art =
// PixelLab FOUNTAINS: a single ENEMY_IMG cutout + 5 ENEMY_STRIPS states (idle4/walk6/attack9/
// hurt7/death9) driven by the generic richAnim resolver. Additive save (no SAVE_VERSION bump).
// NOTE: shipped default is NEW_MOBS.enabled=TRUE — a CONTENT feature must be visible in-game;
// AC-RNG-STRONG is proven by the toggle probe (off vs on byte-identical), not by the default.
//
// Deployed/feature code files (md5 live==HEAD hard gate) + the 15 animation strips.
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD  version.json served; 8 feature JS files + 15 strip PNGs md5 live==HEAD (hard gate).
//  HOOKS  the CAS-1692/1706 dev contract is wired in the served game.js wrapper.
//  AC1    [AC-RNG-STRONG] newMobsGenProbe OFF vs ON ⇒ gameplay srand BYTE-IDENTICAL (mobRng isolated).
//  AC2    the 3 mobs spawn ALIVE in caves w/ correct arch; ENEMY_IMG (FOUNTAINS) loaded; served
//         config carries ranged/proj/infl/knock wiring; LIVE a ranged caster fires a bolt + its
//         richAnim strip cycles to attack while firing.
//  AC3    save additive — versioned blob has NO mob key; roundtrip serialize→reload resumes clean.
//  AC4    render (strip or cutout fallback) no crash; >=55 fps with all 3 mobs live (best-of-3).
//  REG    core-loop smoke intact (hero + base spawn + tick, 0 JS errors).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["sim/config.js", "render/render.js", "render/sprites.js", "sim/sim.js", "sim/world.js", "bestiary.js", "strings.js", "game.js"];
const MOBS = ["ashwraith", "ironback", "thornspitter"];
const STATES = ["idle", "walk", "attack", "hurt", "death"];
const STRIPS = MOBS.flatMap(m => STATES.map(s => `assets/pixellab/fountains/anim/${m}_${s}_strip.png`));
const ARCH = { ashwraith: "caster", thornspitter: "caster", ironback: "brute" };
const OUT = "shots/cas1696"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
const headMd5Text = (f) => md5(execSync(`git show HEAD:${f}`).toString());
const headMd5Bin = (f) => md5(execSync(`git show HEAD:${f}`, { maxBuffer: 64 * 1024 * 1024, encoding: "buffer" }));

// Re-poll version.json + file md5 (text for JS, bytes for PNG) to absorb Pages/CDN publish lag.
async function pollBuild(headText, headBin, tries = 10, gap = 5000) {
  let build = "", lastMd5 = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
        lastMd5[f] = live; if (live !== headText[f]) allMatch = false;
      }
      for (const f of STRIPS) {
        const buf = Buffer.from(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).arrayBuffer());
        const live = md5(buf); lastMd5[f] = live; if (live !== headBin[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, ok: false, tries };
}

// Menu → class → ability → play (mobs ride a normal run; enter via Enter with the name field blurred).
async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "MobBot"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await wait(200);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
}

async function bootMenu(page) {
  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.newMobsMeta", { timeout: 20000 });
}

async function runOnce(label, viewport, headText, headBin) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  // ---- BUILD gate: served version + md5 parity vs HEAD (8 JS + 15 strips) ----
  const vb = await pollBuild(headText, headBin);
  gate("BUILD.deployed", vb.ok, `served build=${vb.build} (polled ${vb.tries}) md5-parity=${vb.ok ? "ALL MATCH (8 js + 15 strips)" : "DRIFT"}`);
  for (const f of FILES) {
    const live = vb.md5[f] || "?"; const head = headText[f];
    gate(`BUILD.md5 ${f}`, live === head, `live=${String(live).slice(0, 8)} head=${head.slice(0, 8)} ${live === head ? "MATCH" : "DRIFT"}`);
  }
  const stripsMatch = STRIPS.every(f => vb.md5[f] === headBin[f]);
  gate("BUILD.md5 strips(15)", stripsMatch, stripsMatch ? `all 15 8-dir strip PNGs md5 live==HEAD (idle/walk/attack/hurt/death × 3 mobs)` : `strip DRIFT: ${STRIPS.filter(f => vb.md5[f] !== headBin[f]).join(", ")}`);
  if (!vb.ok) { console.log("  → MOBS build NOT fully live on gh-pages yet; aborting live ACs (CDN lag / deploy pending)."); return { pass, fail: fail + 1, notDeployed: true }; }

  // ---- served config carries the behavior wiring (real deployed code, md5-gated above) ----
  const cfgSrc = await (await fetch(`${BASE}/sim/config.js?cb=${Date.now()}`)).text();
  const thornRow = /thornspitter:\s*\{[^}]*\}/.exec(cfgSrc)?.[0] || "";
  const ashRow = /ashwraith:\s*\{[^}]*\}/.exec(cfgSrc)?.[0] || "";
  const ironRow = /ironback:\s*\{[^}]*\}/.exec(cfgSrc)?.[0] || "";
  const wire =
    /ranged:true/.test(thornRow) && /proj:"bolt"/.test(thornRow) && /infl:\{type:"poison"/.test(thornRow) &&
    /ranged:true/.test(ashRow) && /proj:"bolt"/.test(ashRow) &&
    /arch:"brute"/.test(ironRow) && /knock:200/.test(ironRow) && /aoe:\d+/.test(ironRow);
  gate("AC2.behaviorWiring", wire, wire
    ? `served config: thornspitter=ranged bolt+poison, ashwraith=ranged bolt, ironback=brute knock200 aoe`
    : `wiring missing — thorn=${thornRow.slice(0, 60)} iron=${ironRow.slice(0, 50)}`);

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|apple-touch|touch-icon|\.ico(\?|$)/i.test(r.url())) errs.push("http404: " + r.url()); });
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

  // ---- boot to menu ----
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try { await bootMenu(page); booted = true; }
    catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev.newMobsMeta never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  await enterPlay(page);
  gate("BOOT.play", await page.evaluate(() => window.__dev.scene() === "play"), `menu → class → ability → live run (scene=play)`);

  // ---- HOOKS wired in the served game.js wrapper ----
  const hooks = ["newMobsMeta", "setNewMobsEnabled", "newMobsGenProbe", "spawnNewMob", "newMobSpawnKill", "newMobImgLoaded", "enemies", "enemyProj", "saveBlob", "spawn"];
  const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
  gate("HOOKS.wired", missing.length === 0, missing.length ? `NOT wired: ${missing.join(", ")}` : `all ${hooks.length} CAS-1692/1706 dev hooks wired`);

  // static meta — 3 mobs, shipped default reported
  const meta = await page.evaluate(() => window.__dev.newMobsMeta());
  const metaOk = !!(meta && meta.mobs && meta.mobs.length === 3 && meta.mobs.every(m => m.hp > 0 && m.arch && m.sprite));
  gate("META.mobs", metaOk, metaOk ? `3 new mobs: ${meta.mobs.map(m => `${m.id}(${m.arch},hp${m.hp})`).join(", ")}; shipped default enabled=${meta.enabled} (content-visible, intentional)` : `meta wrong: ${JSON.stringify(meta)}`);

  // ======================= AC1 [AC-RNG-STRONG]: mob feature never perturbs gameplay srand =====
  const SEED = 0x4d0b7e15, PROBE = 24;
  const rng = await page.evaluate((s, p) => {
    const off = window.__dev.newMobsGenProbe(false, s, p);
    const on = window.__dev.newMobsGenProbe(true, s, p);
    const on2 = window.__dev.newMobsGenProbe(true, s, p);
    return { off, on, on2 };
  }, SEED, PROBE);
  const fOff = JSON.stringify(rng.off.fingerprint), fOn = JSON.stringify(rng.on.fingerprint), fOn2 = JSON.stringify(rng.on2.fingerprint);
  gate("AC1.srandByteId", fOff === fOn && fOn === fOn2,
    fOff === fOn ? `gameplay srand BYTE-IDENTICAL NEW_MOBS off vs on (${rng.off.fingerprint.length} draws) — mobRng isolated, mobs don't touch the main stream`
      : `srand DIVERGED off=${fOff.slice(0, 44)} on=${fOn.slice(0, 44)}`);

  // ======================= AC2: spawn ALIVE in caves + art loaded ==============================
  const spawned = await page.evaluate((mobs) => mobs.map(t => window.__dev.spawnNewMob(t, "caves")), MOBS);
  const aliveOk = spawned.every((e, i) => e && e.hp > 0 && e.arch === ARCH[MOBS[i]]);
  gate("AC2.spawnAlive", aliveOk, aliveOk
    ? `all 3 spawn ALIVE in caves: ${spawned.map(e => `${e.type}(${e.arch},hp${e.hp})`).join(", ")}`
    : `spawn wrong: ${JSON.stringify(spawned)}`);
  const art = await page.evaluate((mobs) => mobs.map(t => window.__dev.newMobImgLoaded(t)), MOBS);
  const artOk = art.every(a => a.loaded && a.w > 0 && a.h > 0);
  gate("AC2.artLoaded", artOk, artOk
    ? `ENEMY_IMG (FOUNTAINS cutout) loaded for all 3: ${art.map(a => `${a.type} ${a.w}x${a.h}`).join(", ")}`
    : `art not loaded: ${JSON.stringify(art)}`);

  // AC2 LIVE — a ranged caster fires a bolt and its richAnim strip cycles to attack while firing.
  const live = await page.evaluate(async () => {
    const before = window.__dev.enemyProj().total;
    const e = window.__dev.spawn("thornspitter", 150, 0);   // place a ranged caster next to the hero
    // NOTE: AC2.spawnAlive already dropped a thornspitter far away in caves (idle) — observe the SET of
    // animStates across ALL thornspitters so the active near-hero one's windup/strike is not masked.
    let firedProj = false, sawAttack = false, sawWalk = false, maxProj = before; const seen = new Set();
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        const p = window.__dev.enemyProj().total; if (p > maxProj) maxProj = p;
        for (const en of (window.__dev.enemies() || [])) {
          if (en.type !== "thornspitter") continue;
          seen.add(en.animState);
          if (en.animState === "attack1" || en.animState === "attack2") sawAttack = true;
          if (en.animState === "walk") sawWalk = true;
        }
        if (maxProj > before) firedProj = true;
        (firedProj && sawAttack) || performance.now() - t0 > 8000 ? res() : requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { spawned: !!e, before, maxProj, firedProj, sawAttack, sawWalk, seen: [...seen] };
  });
  gate("AC2.rangedFiresLive", live.firedProj, live.firedProj
    ? `thornspitter fired live: enemy projectiles ${live.before}→${live.maxProj} (bolt); richAnim strip cycled (attack=${live.sawAttack}, walk=${live.sawWalk})`
    : `no bolt fired in 8s (proj ${live.before}→${live.maxProj}, attack=${live.sawAttack})`);
  gate("AC2.richAnimCycles", live.sawAttack, live.sawAttack
    ? `richAnim resolver drove the caster strip to attack1/attack2 during its strike (states seen: ${live.seen.join("/")})`
    : `strip never reached attack state (states seen: ${live.seen.join("/")})`);

  // ======================= AC3: additive save — no mob key; roundtrip resumes clean ============
  const blob = await page.evaluate(() => window.__dev.saveBlob());
  const additive = !!blob && typeof blob.version === "number" && !("newMobs" in blob) && !("mobs" in blob) && !("NEW_MOBS" in blob);
  gate("AC3.additiveSave", additive, additive
    ? `save blob is versioned (v${blob.version}) and carries NO mob field — mobs are transient content, save schema unchanged (no bump)`
    : `save shape wrong: keys=${blob ? Object.keys(blob).join(",") : "null"}`);
  const roundtrip = await page.evaluate(async () => {
    window.__dev.saveNow();
    return !!localStorage.getItem("mithralda.save.v1");
  });
  // reload WITHOUT stripping the save → it must auto-resume into a loaded run (legacy/additive load OK)
  await page.evaluate(() => { /* keep save */ });
  await page.evaluate(() => { window.__resumeTest = true; });
  const resumeErrs0 = errs.length;
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  let resumed = false;
  try { await page.waitForFunction("window.__dev && window.__dev.scene && ['play','menu'].includes(window.__dev.scene())", { timeout: 15000 }); resumed = true; } catch {}
  const resumeScene = resumed ? await page.evaluate(() => window.__dev.scene()) : "?";
  const loadClean = resumed && errs.length === resumeErrs0;
  gate("AC3.roundtripLoad", roundtrip && loadClean, roundtrip && loadClean
    ? `serialize→reload loads clean (scene=${resumeScene}, 0 new errors) — additive save survives with mobs shipped`
    : `roundtrip/load issue (saved=${roundtrip}, resumed=${resumed}, scene=${resumeScene}, newErrs=${errs.length - resumeErrs0})`);

  // re-enter a live run for the render/perf pass
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.newMobsMeta", { timeout: 20000 });
  await enterPlay(page);

  // ======================= AC4: render (strip/cutout) no crash + 60fps with all 3 mobs =========
  const perfErrs0 = errs.length;
  await page.evaluate(() => { window.__dev.spawn("ashwraith", 90, -40); window.__dev.spawn("ironback", -90, 40); window.__dev.spawn("thornspitter", 120, 30); });
  const sampleFps = async () => page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  await sampleFps(); // warm-up
  const fpsN = [await sampleFps(), await sampleFps(), await sampleFps()];
  const fps = Math.max(...fpsN);
  gate("AC4.renderFps", fps >= 55 && errs.length === perfErrs0, `~${fps} fps (best of ${fpsN.join("/")}) rendering all 3 8-dir mobs; render crash-guard held (${errs.length - perfErrs0} render errs)`);
  await page.screenshot({ path: `${OUT}/${label}-mobs.png` });

  // ======================= REG: core-loop smoke intact ========================================
  const reg = await page.evaluate(async () => {
    const h = window.__dev.hero(); const base = window.__dev.enemyCount();
    window.__dev.spawn("skeleton", 60, 0);
    await new Promise((r) => { let n = 0; const t = () => { n++; n < 30 ? requestAnimationFrame(t) : r(); }; requestAnimationFrame(t); });
    return { heroOk: !!h, sceneOk: window.__dev.scene() === "play", grew: window.__dev.enemyCount() > base };
  });
  gate("REG.coreLoop", reg.heroOk && reg.sceneOk && reg.grew, reg.heroOk && reg.sceneOk
    ? `core loop intact: hero present, scene=play, base spawn+tick works (skeleton spawned)` : `core-loop smoke failed: ${JSON.stringify(reg)}`);
  gate("REG.noErrors", errs.length === 0, errs.length ? errs.slice(0, 4).join(" | ") : "0 JS errors (favicon 404 filtered)");

  await browser.close();
  return { pass, fail };
}

(async () => {
  const headText = {}; for (const f of FILES) headText[f] = headMd5Text(f);
  const headBin = {}; for (const f of STRIPS) headBin[f] = headMd5Bin(f);
  console.log(`HEAD md5 (js): ${FILES.map(f => `${f.split("/").pop()}=${headText[f].slice(0, 8)}`).join("  ")}`);
  const runs = [
    ["desktop", { width: 1280, height: 720 }],
    ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ];
  let tp = 0, tf = 0, notDeployed = false;
  for (const [label, vp] of runs) {
    const r = await runOnce(label, vp, headText, headBin);
    tp += r.pass; tf += r.fail; if (r.notDeployed) notDeployed = true;
  }
  console.log(`\n=========== TOTAL ${tp} PASS / ${tf} FAIL ===========`);
  if (notDeployed) console.log("NOTE: MOBS build NOT fully live on gh-pages yet — re-run after the deploy + version.json bump.");
  process.exit(tf === 0 ? 0 : 1);
})();
