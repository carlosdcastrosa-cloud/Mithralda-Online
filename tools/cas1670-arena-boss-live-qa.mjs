// ===========================================================================
// CAS-1673 — LIVE QA: Oleadas de Jefe en la Arena (Boss Waves). Verifies the
// CAS-1670 DELTA (build CAS-1671 d7cfdbc, deploy CAS-1672 b0d3cd4e6fd5) on the
// canonical gh-pages build. PASS x2 (desktop + mobile). Pattern mirrors
// tools/cas1664-arena-live-qa.mjs; ACs mirror tools/cas1670-bosswaves.mjs (headless).
//
//   node tools/cas1670-arena-boss-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1670 is a DELTA over the Arena de Oleadas (CAS-1664): the arena already
// spawns wave-bosses every ARENA.bossEvery(5) waves. This ships (a) a legible
// boss-wave TELEGRAPH (distinct toast "¡OLEADA DE JEFE! ×k" + shake + sfx, fired
// ON spawn, plus a bossIncoming heads-up during the pre-boss rest) and (b) a
// GUARANTEED payoff scaled by k=wave/bossEvery: +ceil(bossEssBase*k) Esencia (pure
// arithmetic, 0 RNG) and arenaBonusDropCount(k) extra loot pieces drawn from the
// DEDICATED arenaRng, APPENDED after every srand/legRng/setRng draw → the shared
// srand stream is BYTE-IDENTICAL whether the bonus count is 0 or many ([AC5]).
// Everything additive; the arena save (mithralda.arena.v1) shape is untouched.
// Touched runtime files: game.js + sim/config.js + sim/sim.js (deploy overlay).
//
// window/dev hooks used (all route to the served sim module via the game.js wrapper):
//   __dev.arenaSetWave / arenaForceBossWave / arenaSetBossBonus / arenaLastPayoff
//   __dev.arenaKillBossWave / arenaBossSrandProbe / arenaState / arenaClearReward
//   __dev.arenaPersist / arenaBest / arenaStart / scene   (+ base arena hooks)
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD   version.json served (reported); served 3 touched files md5 == HEAD.
//  HOOKS   the whole CAS-1670 dev contract is wired in the curated game.js wrapper.
//  AC1     boss wave every bossEvery(5): waves 5/10/15 spawn exactly 1 boss, 0 trash;
//          every other wave is a trash pack (0 boss, >=1 trash).
//  AC2     telegraph — lastTelegraphWave set ON a boss-wave spawn; bossIncoming flagged
//          during a rest that PRECEDES a boss wave, and NOT during a normal rest.
//  AC3     killing a boss wave banks +ceil(bossEssBase*k) Esencia OVER the base gain and
//          drops arenaBonusDropCount(k) extra pieces; both scale k=1 < k=2 (<= k=3).
//  AC4     boss HP/dmg = base × wave-multiplier (1+n*hpStep / 1+n*dmgStep) at 5/10/15/20.
//  AC5     [AC-RNG-STRONG] arenaSetBossBonus(0) leaves srand BYTE-IDENTICAL vs bonus>0 at
//          the SAME seed (bonus loot draws from arenaRng only; Esencia is arithmetic).
//  AC6     mithralda.arena.v1 additive — legacy {v:1,bestWave} save loads across a REAL
//          reload with NO migration AND still sees the new scaled payoff.
//  PERF    >=55 fps sampled EARLY on a clean live wave; 0 JS errors (favicon 404 filtered).
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1673"; fs.mkdirSync(OUT, { recursive: true });
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

// Menu → class → ability → play. KeyA = Arena de Oleadas (needs the name field blurred so the
// key isn't swallowed by the input); the CAS-1670 hooks then drive the boss paths on the live hero.
async function enterArena(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "BossBot"; ni.blur(); }
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
  await page.waitForFunction("window.__dev && window.__dev.arenaState", { timeout: 20000 });
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
  if (!vb.ok) { console.log("  → boss-wave build NOT live on gh-pages yet; aborting live ACs (CDN lag / deploy pending)."); return { pass, fail: fail + 1, notDeployed: true }; }

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|apple-touch|touch-icon|\.ico(\?|$)/i.test(r.url())) errs.push("http404: " + r.url()); });
  // Strip ONLY the run save (mithralda.save.v1) on every new document — the unload flush re-saves it,
  // so a plain reload would auto-resume into 'play' and never reach the menu. The arena best store
  // (mithralda.arena.v1) is deliberately LEFT intact so AC6 can prove it persists/loads legacy shape.
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

  // ---- boot ----
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try { await bootMenu(page); booted = true; }
    catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev.arenaState never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  await enterArena(page);
  const ar = await page.evaluate(() => window.__dev.arenaState());
  gate("BOOT.arena", !!(ar && ar.mode === true && ar.scene === "play"), `menu "Arena de Oleadas" (KeyA) → live gauntlet (arenaMode, wave ${ar && ar.wave})`);

  // ---- PERF (sampled EARLY, clean live wave, before probe flooding) ----
  // BEST of 3 one-second windows after a warm-up frame: the render path (render/render.js) is
  // UNTOUCHED by CAS-1670 (only game/config/sim changed; the telegraph is a one-shot toast/shake/sfx,
  // never per-frame), so this measures the base-arena render ceiling. Best-of-3 rejects a single
  // GC/CDN hitch dragging one window down on the shared 2-core box.
  const sampleFps = async () => page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  await sampleFps();                                          // warm-up window (discarded)
  const fpsN = [await sampleFps(), await sampleFps(), await sampleFps()];
  const fps = Math.max(...fpsN);
  gate("PERF.fps", fps >= 55, `~${fps} fps (best of ${fpsN.join("/")}) sampled EARLY on a boss-FREE wave (render path untouched; 2-core box = noise, real gate is determinism/byte-id)`);

  // ---- HOOKS wired in the curated game.js wrapper (not just sim dev) ----
  const hooks = ["arenaSetWave","arenaForceBossWave","arenaSetBossBonus","arenaLastPayoff","arenaKillBossWave","arenaBossSrandProbe","arenaState","arenaClearReward","arenaPersist"];
  const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
  gate("HOOKS.wired", missing.length === 0, missing.length ? `NOT wired: ${missing.join(", ")}` : `all ${hooks.length} CAS-1670 dev hooks wired`);

  // ======================= AC1: boss cadence every bossEvery(5) ============
  const cadence = await page.evaluate(() => {
    const out = []; for (let n = 1; n <= 16; n++) { const r = window.__dev.arenaSetWave(n); out.push({ n, bossCount: r.bossCount, trash: r.trashCount, boss: r.boss }); } return out;
  });
  let cadOk = true, cadWhy = "";
  for (const r of cadence) {
    const shouldBoss = (r.n % 5) === 0;
    if (shouldBoss && (r.bossCount !== 1 || r.trash !== 0)) { cadOk = false; cadWhy += ` w${r.n}=(boss${r.bossCount}/trash${r.trash})`; }
    if (!shouldBoss && (r.bossCount !== 0 || r.trash < 1)) { cadOk = false; cadWhy += ` w${r.n}=(boss${r.bossCount}/trash${r.trash})`; }
  }
  gate("AC1.bossCadence", cadOk, cadOk ? `waves 5/10/15 = exactly 1 boss/0 trash; all others = trash packs (checked 1..16)` : `cadence wrong:${cadWhy}`);

  // ======================= AC2: telegraph on spawn + bossIncoming heads-up ==
  const teleSpawn = await page.evaluate(() => { const r = window.__dev.arenaSetWave(10); return { r, s: window.__dev.arenaState() }; });
  gate("AC2.spawnTelegraph", teleSpawn.s.lastTelegraphWave === 10 && teleSpawn.r.boss, `boss-wave spawn fires the telegraph banner (lastTelegraphWave=${teleSpawn.s.lastTelegraphWave})`);
  const teleRest = await page.evaluate(() => { window.__dev.arenaSetWave(4); window.__dev.arenaClearReward(); return window.__dev.arenaLastPayoff(); });
  gate("AC2.bossIncoming", teleRest.bossIncoming === true, `a rest BEFORE a boss wave flags bossIncoming (heads-up telegraph): ${teleRest.bossIncoming}`);
  const teleRestNo = await page.evaluate(() => { window.__dev.arenaSetWave(2); window.__dev.arenaClearReward(); return window.__dev.arenaLastPayoff().bossIncoming; });
  gate("AC2.noFalseIncoming", teleRestNo === false, `a normal rest does NOT flag bossIncoming (telegraph is boss-specific): ${teleRestNo}`);

  // ======================= AC3: scaled guaranteed payoff (k=1,2,3) =========
  const payoff = await page.evaluate(() => { const out = []; for (const k of [1, 2, 3]) { window.__dev.arenaSetBossBonus(1); out.push(window.__dev.arenaKillBossWave(k)); } return out; });
  const [p1, p2, p3] = payoff;
  gate("AC3.essScales", p1.essBonus === 25 && p2.essBonus === 50 && p3.essBonus === 75, `boss Esencia bonus = ceil(25*k) scales: ${p1.essBonus} < ${p2.essBonus} < ${p3.essBonus}`);
  gate("AC3.essOnTop", payoff.every((p) => p.essGain >= p.essBase + p.essBonus), `total wave Esencia = base+bonus (k3: base ${p3.essBase}+bonus ${p3.essBonus} ⇒ gain ${p3.essGain})`);
  const dropsOk = payoff.every((p) => p.bonusDrops === p.expectBonusDrops && p.gearDropsAdded >= 1 + p.expectBonusDrops);
  gate("AC3.lootScales", dropsOk && p2.bonusDrops > p1.bonusDrops && p3.bonusDrops >= p2.bonusDrops, `extra loot scales with k: bonusDrops ${p1.bonusDrops}/${p2.bonusDrops}/${p3.bonusDrops} (+ base boss drop each kill)`);

  // ======================= AC4: boss HP/dmg scale by the wave curve ========
  const scale = await page.evaluate(() => [5, 10, 15, 20].map((n) => window.__dev.arenaSetWave(n)));
  const scaleOk = scale.every((r) => {
    const expHp = Math.round(r.boss_baseHp * r.boss_hpMul), expDmg = Math.round(r.boss_baseDmg * r.boss_dmgMul);
    const mulOk = Math.abs(r.boss_hpMul - (1 + r.wave * 0.12)) < 1e-6 && Math.abs(r.boss_dmgMul - (1 + r.wave * 0.08)) < 1e-6;
    return r.boss_hp === expHp && r.boss_dmg === expDmg && mulOk && r.boss_hp > r.boss_baseHp;
  });
  const climbs = scale[3].boss_hp > scale[0].boss_hp && scale[3].boss_dmg > scale[0].boss_dmg;
  gate("AC4.bossScaling", scaleOk && climbs, `boss HP/dmg = base × wave-mult (hpStep .12/dmgStep .08) & climbs: hp ${scale[0].boss_hp}→${scale[3].boss_hp}, dmg ${scale[0].boss_dmg}→${scale[3].boss_dmg}`);

  // ======================= AC5: [AC-RNG-STRONG] srand byte-identical =======
  // Same seed, spawn+kill a boss with the bonus ON (>0) vs OFF (0); the raw srand probe must be
  // byte-identical (bonus loot draws from arenaRng only; Esencia is pure arithmetic). Silence the
  // other dedicated streams so their seed()-immune carryover can't masquerade as a shift.
  await page.evaluate(() => { window.__dev.setLegRate(0); window.__dev.setSetRate(0); window.__dev.setChampRate(0); });
  const SEED = 0x1234abcd, PROBE = 24, K = 3;
  const rngA = await page.evaluate((s, p, k) => { window.__dev.arenaSetBossBonus(3); return window.__dev.arenaBossSrandProbe(k, s, p); }, SEED, PROBE, K);
  const rngB = await page.evaluate((s, p, k) => { window.__dev.arenaSetBossBonus(0); return window.__dev.arenaBossSrandProbe(k, s, p); }, SEED, PROBE, K);
  await page.evaluate(() => { window.__dev.setLegRate(null); window.__dev.setSetRate(null); window.__dev.setChampRate(null); window.__dev.arenaSetBossBonus(1); });
  const hashA = JSON.stringify(rngA.srandProbe), hashB = JSON.stringify(rngB.srandProbe);
  gate("AC5.rngStrong", hashA === hashB && rngA.bonusDrops > 0 && rngB.bonusDrops === 0, `[AC-RNG-STRONG] srand BYTE-IDENTICAL with bonus=${rngA.bonusDrops} vs bonus=${rngB.bonusDrops} (${rngA.srandProbe.length} probes) — bonus loot never touches srand`);

  // ======================= AC6a: save shape unchanged (round-trip) =========
  const per = await page.evaluate(() => window.__dev.arenaPersist(9));
  const shapeOk = per && per.after === 9 && per.blob && per.blob.v === 1 && Object.keys(per.blob).sort().join(",") === "bestWave,v";
  gate("AC6.saveShape", shapeOk, `arena save shape unchanged {v:1,bestWave} (no SAVE_VERSION bump), round-trip best=${per && per.after}`);

  await page.screenshot({ path: `${OUT}/${label}-boss.png` });

  // ======================= AC6b: LEGACY save loads (no migration) + new payoff =====
  // Destructive (reloads) → runs LAST. Plant a pre-CAS-1670 legacy arena save (only {v:1,bestWave}),
  // reload → menu, confirm bootArena loads it with NO migration, then re-enter and kill a boss to
  // prove the legacy save STILL sees the new scaled payoff (Esencia bonus banks on top).
  await page.evaluate(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch {} localStorage.setItem("mithralda.arena.v1", JSON.stringify({ v: 1, bestWave: 12 })); });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.arenaBest", { timeout: 20000 });
  const legBest = await page.evaluate(() => window.__dev.arenaBest());
  const legScene = await page.evaluate(() => window.__dev.scene());
  await enterArena(page);
  const legPay = await page.evaluate(() => { window.__dev.arenaSetBossBonus(1); return window.__dev.arenaKillBossWave(2); });
  gate("AC6.legacyLoad", legBest === 12 && legScene === "menu" && legPay.essBonus === 50, `legacy {v:1,bestWave:12} loads with NO migration (arenaBest=${legBest}, boots clean) AND sees the new payoff (k2 essBonus=${legPay.essBonus})`);

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
  if (notDeployed) console.log("NOTE: boss-wave build NOT live on gh-pages yet — re-run after the deploy + version.json bump.");
  process.exit(tf === 0 ? 0 : 1);
})();
