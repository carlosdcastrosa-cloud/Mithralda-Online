// ===========================================================================
// CAS-1667 — LIVE QA: Arena de Oleadas (Wave Survival). Verifies CAS-1664/1665
// (build CAS-1665, deploy CAS-1666) on the canonical gh-pages build. PASS x2
// (desktop + mobile). Pattern mirrors tools/cas1661-ultimate-live-qa.mjs.
//
//   node tools/cas1664-arena-live-qa.mjs [URL]
//   default URL = https://carlosdcastrosa-cloud.github.io/Mithralda-Online/
//
// CAS-1664 (game.js + input.js + persist.js + render/render.js + sim/config.js
// + sim/sim.js, additive + RNG-neutral): a separate endgame MODE, opt-in from the
// menu (KeyA / tap the Arena button), that REUSES the whole content library (ETPL
// trash, HUNTS boss stat blocks, elite affixes, boon draft, loot streams, Esencia
// bank) with ZERO new art. `arenaMode` is the master gate — off for every normal
// adventure, so no arena code runs and the sim/RNG is byte-identical to a build
// without the mode at ANY affix rate (AC5 [AC-RNG-STRONG]). Every random draw comes
// from a DEDICATED append-only arenaRng stream (createRNG(0xa5e4a000)); the best-wave
// survives in its OWN store (mithralda.arena.v1), the run save schema is untouched.
//
// window/dev hooks used (all route to the SAME served sim module via game.js wrapper):
//   __dev.arenaState / arenaStart / arenaSpawnWave / arenaClearWave / arenaClearReward
//   __dev.arenaSetAffixRate / arenaBest / arenaPersist / scene / setHeroHp / killHero
//   __dev.pickBoon / dropStream / setLegRate / setSetRate / setChampRate
//
// Gates (must PASS x2 — desktop + mobile):
//  BUILD   version.json served (reported); served 6 touched files md5 == HEAD
//  AC1     menu Arena entry (KeyA) starts the mode (arenaMode, wave>=1 live);
//          the normal Play (Enter) path stays arenaMode==false (adventure intact).
//  AC2     waves scale (count + hp/dmg climb with the wave); boss wave every
//          BOSS_EVERY spawns exactly 1 boss; all trash types ∈ the ETPL pool.
//  AC3     death ends the run, score = highest wave; a cleared wave rests + heals
//          the hero (boon-wave clear opens the REAL draft; a pick resumes play+rest).
//  AC4     mithralda.arena.v1 bestWave persists across a REAL page reload; the run
//          save round-trips through the REAL persistence pair (own key v:1, no bump).
//  AC5     [AC-RNG-STRONG] arena OFF ⇒ dropStream byte-identical for arenaSetAffixRate
//          0 / 0.9 / default (arenaRng never touches srand; silence leg/set/champ confound).
//  AC7     clearing a wave banks Esencia to the meta (meta.essence rises) + loot drops.
//  AC6/PERF 0 JS errors (favicon 404 ignored); >=55 fps sampled EARLY on clean state.
// ===========================================================================
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/").replace(/\/$/, "");
const FILES = ["game.js", "input.js", "persist.js", "render/render.js", "sim/config.js", "sim/sim.js"];
const OUT = "shots/cas1667"; fs.mkdirSync(OUT, { recursive: true });
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

// Menu → class → ability → play. Enter = normal adventure; KeyA = Arena de Oleadas
// (needs the name field blurred so the key isn't swallowed by the input).
async function enterPlay(page, arena) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 20000 });
  await page.evaluate((useArena) => {
    const ni = document.getElementById("nameInput"); if (ni) ni.value = useArena ? "ArenaBot" : "NormBot";
    if (useArena) { if (ni) ni.blur();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true }));
    } else {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
    }
  }, !!arena);
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await wait(200);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 8000 });
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
  if (!vb.ok) { console.log("  → arena build NOT live on gh-pages yet; aborting live ACs (CTO deploy pending)."); return { pass, fail: fail + 1, notDeployed: true }; }

  const browser = await puppeteer.launch({ executablePath: findChromium(), headless: true, args: LAUNCH_ARGS, protocolTimeout: 180000 });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errs.push("console.error: " + m.text()); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon|apple-touch|touch-icon|\.ico(\?|$)/i.test(r.url())) errs.push("http404: " + r.url()); });
  // Strip ONLY the run save (mithralda.save.v1) on every new document — the game's unload flush
  // re-saves it, so a plain reload would auto-resume into 'play' and never reach the menu (flaky).
  // The arena best store (mithralda.arena.v1) is deliberately LEFT intact so AC4 can prove it persists.
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });

  // ---- boot ----
  let booted = false;
  for (let a = 1; a <= 5 && !booted; a++) {
    try {
      await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.evaluate(() => { try { localStorage.clear(); } catch {} });
      await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForFunction("window.__dev && window.__dev.arenaState", { timeout: 20000 });
      booted = true;
    } catch (e) { console.log(`  boot attempt ${a} failed (${e.message.split("\n")[0]}), reloading…`); await wait(1500); }
  }
  if (!booted) { gate("BOOT", false, "__dev.arenaState never appeared"); await browser.close(); return { pass, fail: fail + 1 }; }

  // ======================= AC1a: normal Play (Enter) stays OUT of arena ====
  await enterPlay(page, false);
  const norm = await page.evaluate(() => window.__dev.arenaState());
  gate("AC1.normalIntact", !!(norm && norm.mode === false && norm.scene === "play"), `normal Play entry keeps arenaMode==false (adventure intact, G.arena inert, wave=${norm && norm.wave})`);

  // ---- PERF (sampled EARLY, clean-ish state, before probe flooding) ----
  // Normal play auto-saved mithralda.save.v1 → fresh-boot (goto → clear → reload, like the boot loop)
  // so the game lands on the MENU (auto-resume would otherwise skip the class/ability flow) before
  // we take the Arena (KeyA) entry.
  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.arenaState", { timeout: 20000 });
  await enterPlay(page, true);
  const fps = await page.evaluate(async () => {
    let n = 0; const t0 = performance.now();
    await new Promise((res) => { const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
    return Math.round((n * 1000) / (performance.now() - t0));
  });
  gate("PERF.fps", fps >= 55, `~${fps} fps sampled EARLY in a live wave (>=55; 2-core box = noise, real gate is determinism/byte-id)`);

  // ======================= AC1b: Arena entry (KeyA) STARTS the gauntlet ====
  const ar = await page.evaluate(() => window.__dev.arenaState());
  gate("AC1.arenaStart", !!(ar && ar.mode === true && ar.wave >= 1 && ar.alive > 0), `menu "Arena de Oleadas" (KeyA) → createHero starts the gauntlet (arenaMode, wave ${ar && ar.wave}, ${ar && ar.alive} live)`);

  // ======================= AC2: scaling + boss cadence + pool ==============
  const w1 = await page.evaluate(() => window.__dev.arenaSpawnWave(1));
  const w8 = await page.evaluate(() => window.__dev.arenaSpawnWave(8));
  const pool = w1.pool || [];
  const maxHp = (w) => Math.max(...w.mobs.map((m) => m.hp));
  const maxDmg = (w) => Math.max(...w.mobs.map((m) => m.dmg));
  gate("AC2.countScales", w8.count > w1.count, `mob count climbs with the wave (w1=${w1.count} → w8=${w8.count}, capped)`);
  gate("AC2.statScales", maxHp(w8) > maxHp(w1) && maxDmg(w8) > maxDmg(w1), `hp/dmg climb with the wave (hp ${maxHp(w1)}→${maxHp(w8)}, dmg ${maxDmg(w1)}→${maxDmg(w8)})`);
  const typesOk = w1.mobs.concat(w8.mobs).every((m) => m.isBoss || pool.includes(m.type));
  gate("AC2.poolMembers", typesOk && pool.length > 0, `all trash types ∈ the existing ETPL pool (${pool.length} eligible mobs)`);
  const b5 = await page.evaluate(() => window.__dev.arenaSpawnWave(5));
  const b10 = await page.evaluate(() => window.__dev.arenaSpawnWave(10));
  const w3 = await page.evaluate(() => window.__dev.arenaSpawnWave(3));
  const bossOne = (w) => w.boss && w.count === 1;
  gate("AC2.bossCadence", bossOne(b5) && bossOne(b10) && !w3.boss, `every BOSS_EVERY(5) wave spawns exactly 1 boss (w5,w10 boss; w3 trash) — boss ∈ HUNTS pool`);

  // ======================= AC7: wave clear banks Esencia + loot ============
  const rew = await page.evaluate(() => window.__dev.arenaClearReward());
  gate("AC7.essence", !!(rew && rew.gain > 0 && rew.essAfter > rew.essBefore), `clearing a wave banks Esencia to the meta (+${rew && rew.gain} → ${rew && rew.essAfter})`);

  // ======================= AC3: rest+heal, boon draft, death=score =========
  await page.evaluate(() => window.__dev.arenaStart());
  const hp0 = await page.evaluate(() => window.__dev.setHeroHp(1));
  await page.evaluate(() => window.__dev.arenaClearWave());
  await wait(250);
  const rest2 = await page.evaluate(() => window.__dev.arenaState());
  gate("AC3.restHeal", !!(rest2.resting && rest2.hp > hp0), `a cleared wave enters the between-wave REST (restT≈${rest2.restT}s) and heals the hero (${hp0} → ${rest2.hp}/${rest2.maxHp})`);
  await wait(4200);
  const nextW = await page.evaluate(() => window.__dev.arenaState());
  gate("AC3.nextWave", !!(nextW.wave >= 2 && nextW.alive > 0 && !nextW.resting), `the rest expiring advances the gauntlet (wave ${nextW.wave}, ${nextW.alive} live)`);

  // boon-wave (÷BOON_EVERY) clear opens the REAL draft; a pick resumes play + rest
  await page.evaluate(() => { window.__dev.arenaSpawnWave(3); window.__dev.arenaClearWave(); });
  await wait(250);
  const dScene = await page.evaluate(() => window.__dev.scene());
  gate("AC3.boonDraft", dScene === "draft", `a boon-wave (÷BOON_EVERY) clear opens the REAL boon draft (scene=${dScene})`);
  const resumed = await page.evaluate(() => { if (window.__dev.scene() === "draft") window.__dev.pickBoon(0); return window.__dev.arenaState(); });
  gate("AC3.resumeRest", !!(resumed.scene === "play" && resumed.resting), `picking a boon resumes play + the rest continues (scene=${resumed.scene}, resting=${resumed.resting})`);

  const dead = await page.evaluate(() => {
    window.__dev.arenaStart(); window.__dev.arenaSpawnWave(4); window.__dev.killHero();
    return { scene: window.__dev.scene(), st: window.__dev.arenaState(), best: window.__dev.arenaBest() };
  });
  gate("AC3.deathScore", !!(dead.scene === "dead" && dead.st.wave >= 4 && dead.best >= dead.st.wave), `hero death ends the run — score=highest wave ${dead.st.wave}, best=${dead.best}`);

  // ======================= AC4a: bestWave round-trips the persistence pair =
  const per = await page.evaluate(() => window.__dev.arenaPersist(7));
  gate("AC4.roundTrip", !!(per && per.after === 7 && per.blob && per.blob.v === 1 && per.blob.bestWave === 7), `best wave round-trips through the REAL persistence pair (own key v:1, no SAVE_VERSION bump): ${JSON.stringify(per && per.blob)}`);

  // ======================= AC5: [AC-RNG-STRONG] byte-identical =============
  // Silence the OTHER dedicated streams (legRng/setRng/champ) so their seed()-immune carryover can't
  // masquerade as a shift. Then arena OFF, only the shared srand can differ — and it must not, at ANY affix rate.
  // (Runs while a live hero exists — the AC3 death leaves G.hero present; the reload-persist test below is destructive.)
  await page.evaluate(() => { window.__dev.setLegRate(0); window.__dev.setSetRate(0); window.__dev.setChampRate(0); });
  const s0 = await page.evaluate(() => { window.__dev.arenaSetAffixRate(0); return window.__dev.dropStream(400, 135790); });
  const s9 = await page.evaluate(() => { window.__dev.arenaSetAffixRate(0.9); return window.__dev.dropStream(400, 135790); });
  const sN = await page.evaluate(() => { window.__dev.arenaSetAffixRate(null); return window.__dev.dropStream(400, 135790); });
  await page.evaluate(() => { window.__dev.setLegRate(null); window.__dev.setSetRate(null); window.__dev.setChampRate(null); });
  const same = JSON.stringify(s0) === JSON.stringify(s9) && JSON.stringify(s9) === JSON.stringify(sN);
  gate("AC5.rngStrong", same && s0.length > 0, `[AC-RNG-STRONG] arena OFF: dropStream BYTE-IDENTICAL for arenaSetAffixRate 0 / 0.9 / default (${s0.length} drops) — arenaRng never touches srand`);

  await page.screenshot({ path: `${OUT}/${label}-arena.png` });

  // ======================= AC4b: bestWave persists across a REAL reload ====
  // Destructive (nulls the hero) → runs LAST. Plant the arena store (clear the run save so the reload
  // lands on the MENU rather than auto-resuming), reload, confirm bootArena reloads the arena best
  // independently of the run save (own key, isolated store) and the save system boots clean.
  await page.evaluate(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch {} localStorage.setItem("mithralda.arena.v1", JSON.stringify({ v: 1, bestWave: 14 })); });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForFunction("window.__dev && window.__dev.arenaBest", { timeout: 20000 });
  const bestAfterReload = await page.evaluate(() => window.__dev.arenaBest());
  const menuAfterReload = await page.evaluate(() => window.__dev.scene());
  gate("AC4.reloadPersist", bestAfterReload === 14 && menuAfterReload === "menu", `mithralda.arena.v1 bestWave survives a REAL reload (arenaBest=${bestAfterReload}) and the save system boots clean (scene=${menuAfterReload}, existing saves intact)`);

  // ---- AC6 errors ----
  gate("AC6.noErrors", errs.length === 0, errs.length ? errs.slice(0, 4).join(" | ") : "0 JS errors (favicon 404 filtered)");

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
  if (notDeployed) console.log("NOTE: arena build NOT live on gh-pages — CTO deploy of CAS-1665 pending. Re-run after deploy + version.json bump.");
  process.exit(tf === 0 ? 0 : 1);
})();
