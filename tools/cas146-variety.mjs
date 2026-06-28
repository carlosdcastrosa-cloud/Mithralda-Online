// ---------------------------------------------------------------------------
// CAS-146 — enemy variety + elite-ambush headless harness. Boots the REAL game in
// headless Chromium and drives the new content through the SAME sim AI/loot paths the
// game runs (no shortcut around updateEnemies / spawnAmbush / killEnemy), asserting:
//   1) DATA: the new `volatile` archetype exists with distinct fields (fast, fragile,
//      high-dmg, carries a `blast` radius) — a genuinely new combat verb — AC "variedad".
//   2) VOLATILE DETONATES + SELF-DESTRUCTS: dropped in range it telegraphs (windup),
//      erupts a radial blast that DAMAGES the hero, then is GONE (one-shot bomber).
//   3) VOLATILE is DODGEABLE: repositioning OUT of the blast during the windup avoids it.
//   4) SURFACED: the volatile is in a real zone spawner pool (caves), so it shows up in play.
//   5) ELITE AMBUSH: forcing the event spawns a trash PACK + one promoted ELITE whose
//      hp/dmg are MULTIPLES of its base (real promotion, out-scales the zone trash).
//   6) AMBUSH FEEDS ECONOMY: killing the elite GUARANTEES an elevated gear drop + bonus
//      gold (the merchant gold-sink), via the real killEnemy elite branch.
//   7) 60 FPS held with a full ambush pack live — perf budget.
//   8) 0 JS errors across the run.
//
// Run: npm run variety   (or: node tools/cas146-variety.mjs)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";

const log = (m) => console.log(m);
let ok = true;
const fail = (m) => { ok = false; console.error(`✖ ${m}`); };
const pass = (m) => log(`✔ ${m}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }

const srv = await startServer();
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "VarietyBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// Poll `fn` until `pred` or timeout; returns the last value seen.
async function until(page, fn, pred, ms = 4000) {
  const t0 = Date.now(); let v = null;
  while (Date.now() - t0 < ms) {
    v = await page.evaluate(fn);
    if (v && pred(v)) return v;
    await wait(50);
  }
  return v;
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

  // Register BEFORE goto so it's active on the document that actually runs the game loop:
  // clear any persisted save (clean first-run) + instrument the real rAF cadence for fps.
  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (1) DATA — the new volatile archetype: fast, fragile, hard-hitting, carries a blast radius.
  const meta = await page.evaluate(() => ({
    volatile: window.__dev.archMeta("volatile"),
    orc: window.__dev.archMeta("orc"), skeleton: window.__dev.archMeta("skeleton"),
  }));
  // archMeta doesn't expose `blast`; read it from a live mob instead in step 2. Here assert
  // the archetype tag + the distinct stat shape (fast spd, low hp, high dmg vs a trash chump).
  if (meta.volatile && meta.volatile.arch === "volatile"
      && meta.volatile.spd >= 140 && meta.volatile.hp <= 40 && meta.volatile.dmg >= 20)
    pass(`[DATA] volatile archetype present + distinct (spd ${meta.volatile.spd}, hp ${meta.volatile.hp}, dmg ${meta.volatile.dmg})`);
  else fail(`[DATA] volatile archetype missing/not distinct: ${JSON.stringify(meta.volatile)}`);

  // (2) VOLATILE DETONATES + SELF-DESTRUCTS — drop one just outside strike range; the real
  // AI closes, telegraphs (windup), erupts a blast that DAMAGES the hero, then it's GONE.
  // Probe runs in TOWN (no zone spawner) so the single bomber is never masked by live spawns.
  await page.evaluate(() => { window.__dev.tpZone("town"); window.__dev.seed(5); });
  await page.evaluate(() => window.__dev.volatileProbe(60)); // 60 > range 40 → it closes first
  const tele = await until(page, () => window.__dev.volatileSnap(), (s) => s.state === "windup", 4000);
  if (tele && tele.state === "windup" && tele.blast > 0)
    pass(`[VOLATILE] telegraphed its blast (windup, radius ${tele.blast}px)`);
  else fail(`[VOLATILE] never entered a telegraphed windup: ${JSON.stringify(tele)}`);
  const boom = await until(page, () => window.__dev.volatileSnap(), (s) => !s.alive, 3000);
  if (boom && !boom.alive && boom.heroDmgTaken > 0)
    pass(`[VOLATILE] detonated (hero took ${boom.heroDmgTaken}) and SELF-DESTRUCTED (probe gone)`);
  else fail(`[VOLATILE] did not detonate+die as a bomber: ${JSON.stringify(boom)}`);

  // (3) DODGEABLE — drop one in range, then the instant it commits the windup step the hero
  // far outside the blast; the detonation must then deal NO damage (the ring was a real tell).
  await page.evaluate(() => { window.__dev.tpZone("town"); window.__dev.seed(5); });
  await page.evaluate(() => window.__dev.volatileProbe(34)); // in range → immediate windup
  const w2 = await until(page, () => window.__dev.volatileSnap(), (s) => s.state === "windup", 4000);
  const dmgAtWindup = await page.evaluate(() => { const e = window.__dev; e.archMoveHero(260, 0); return e.volatileSnap().heroDmgTaken; });
  const gone = await until(page, () => window.__dev.volatileSnap(), (s) => !s.alive, 3000);
  if (w2 && gone && !gone.alive && gone.heroDmgTaken === dmgAtWindup)
    pass(`[VOLATILE] stepping out of the blast AVOIDED it (dmg stayed ${dmgAtWindup})`);
  else fail(`[VOLATILE] dodge out of blast still took damage: before=${dmgAtWindup}, after=${gone && gone.heroDmgTaken}`);

  // (4) SURFACED — the volatile is in a real zone spawner pool so it appears during play.
  const pools = await page.evaluate(() => window.__dev.zonePools());
  if (pools.caves && pools.caves.includes("volatile"))
    pass(`[POOL] volatile is wired into the caves spawner pool: [${pools.caves.join(", ")}]`);
  else fail(`[POOL] volatile not in any natural spawner pool: ${JSON.stringify(pools)}`);

  // (5) ELITE AMBUSH — force the event in caves; a trash PACK + one promoted ELITE drop in.
  await page.evaluate(() => { window.__dev.tpZone("caves"); window.__dev.seed(9); });
  const amb = await page.evaluate(() => window.__dev.forceAmbush());
  if (amb && amb.active && amb.packCount >= 2)
    pass(`[AMBUSH] event fired: elite '${amb.type}' + a pack of ${amb.packCount} trash (zone ${amb.zone})`);
  else fail(`[AMBUSH] event did not spawn a pack+elite: ${JSON.stringify(amb)}`);
  const snap = await page.evaluate(() => window.__dev.ambushSnap());
  if (snap && snap.elite && snap.elite.hp > snap.elite.baseHp * 4 && snap.elite.dmg > snap.elite.baseDmg)
    pass(`[AMBUSH] elite is a real promotion — hp ${snap.elite.hp} (base ${snap.elite.baseHp}), dmg ${snap.elite.dmg} (base ${snap.elite.baseDmg})`);
  else fail(`[AMBUSH] elite not promoted over its base: ${JSON.stringify(snap.elite)}`);

  // (6) FEEDS ECONOMY — killing the elite GUARANTEES an elevated gear drop + bonus gold.
  const drops = await page.evaluate(() => window.__dev.eliteSpawnKill("orc", "caves"));
  const gear = drops.find((d) => d.kind === "gear");
  const bonusGold = drops.find((d) => d.kind === "gold" && d.amt >= 30); // the elite bonus (not the trash roll)
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3 };
  if (gear && bonusGold && RANK[gear.rarity] >= 1)
    pass(`[ECONOMY] elite kill guaranteed a ${gear.rarity} gear (tier ${gear.tier}) + ${bonusGold.amt} bonus gold`);
  else fail(`[ECONOMY] elite kill did not yield guaranteed elevated loot + gold: ${JSON.stringify(drops)}`);

  // (7) PERF — sample fps with a full ambush pack live in the zone.
  await page.evaluate(() => { window.__dev.tpZone("caves"); window.__dev.seed(2); window.__dev.forceAmbush(); });
  const fpsA = await sampleFps(page, 1000);
  const fpsB = await sampleFps(page, 1000);
  const minFps = Math.min(fpsA, fpsB);
  if (minFps >= 58) pass(`[PERF] 60fps held with an ambush pack live (${fpsA}, ${fpsB} fps)`);
  else fail(`[PERF] fps dropped with the ambush pack: ${fpsA}, ${fpsB}`);

  // (8) zero JS errors.
  if (errors.length === 0) pass("[ERR] zero page errors");
  else fail(`[ERR] ${errors.length} page error(s): ${errors.slice(0, 4).join(" | ")}`);

  log("");
  log(ok ? "✓ CAS-146 variety + elite-ambush self-test passed." : "✗ CAS-146 self-test FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
process.exit(ok ? 0 : 1);
