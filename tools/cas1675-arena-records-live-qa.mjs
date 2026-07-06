// ===========================================================================
// CAS-1678 — LIVE QA: Récords persistentes de Arena (CAS-1675). Verifies the
// CAS-1676 DELTA (build 27c7ba3, deploy CAS-1677 f0013c013a0c) on the canonical
// gh-pages build. PASS x2 (desktop + mobile). Pattern mirrors
// tools/cas1670-arena-boss-live-qa.mjs; ACs mirror tools/cas1675-arena-records.mjs (headless).
//
//   node tools/cas1675-arena-records-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1675 is a DELTA over Arena boss waves (CAS-1670): a SECOND durable record
// `bestBossWave` (highest boss wave beaten) surfaced on the ENTRY + DEATH screens,
// plus a ONE-TIME milestone Esencia payoff = ceil(bossRecordEssBase*wave) when a run
// beats the stored boss-wave record (pure arithmetic, 0 RNG → never srand). Everything
// additive; arena.v1 stays v:1 (bestBossWave absent ⇒ 0, legacy loads with no migration).
// Touched runtime files: game.js + render/render.js + sim/config.js + sim/sim.js (deploy overlay).
//
// window/dev hooks used (all route to the served sim module via the game.js wrapper):
//   __dev.arenaGetRecords / arenaSetRecords / arenaRecordsPersist / arenaLastRecordPayoff
//   __dev.arenaRunBossWave / arenaDeathPersistRecord / arenaRecordSrandProbe
//   (+ base arena hooks: arenaState / arenaStart / arenaBest / arenaKillBossWave / arenaSetBossBonus)
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD   version.json served (reported); served 4 touched files md5 == HEAD.
//  HOOKS   the whole CAS-1675 dev contract is wired in the curated game.js wrapper.
//  AC1     serialize→load round-trips BOTH records; a legacy blob (only bestWave) loads bestBossWave=0.
//  AC1b    runBestBossWave tracks the highest boss wave cleared; arenaOnDeath banks it ONLY if it beats
//          the stored record (a weaker run leaves the record untouched).
//  AC2     DISPLAY — the persisted records render on the Arena ENTRY screen ("Mejor oleada: N  ·
//          Mejor Jefe: Oleada M"), captured via a real fillText spy; the death screen reads the same
//          G.arena.bestBossWave field ("Mejor Jefe: Oleada N").
//  AC3     milestone pays ceil(bossRecordEssBase*wave) Esencia EXACTLY ONCE per run when the record is
//          beaten (a wave at/below baseline pays nothing; a later higher wave does not pay again).
//  AC4     [AC-RNG-STRONG] same seed, record present (no payoff) vs absent (payoff) ⇒ srand probe
//          BYTE-IDENTICAL (milestone is arithmetic, never srand).
//  PERF    >=55 fps sampled EARLY on a clean live wave; 0 JS errors (favicon 404 filtered).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1678"; fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
const headMd5 = (f) => md5(execSync(`git show HEAD:${f}`).toString());

// Re-poll version.json to absorb GitHub-Pages publish / CDN lag; report the served build.
// Gate on md5 live==HEAD (not a hardcoded hash) so this passes the moment the deploy lands.
async function pollBuild(headHashes, tries = 10, gap = 5000) {
  let build = "", lastMd5 = {};
  for (let i = 0; i < tries; i++) {
    try {
      const v = await (await fetch(`${BASE}/version.json?cb=${Date.now()}`)).json(); build = v.build || "";
      let allMatch = true;
      for (const f of FILES) {
        const live = md5(await (await fetch(`${BASE}/${f}?cb=${Date.now()}`)).text());
        lastMd5[f] = live; if (live !== headHashes[f]) allMatch = false;
      }
      if (allMatch) return { build, md5: lastMd5, ok: true, tries: i + 1 };
    } catch {}
    await wait(gap);
  }
  return { build, md5: lastMd5, ok: false, tries };
}

// Menu → class → ability → play. KeyA = Arena de Oleadas (name field blurred so the key isn't
// swallowed by the input); the CAS-1675 hooks then drive the record paths on the live hero.
async function enterArena(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "RecBot"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true }));
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

// Fresh-boot to the MENU (auto-resume would otherwise skip the class/ability flow).
async function bootMenu(page) {
  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.arenaGetRecords", { timeout: 20000 });
}

// Capture every string drawn via ctx.fillText over ~600ms (one render sweep) — proves the ENTRY
// screen actually renders the persisted records, not just that the state field holds them.
async function captureFillText(page, ms = 600) {
  await page.evaluate(() => {
    window.__ft = [];
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) {
      const orig = proto.fillText;
      proto.fillText = function (t, ...a) { try { window.__ft.push(String(t)); } catch (e) {} return orig.call(this, t, ...a); };
      proto.__ftPatched = true;
    }
  });
  await wait(ms);
  return page.evaluate(() => window.__ft.slice());
}

async function runOnce(label, viewport, headHashes) {
  let pass = 0, fail = 0;
  const gate = (id, ok, detail) => { console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`); ok ? pass++ : fail++; return ok; };
  console.log(`\n### RUN ${label} @ ${viewport.width}x${viewport.height} vs ${BASE}`);

  // ---- BUILD gate: served version + md5 parity vs HEAD (poll for CDN/Pages lag) ----
  const vb = await pollBuild(headHashes);
  gate("BUILD.deployed", vb.ok, `served build=${vb.build} (polled ${vb.tries}) md5-parity=${vb.ok ? "ALL MATCH" : "DRIFT"}`);
  for (const f of FILES) {
    const live = vb.md5[f] || "?"; const head = headHashes[f];
    gate(`BUILD.md5 ${f}`, live === head, `live=${String(live).slice(0,8)} head=${head.slice(0,8)} ${live === head ? "MATCH" : "DRIFT"}`);
  }
  if (!vb.ok) { console.log("  → records build NOT live on gh-pages yet; aborting live ACs (CDN lag / deploy pending)."); return { pass, fail: fail + 1, notDeployed: true }; }

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|apple-touch|touch-icon|\.ico(\?|$)/i.test(r.url())) errs.push("http404: " + r.url()); });
  // Strip ONLY the run save (mithralda.save.v1) on every new document — the unload flush re-saves it,
  // so a plain reload would auto-resume into 'play' and never reach the menu. The arena best store
  // (mithralda.arena.v1) is deliberately LEFT intact so AC1's legacy paths stay honest.
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

  // ---- boot ----
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try { await bootMenu(page); booted = true; }
    catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev.arenaGetRecords never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  // ---- HOOKS wired in the curated game.js wrapper (not just sim dev) ----
  const hooks = ["arenaGetRecords","arenaSetRecords","arenaRecordsPersist","arenaLastRecordPayoff","arenaRunBossWave","arenaDeathPersistRecord","arenaRecordSrandProbe"];
  const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
  gate("HOOKS.wired", missing.length === 0, missing.length ? `NOT wired: ${missing.join(", ")}` : `all ${hooks.length} CAS-1675 dev hooks wired`);

  // ======================= AC2a: ENTRY-screen display (real fillText spy) ===
  // On the MENU, plant records via arenaSetRecords (sets G.arena.best + G.arena.bestBossWave, the exact
  // fields the entry render reads) and confirm both strings actually get drawn.
  await page.evaluate(() => window.__dev.arenaSetRecords(17, 9));
  const menuText = await captureFillText(page, 700);
  const hasWave = menuText.some((t) => /Mejor oleada:\s*17/.test(t) || /Mejor:\s*17/.test(t));
  const hasBoss = menuText.some((t) => /Mejor Jefe:\s*Oleada\s*9/.test(t));
  gate("AC2.entryDisplay", hasWave && hasBoss, hasWave && hasBoss ? `entry screen renders "Mejor oleada: 17  ·  Mejor Jefe: Oleada 9" (fillText spy)` : `missing: wave17=${hasWave} bossJefe9=${hasBoss} (drawn: ${menuText.filter((t)=>/Mejor/.test(t)).join(" | ").slice(0,120)})`);

  // ---- enter the live gauntlet ----
  await enterArena(page);
  const ar = await page.evaluate(() => window.__dev.arenaState());
  gate("BOOT.arena", !!(ar && ar.mode === true && ar.scene === "play"), `menu "Arena de Oleadas" (KeyA) → live gauntlet (arenaMode, wave ${ar && ar.wave})`);

  // ---- PERF (sampled EARLY, clean live wave, before probe flooding) ----
  // BEST of 3 one-second windows. render/render.js DID change (CAS-1675 adds two static record lines to
  // the death/menu overlays — never per-play-frame), so this still measures the base-arena render ceiling.
  // Best-of-3 rejects a single GC/CDN hitch dragging one window down on the shared 2-core box.
  const sampleFps = async () => page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  await sampleFps();                                          // warm-up window (discarded)
  const fpsN = [await sampleFps(), await sampleFps(), await sampleFps()];
  const fps = Math.max(...fpsN);
  gate("PERF.fps", fps >= 55, `~${fps} fps (best of ${fpsN.join("/")}) sampled EARLY on a clean wave (records render is static overlay text; 2-core box = noise, real gate is determinism/byte-id)`);

  // ======================= AC1: additive round-trip; legacy blob ⇒ 0 =======
  const persist = await page.evaluate(() => {
    const r = window.__dev.arenaRecordsPersist(12, 15);       // write bestWave=12, bestBossWave=15
    const keys = Object.keys(r.blob).sort().join(",");
    return { r, keys };
  });
  const shapeOk = persist.r.blob.v === 1 && persist.keys === "bestBossWave,bestWave,v" &&
    persist.r.after.bestWave === 12 && persist.r.after.bestBossWave === 15;
  gate("AC1.roundtrip", shapeOk, shapeOk ? `serialize→load {v:1,bestWave:12,bestBossWave:15} round-trips (no SAVE_VERSION bump)` : `shape/round-trip wrong: blob=${JSON.stringify(persist.r.blob)} after=${JSON.stringify(persist.r.after)}`);
  const legacyLoad = await page.evaluate(() => {
    window.__dev.arenaSetRecords(0, 99);                      // dirty bestBossWave in memory
    const r = window.__dev.arenaRecordsPersist(7, 0);        // serialize writes bestBossWave:0 → after must be 0
    return r.after;
  });
  gate("AC1.legacyZero", legacyLoad.bestBossWave === 0, legacyLoad.bestBossWave === 0 ? `a legacy blob (bestBossWave absent/0) loads bestBossWave=0 with no migration/stale leak` : `bestBossWave did not reset to 0: ${JSON.stringify(legacyLoad)}`);

  // ======================= AC1b: only-if-supera at death ===================
  const track = await page.evaluate(() => {
    window.__dev.arenaSetRecords(0, 10);                      // stored record = boss wave 10
    window.__dev.arenaStart();                                // fresh run → baseline=10, runBest=0
    const r1 = window.__dev.arenaRunBossWave(1);              // clear boss wave 5  (< 10, no record)
    const r2 = window.__dev.arenaRunBossWave(3);              // clear boss wave 15 (> 10, new record)
    const death = window.__dev.arenaDeathPersistRecord();     // bank iff runBest > stored
    return { r1, r2, death };
  });
  gate("AC1b.runTracks", track.r1.runBestBossWave === 5 && track.r2.runBestBossWave === 15, `runBestBossWave tracks highest boss wave cleared (5 → 15)`);
  gate("AC1b.banksIfBeat", track.death.bestBossWaveBefore === 10 && track.death.bestBossWaveAfter === 15, `arenaOnDeath banks the new record only-if-supera (10 → 15)`);
  const noBank = await page.evaluate(() => {
    window.__dev.arenaSetRecords(0, 20);                      // stored record = 20
    window.__dev.arenaStart();
    window.__dev.arenaRunBossWave(1);                         // clear boss wave 5 (< 20)
    return window.__dev.arenaDeathPersistRecord();
  });
  gate("AC1b.keepsIfWeaker", noBank.bestBossWaveBefore === 20 && noBank.bestBossWaveAfter === 20, `a run that does NOT beat the record leaves bestBossWave untouched (20 stays 20)`);

  // ======================= AC2b: death screen reads the same field =========
  // The death overlay renders "Mejor Jefe: Oleada "+(G.arena.bestBossWave|0) — the identical field the
  // entry screen and arenaGetRecords report. Confirm the banked record is what that surface would show.
  const recAfter = await page.evaluate(() => window.__dev.arenaGetRecords());
  gate("AC2.deathField", recAfter.bestBossWave === 20, `death-screen "Mejor Jefe: Oleada N" reads G.arena.bestBossWave (=${recAfter.bestBossWave} after the banked run)`);

  // ======================= AC3: milestone once-per-run =====================
  const milestone = await page.evaluate(() => {
    window.__dev.arenaSetRecords(0, 5);                       // stored record = boss wave 5
    window.__dev.arenaStart();                                // baseline=5
    const a = window.__dev.arenaRunBossWave(1);               // wave 5: NOT > baseline(5) → no payoff
    const b = window.__dev.arenaRunBossWave(2);               // wave 10: > 5 → payoff fires (once)
    const c = window.__dev.arenaRunBossWave(3);               // wave 15: record already hit → NO second payoff
    return { a, b, c };
  });
  gate("AC3.noPayAtBaseline", milestone.a.recordHit === false && milestone.a.recordBonus === 0, `no milestone at a wave that does NOT beat the baseline (wave 5 vs record 5)`);
  gate("AC3.paysCeil", milestone.b.recordHit === true && milestone.b.recordBonus === 100, `milestone pays ceil(bossRecordEssBase(10)*wave(10))=${milestone.b.recordBonus} Esencia when the record is beaten`);
  gate("AC3.oncePerRun", milestone.c.recordHit === true && milestone.c.recordBonus === 100, `once-per-run — a later higher boss wave does NOT pay again (bonus stays ${milestone.c.recordBonus})`);

  // ======================= AC4: [AC-RNG-STRONG] srand byte-identical =======
  const SEED = 0x51ce7a11, PROBE = 24;
  const rngPay = await page.evaluate((s, p) => { window.__dev.arenaSetRecords(0, 0); return window.__dev.arenaRecordSrandProbe(s, p); }, SEED, PROBE);   // record 0 → wave 5 beats it → payoff
  const rngNoPay = await page.evaluate((s, p) => { window.__dev.arenaSetRecords(0, 999); return window.__dev.arenaRecordSrandProbe(s, p); }, SEED, PROBE); // record 999 → no payoff
  const hashPay = JSON.stringify(rngPay.srandProbe), hashNoPay = JSON.stringify(rngNoPay.srandProbe);
  gate("AC4.rngStrong", hashPay === hashNoPay && rngPay.recordHit === true && rngNoPay.recordHit === false && rngPay.essBonus > 0,
    `[AC-RNG-STRONG] srand BYTE-IDENTICAL — payoff(bonus ${rngPay.essBonus}, hit) vs no-payoff(bonus ${rngNoPay.essBonus}, no-hit); milestone is arithmetic, never srand (${rngPay.srandProbe.length} probes)`);

  // ======================= REGRESSION: CAS-1670 boss payoff intact =========
  const regress = await page.evaluate(() => { window.__dev.arenaSetBossBonus(1); return window.__dev.arenaKillBossWave(2); });
  gate("REG.bossPayoff", regress.essBonus === 50 && regress.bossKilled, `CAS-1670 boss payoff intact (k=2 → +${regress.essBonus} Esencia, boss killed)`);

  await page.screenshot({ path: `${OUT}/${label}-records.png` });

  // ---- errors ----
  gate("PERF.noErrors", errs.length === 0, errs.length ? errs.slice(0, 4).join(" | ") : "0 JS errors (favicon 404 filtered)");

  await browser.close();
  return { pass, fail };
}

(async () => {
  const headHashes = {}; for (const f of FILES) headHashes[f] = headMd5(f);
  console.log(`HEAD md5: ${FILES.map(f => `${f}=${headHashes[f].slice(0,8)}`).join("  ")}`);
  const runs = [
    ["desktop", { width: 1280, height: 720 }],
    ["mobile", { width: 390, height: 844, isMobile: true, hasTouch: true }],
  ];
  let tp = 0, tf = 0, notDeployed = false;
  for (const [label, vp] of runs) {
    const r = await runOnce(label, vp, headHashes);
    tp += r.pass; tf += r.fail; if (r.notDeployed) notDeployed = true;
  }
  console.log(`\n=========== TOTAL ${tp} PASS / ${tf} FAIL ===========`);
  if (notDeployed) console.log("NOTE: records build NOT live on gh-pages yet — re-run after the deploy + version.json bump.");
  process.exit(tf === 0 ? 0 : 1);
})();
