// ---------------------------------------------------------------------------
// CAS-1664 — ARENA DE OLEADAS (Wave Survival). A separate endgame MODE, opt-in from the menu,
// that REUSES the whole content library (ETPL trash, HUNTS boss stat blocks, elite affixes, the
// boon draft, the loot streams, the Esencia bank) with ZERO new art. Flag off ⇒ byte-identical;
// dedicated append-only arenaRng stream; additive best-wave save. Mirrors Ultimate (CAS-1659) /
// Item Sets (CAS-1654). Proves, through the REAL sim hooks (window.__dev):
//   [AC1] menu "Arena de Oleadas" (KeyA) → createHero starts arena (arenaMode==true, wave 1 live);
//         the normal Play (Enter) path stays arenaMode==false with an inert G.arena.
//   [AC2] wave count + hp/dmg scale with the wave; every BOSS_EVERY wave spawns exactly 1 boss;
//         all spawned trash types ∈ the existing ETPL pool.
//   [AC3] a cleared wave → resting + hero heal; the rest expiring → wave++ and the next roster;
//         a boon-wave clear opens the REAL draft (picks resume play + the rest); death → score=wave.
//   [AC4] the best wave round-trips through the REAL persistence pair; the run save (mithralda.save.v1)
//         carries NO arena key (schema untouched, no SAVE_VERSION bump).
//   [AC5] [AC-RNG-STRONG]: arena OFF, the srand loot stream is BYTE-IDENTICAL for ANY arenaSetAffixRate
//         (arenaRng never touches srand; every arena path is gated behind arenaMode).
//   [AC7] clearing a wave banks Esencia to the meta (ensureMeta().essence rises).
//   [PERF/AC6] 60fps sustained in a live wave; zero page errors; desktop + mobile enter arena clean.
//
// Run: node tools/cas1664-arena.mjs   (local build; QA re-points at the live URL)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas1664-arena.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

// Drive the menu → class → ability → play flow. `arena` chooses the entry: Enter = normal
// adventure, KeyA = Arena de Oleadas (needs the name field blurred so the key isn't swallowed).
async function enterPlay(page, arena) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate((useArena) => {
    const ni = document.getElementById("nameInput"); ni.value = useArena ? "ArenaBot" : "NormBot";
    if (useArena) { ni.blur();
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true }));
    } else {
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
    }
  }, !!arena);
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}
async function sampleFps(page, ms = 1000) {
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await wait(ms);
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  return Math.round(((f1 - f0) * 1000) / (t1 - t0));
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.arena.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  // ---------- AC1a: the NORMAL Play (Enter) path stays OUT of arena ----------
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page, false);
  const norm = await page.evaluate(() => window.__dev.arenaState());
  if (norm && norm.mode === false) pass(`[AC1] normal Play entry keeps arenaMode==false (G.arena inert, wave=${norm.wave})`);
  else fail(`[AC1] normal entry wrongly in arena: ${JSON.stringify(norm)}`);

  // ---------- AC1b: the Arena entry (KeyA) STARTS the gauntlet ----------
  await page.reload({ waitUntil: "load" });
  await enterPlay(page, true);
  const ar = await page.evaluate(() => window.__dev.arenaState());
  if (ar && ar.mode === true && ar.wave >= 1 && ar.alive > 0)
    pass(`[AC1] menu "Arena de Oleadas" (KeyA) → createHero starts the gauntlet (arenaMode, wave ${ar.wave}, ${ar.alive} live)`);
  else fail(`[AC1] arena entry did not start: ${JSON.stringify(ar)}`);

  // ---------- AC2: wave count + hp/dmg scaling, boss cadence, pool membership ----------
  const w1 = await page.evaluate(() => window.__dev.arenaSpawnWave(1));
  const w8 = await page.evaluate(() => window.__dev.arenaSpawnWave(8));
  const pool = w1.pool || [];
  const maxHp = (w) => Math.max(...w.mobs.map((m) => m.hp));
  const maxDmg = (w) => Math.max(...w.mobs.map((m) => m.dmg));
  if (w8.count > w1.count) pass(`[AC2] mob count scales with the wave (w1=${w1.count} → w8=${w8.count}, capped)`);
  else fail(`[AC2] mob count did not climb: w1=${w1.count} w8=${w8.count}`);
  if (maxHp(w8) > maxHp(w1) && maxDmg(w8) > maxDmg(w1))
    pass(`[AC2] hp/dmg scale with the wave (hp ${maxHp(w1)}→${maxHp(w8)}, dmg ${maxDmg(w1)}→${maxDmg(w8)})`);
  else fail(`[AC2] stats did not scale: hp ${maxHp(w1)}→${maxHp(w8)} dmg ${maxDmg(w1)}→${maxDmg(w8)}`);
  const typesOk = w1.mobs.concat(w8.mobs).every((m) => m.isBoss || pool.includes(m.type));
  if (typesOk && pool.length) pass(`[AC2] all trash types ∈ the existing ETPL pool (${pool.length} eligible mobs)`);
  else fail(`[AC2] a spawned type is outside the pool: ${JSON.stringify(w8.mobs.map((m) => m.type))}`);
  const b5 = await page.evaluate(() => window.__dev.arenaSpawnWave(5));
  const b10 = await page.evaluate(() => window.__dev.arenaSpawnWave(10));
  const w3 = await page.evaluate(() => window.__dev.arenaSpawnWave(3));
  const bossOne = (w) => w.boss && w.count === 1;
  if (bossOne(b5) && bossOne(b10) && !w3.boss)
    pass(`[AC2] every BOSS_EVERY(5) wave spawns exactly 1 boss (w5,w10 boss; w3 trash)`);
  else fail(`[AC2] boss cadence off: w5=${JSON.stringify({b:b5.boss,c:b5.count})} w10=${JSON.stringify({b:b10.boss,c:b10.count})} w3boss=${w3.boss}`);

  // ---------- AC7: clearing a wave banks Esencia to the meta ----------
  const rew = await page.evaluate(() => window.__dev.arenaClearReward());
  if (rew && rew.gain > 0 && rew.essAfter > rew.essBefore)
    pass(`[AC7] clearing a wave banks Esencia to the meta (+${rew.gain} → ${rew.essAfter})`);
  else fail(`[AC7] no Esencia banked on clear: ${JSON.stringify(rew)}`);

  // ---------- AC3: clear → rest + heal → wave++ ; and a boon-wave clear opens the REAL draft ----------
  await page.evaluate(() => window.__dev.arenaStart());               // reset to wave 1
  const hp0 = await page.evaluate(() => window.__dev.setHeroHp(1));   // wound the hero so the rest-heal is observable
  // Drive the wave-clear → rest through the REAL update loop: remove the roster, tick a frame.
  await page.evaluate(() => window.__dev.arenaClearWave());
  await wait(200);                                                    // let the update loop fire tickArena → onWaveCleared
  const rest2 = await page.evaluate(() => window.__dev.arenaState());
  if (rest2.resting) pass(`[AC3] a cleared wave enters the between-wave REST (restT≈${rest2.restT}s)`);
  else fail(`[AC3] wave clear did not rest: ${JSON.stringify(rest2)}`);
  if (rest2.hp > hp0) pass(`[AC3] the rest heals the hero (${hp0} → ${rest2.hp}/${rest2.maxHp})`);
  else fail(`[AC3] rest did not heal: hp ${hp0} → ${rest2.hp}`);
  // wait out the rest → the next wave spawns and wave++ (restSeconds ~3s → allow 4s)
  await wait(4200);
  const nextW = await page.evaluate(() => window.__dev.arenaState());
  if (nextW.wave >= 2 && nextW.alive > 0 && !nextW.resting)
    pass(`[AC3] the rest expiring advances the gauntlet (wave ${nextW.wave}, ${nextW.alive} live)`);
  else fail(`[AC3] next wave did not spawn: ${JSON.stringify(nextW)}`);

  // boon-wave: force wave 3 (BOON_EVERY=3), clear → the REAL draft opens; a pick resumes play + rest.
  const draftOpen = await page.evaluate(() => {
    const s = window.__dev.arenaState();
    // jump the wave counter to a boon multiple, mark a live roster, then clear+tick
    window.__dev.arenaSpawnWave(3);            // wave=3, roster live
    window.__dev.arenaClearWave();             // remove them
    return true;
  });
  await wait(200);
  const dScene = await page.evaluate(() => window.__dev.scene());
  if (dScene === "draft") pass(`[AC3] a boon-wave (÷BOON_EVERY) clear opens the REAL boon draft`);
  else fail(`[AC3] boon-wave draft did not open (scene=${dScene})`);
  // pick a card → back to play, still resting (draft froze the timer)
  const resumed = await page.evaluate(() => {
    if (window.__dev.scene() === "draft") window.__dev.pickBoon(0);
    return window.__dev.arenaState();
  });
  if (resumed.scene === "play" && resumed.resting)
    pass(`[AC3] picking a boon resumes play and the rest continues (scene=play, resting)`);
  else fail(`[AC3] draft pick did not resume the rest: ${JSON.stringify(resumed)}`);

  // death in arena → score = wave reached, best persists (drive the REAL heroDie path via killHero)
  const dead = await page.evaluate(() => {
    window.__dev.arenaStart();                 // fresh gauntlet at wave 1
    window.__dev.arenaSpawnWave(4);            // reach wave 4 (the score)
    window.__dev.killHero();                   // REAL heroDie → arenaOnDeath (best bank) + scene "dead"
    return { scene: window.__dev.scene(), st: window.__dev.arenaState(), best: window.__dev.arenaBest() };
  });
  if (dead.scene === "dead" && dead.st.wave >= 4 && dead.best >= dead.st.wave)
    pass(`[AC3] hero death ends the run — score=wave ${dead.st.wave}, best=${dead.best}`);
  else fail(`[AC3] arena death/score off: ${JSON.stringify(dead)}`);

  // ---------- AC4: best-wave persistence round-trip; run save schema untouched ----------
  const per = await page.evaluate(() => window.__dev.arenaPersist(7));
  if (per && per.after === 7 && per.blob && per.blob.v === 1 && per.blob.bestWave === 7)
    pass(`[AC4] best wave round-trips through the REAL persistence pair: ${JSON.stringify(per.blob)}`);
  else fail(`[AC4] best-wave persist failed: ${JSON.stringify(per)}`);

  // ---------- AC5 [AC-RNG-STRONG]: arena OFF ⇒ srand loot stream byte-identical for ANY affix rate ----------
  await page.evaluate(() => { window.__dev.setLegRate(0); window.__dev.setSetRate(0); window.__dev.setChampRate(0); });
  const s0 = await page.evaluate(() => { window.__dev.arenaSetAffixRate(0); return window.__dev.dropStream(400, 135790); });
  const s9 = await page.evaluate(() => { window.__dev.arenaSetAffixRate(0.9); return window.__dev.dropStream(400, 135790); });
  const sN = await page.evaluate(() => { window.__dev.arenaSetAffixRate(null); return window.__dev.dropStream(400, 135790); });
  await page.evaluate(() => { window.__dev.setLegRate(null); window.__dev.setSetRate(null); window.__dev.setChampRate(null); });
  const same = JSON.stringify(s0) === JSON.stringify(s9) && JSON.stringify(s9) === JSON.stringify(sN);
  if (same && s0.length)
    pass(`[AC-RNG-STRONG] arena OFF: dropStream is BYTE-IDENTICAL for arenaSetAffixRate 0 / 0.9 / default (${s0.length} drops) — arenaRng never touches srand`);
  else fail(`[AC-RNG-STRONG] affix rate perturbed the shared srand stream: identical=${same}`);

  // ---------- PERF ----------
  await page.evaluate(() => window.__dev.arenaStart());
  await page.evaluate(() => window.__dev.arenaSpawnWave(6));
  await wait(300);
  const fps = await sampleFps(page, 1200);
  if (fps >= 55) pass(`[PERF] ${fps} fps sustained in a live wave`);
  else fail(`[PERF] fps below target: ${fps}`);
  await page.screenshot({ path: SHOT });

  // ---------- AC6: mobile viewport enters the arena clean ----------
  const m = await browser.newPage();
  await m.setViewport({ width: 414, height: 896, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const merr = [];
  m.on("pageerror", (e) => merr.push(`pageerror: ${e.message}`));
  m.on("console", (c) => { if (c.type() === "error") merr.push(`console.error: ${c.text()}`); });
  await m.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.arena.v1"); } catch (e) {} });
  await m.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await m.bringToFront();
  await enterPlay(m, true);
  await wait(300);
  const mState = await m.evaluate(() => window.__dev.arenaState());
  if (mState && mState.mode && mState.wave >= 1 && merr.filter((e) => !/favicon/i.test(e)).length === 0)
    pass(`[AC6] mobile enters the arena clean (wave ${mState.wave}, ${mState.alive} live), zero page errors`);
  else fail(`[AC6] mobile issues: state=${JSON.stringify(mState)} errors=${merr.slice(0, 3).join(" | ")}`);
  await m.screenshot({ path: join(ROOT, "tools", "cas1664-arena-mobile.png") });
  await m.close();

  const realErr = errors.filter((e) => !/favicon/i.test(e));
  if (realErr.length) fail(`page errors: ${realErr.slice(0, 4).join(" | ")}`);
  else pass("zero page errors (desktop)");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
log(ok ? "\n✅ CAS-1664 arena de oleadas: ALL PASS" : "\n❌ CAS-1664 arena de oleadas: FAILURES ABOVE");
process.exit(ok ? 0 : 1);
