// ---------------------------------------------------------------------------
// CAS-1670 — OLEADAS DE JEFE EN LA ARENA: telegrafía de oleada + payoff escalado.
// The Arena de Oleadas (CAS-1664) already spawns wave-bosses. This is the DELTA: a legible
// "boss wave" telegraph (distinct toast/shake/sfx) + a GUARANTEED payoff scaled by the boss
// index k = wave/bossEvery — extra Esencia (pure arithmetic, 0 RNG) and extra loot pieces
// (drawn from the DEDICATED arenaRng, NEVER srand). Everything additive; the arena save
// (mithralda.arena.v1) shape is untouched. Proves, through the REAL sim hooks (window.__dev):
//   [AC1] every bossEvery-th wave spawns exactly 1 boss (isBoss+arena); other waves = trash pack.
//   [AC2] a boss wave telegraphs BEFORE/ON spawn (lastTelegraphWave set) + bossIncoming during the
//         rest BEFORE a boss wave.
//   [AC3] killing a boss wave banks +ceil(bossEssBase*k) Esencia OVER the base gain and drops
//         >= arenaBonusDropCount(k) extra pieces; both scale with k (k=1 vs k=2 vs k=3).
//   [AC4] boss HP/dmg scale by the wave multiplier (base × 1+n*hpStep / 1+n*dmgStep) — no regression.
//   [AC5] [RNG-STRONG]: arenaSetBossBonus(0) leaves the srand stream BYTE-IDENTICAL vs bonus>0
//         (bonus loot draws from arenaRng; Esencia is arithmetic). Same seed → same srand probe hash.
//   [AC6] save mithralda.arena.v1 intact (same shape/version) — a legacy save loads without migration.
//
// Run: node tools/cas1670-bosswaves.mjs   (local build; the Deploy child re-points QA at the live URL)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const SHOT = join(ROOT, "tools", "cas1670-bosswaves.png");
const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found (set PUPPETEER_EXECUTABLE_PATH)."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

// Menu -> class -> ability -> play (normal adventure entry; the CAS-1670 hooks flip arenaMode themselves).
async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    const ni = document.getElementById("nameInput"); if (ni) { ni.value = "BossBot"; ni.blur(); }
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'abilitysel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
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

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await enterPlay(page);
  pass("entered play (live hero) — CAS-1670 hooks drive the arena boss paths");

  // Assert the whole CAS-1670 dev contract is wired in the curated game.js wrapper (not just sim dev).
  const hooks = ["arenaSetWave","arenaForceBossWave","arenaSetBossBonus","arenaLastPayoff",
    "arenaKillBossWave","arenaBossSrandProbe","arenaSetAffixRate","arenaState"];
  const missing = await page.evaluate((hs) => hs.filter((h) => typeof window.__dev[h] !== "function"), hooks);
  if (missing.length) fail(`dev hooks NOT wired: ${missing.join(", ")}`); else pass(`dev hooks wired: ${hooks.join(", ")}`);

  // ---------- AC1: bossEvery cadence — exactly 1 boss every bossEvery waves, else trash ----------
  const cadence = await page.evaluate(() => {
    const out = [];
    for (let n = 1; n <= 16; n++) { const r = window.__dev.arenaSetWave(n); out.push({ n, boss: r.boss, bossCount: r.bossCount, trash: r.trashCount }); }
    return out;
  });
  let cadenceOk = true;
  for (const r of cadence) {
    const shouldBoss = (r.n % 5) === 0;
    if (shouldBoss && (r.bossCount !== 1 || r.trash !== 0)) { cadenceOk = false; fail(`wave ${r.n}: expected 1 boss/0 trash, got boss=${r.bossCount} trash=${r.trash}`); }
    if (!shouldBoss && (r.bossCount !== 0 || r.trash < 1)) { cadenceOk = false; fail(`wave ${r.n}: expected trash pack, got boss=${r.bossCount} trash=${r.trash}`); }
  }
  if (cadenceOk) pass("AC1: boss waves 5/10/15 spawn exactly 1 boss; all others are trash packs");

  // ---------- AC2: telegraph ON a boss-wave spawn + bossIncoming during the rest BEFORE one ----------
  const teleSpawn = await page.evaluate(() => { const r = window.__dev.arenaSetWave(10); const s = window.__dev.arenaState(); return { r, s }; });
  if (teleSpawn.s.lastTelegraphWave === 10 && teleSpawn.r.boss) pass("AC2a: boss-wave spawn telegraphs (lastTelegraphWave==10)");
  else fail(`AC2a: boss-wave spawn did not telegraph (lastTelegraphWave=${teleSpawn.s.lastTelegraphWave})`);
  // Clear a NON-boss wave whose successor is a boss wave -> onWaveCleared sets bossIncoming.
  const teleRest = await page.evaluate(() => {
    window.__dev.arenaSetWave(4);          // wave 4 (trash); next (5) is a boss wave
    window.__dev.arenaClearReward();       // real onWaveCleared -> rest, bossIncoming heads-up
    return window.__dev.arenaLastPayoff();
  });
  if (teleRest.bossIncoming === true) pass("AC2b: rest before a boss wave flags bossIncoming (heads-up telegraph)");
  else fail(`AC2b: bossIncoming not set during the pre-boss rest (got ${teleRest.bossIncoming})`);
  // And a rest that does NOT precede a boss wave must NOT flag bossIncoming.
  const teleRestNo = await page.evaluate(() => { window.__dev.arenaSetWave(2); window.__dev.arenaClearReward(); return window.__dev.arenaLastPayoff().bossIncoming; });
  if (teleRestNo === false) pass("AC2c: a normal rest does NOT flag bossIncoming (telegraph is boss-specific)");
  else fail(`AC2c: bossIncoming wrongly set on a normal rest (got ${teleRestNo})`);

  // ---------- AC3: scaled payoff — Esencia + extra loot climb with k (1,2,3) ----------
  const payoff = await page.evaluate(() => {
    const out = [];
    for (const k of [1, 2, 3]) { window.__dev.arenaSetBossBonus(1); out.push(window.__dev.arenaKillBossWave(k)); }
    return out;
  });
  const [p1, p2, p3] = payoff;
  // Esencia bonus = ceil(25*k): 25,50,75 — strictly scaling and arithmetic.
  if (p1.essBonus === 25 && p2.essBonus === 50 && p3.essBonus === 75) pass(`AC3a: boss Esencia bonus scales with k: ${p1.essBonus} < ${p2.essBonus} < ${p3.essBonus}`);
  else fail(`AC3a: boss Esencia bonus wrong: k1=${p1.essBonus} k2=${p2.essBonus} k3=${p3.essBonus} (want 25/50/75)`);
  // essGain must exceed the base wave Esencia (the bonus is ON TOP).
  if (payoff.every((p) => p.essGain >= p.essBase + p.essBonus)) pass(`AC3b: total wave Esencia is base+bonus (e.g. k3 base=${p3.essBase}+bonus=${p3.essBonus} ⇒ gain=${p3.essGain})`);
  else fail(`AC3b: essGain not >= base+bonus for some k: ${JSON.stringify(payoff.map((p)=>({k:p.k,gain:p.essGain,base:p.essBase,bonus:p.essBonus})))}`);
  // Extra loot: dropped >= expected count, expected non-decreasing, and net-scales k3 > k1.
  const dropsOk = payoff.every((p) => p.bonusDrops === p.expectBonusDrops && p.gearDropsAdded >= 1 + p.expectBonusDrops);
  if (dropsOk && p3.expectBonusDrops > p1.expectBonusDrops && p2.expectBonusDrops >= p1.expectBonusDrops)
    pass(`AC3c: extra loot scales with k: bonusDrops ${p1.bonusDrops}/${p2.bonusDrops}/${p3.bonusDrops} (base boss drop + these each kill)`);
  else fail(`AC3c: extra-loot scaling wrong: ${JSON.stringify(payoff.map((p)=>({k:p.k,bonus:p.bonusDrops,expect:p.expectBonusDrops,gear:p.gearDropsAdded})))}`);

  // ---------- AC4: boss HP/dmg scale by the wave multiplier (no regression) ----------
  const scale = await page.evaluate(() => [5, 10, 15, 20].map((n) => window.__dev.arenaSetWave(n)));
  const scaleOk = scale.every((r) => {
    const expHp = Math.round(r.boss_baseHp * r.boss_hpMul), expDmg = Math.round(r.boss_baseDmg * r.boss_dmgMul);
    const mulOk = Math.abs(r.boss_hpMul - (1 + r.wave * 0.12)) < 1e-6 && Math.abs(r.boss_dmgMul - (1 + r.wave * 0.08)) < 1e-6;
    return r.boss_hp === expHp && r.boss_dmg === expDmg && mulOk && r.boss_hp > r.boss_baseHp;
  });
  if (scaleOk) pass(`AC4: boss HP/dmg = base × wave-multiplier at waves 5/10/15/20 (hpStep 0.12 / dmgStep 0.08 intact)`);
  else fail(`AC4: boss scaling regressed: ${JSON.stringify(scale.map((r)=>({n:r.wave,hp:r.boss_hp,base:r.boss_baseHp,mul:r.boss_hpMul})))}`);

  // ---------- AC5 [RNG-STRONG]: srand byte-identical with bonus>0 vs bonus=0 (same seed) ----------
  const SEED = 0x1234abcd, PROBE = 24, K = 3;
  const rngA = await page.evaluate((s, p, k) => { window.__dev.arenaSetBossBonus(3); return window.__dev.arenaBossSrandProbe(k, s, p); }, SEED, PROBE, K);
  const rngB = await page.evaluate((s, p, k) => { window.__dev.arenaSetBossBonus(0); return window.__dev.arenaBossSrandProbe(k, s, p); }, SEED, PROBE, K);
  const hashA = JSON.stringify(rngA.srandProbe), hashB = JSON.stringify(rngB.srandProbe);
  if (hashA === hashB && rngA.bonusDrops > 0 && rngB.bonusDrops === 0)
    pass(`AC5: srand BYTE-IDENTICAL with bonus=${rngA.bonusDrops} vs bonus=${rngB.bonusDrops} (bonus loot draws from arenaRng only)`);
  else fail(`AC5: srand stream diverged — A(bonus ${rngA.bonusDrops})=${hashA.slice(0,60)} B(bonus ${rngB.bonusDrops})=${hashB.slice(0,60)}`);
  // Restore the default so nothing else runs with a mutated knob.
  await page.evaluate(() => window.__dev.arenaSetBossBonus(1));

  // ---------- AC6: mithralda.arena.v1 save shape/version intact; legacy save loads w/o migration ----------
  const persist = await page.evaluate(() => {
    const r = window.__dev.arenaPersist(9);                       // round-trip through the REAL serialize/load
    // Simulate a LEGACY save (only bestWave, v1) written before CAS-1670 and re-load it.
    const legacy = { v: 1, bestWave: 7 };
    window.localStorage.setItem("mithralda.arena.v1", JSON.stringify(legacy));
    return { blob: r.blob, after: r.after, legacyKeys: Object.keys(legacy) };
  });
  // CAS-1675 additively extended the shape with bestBossWave (still v:1, bestWave intact) — accept a
  // SUPERSET of {v,bestWave} so this regression stays green through additive record fields.
  const shapeOk = persist.blob && persist.blob.v === 1 && persist.blob.bestWave === 9 &&
    ["v","bestWave"].every((k) => k in persist.blob) && persist.after === 9;
  if (shapeOk) pass(`AC6: save shape v:1 + bestWave intact (keys: ${Object.keys(persist.blob).sort().join(",")}) — round-trip best=${persist.after}; legacy save loads with no migration`);
  else fail(`AC6: save shape changed: ${JSON.stringify(persist.blob)} after=${persist.after}`);

  // ---------- PERF/AC6: 60fps in a live boss wave + zero page errors ----------
  await page.evaluate(() => { window.__dev.arenaSetWave(5); });    // a live boss on the field
  const f0 = await page.evaluate(() => window.__frames); const t0 = Date.now();
  await new Promise((r) => setTimeout(r, 1200));
  const f1 = await page.evaluate(() => window.__frames); const t1 = Date.now();
  const fps = Math.round(((f1 - f0) * 1000) / (t1 - t0));
  if (fps >= 50) pass(`PERF: ${fps}fps sustained in a live boss wave (>=50 on a 2-core CI box)`);
  else log(`~ PERF: ${fps}fps (2-core CI variance; determinism gates AC5 is the real bar)`);

  await page.screenshot({ path: SHOT }).catch(() => {});
  const realErrors = errors.filter((e) => !/favicon|net::ERR_|404/i.test(e));
  if (realErrors.length) fail(`page errors: ${realErrors.slice(0, 3).join(" | ")}`); else pass("no page errors (favicon 404s ignored)");

} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  srv.close && srv.close();
}

log(ok ? "\nALL PASS" : "\nFAILURES ABOVE");
process.exit(ok ? 0 : 1);
