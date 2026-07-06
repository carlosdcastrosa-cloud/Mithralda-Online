// ---------------------------------------------------------------------------
// CAS-247 — ELITE AFFIXES headless harness. Boots the REAL game in headless Chromium and
// drives the new modifiers through the SAME sim paths the game runs (maybeAffix / applyAffix /
// hitEnemy / updateEnemies / killEnemy — no shortcut), asserting:
//   1) DATA: the 4 affixes (Swift/Armored/Vampiric/Volatile) exist with DISTINCT modifier
//      fields, and the spawn rate sits in the ~10-15% band (AC1).
//   2) ROLL RATE: rolling many eligible spawns through the REAL maybeAffix lands ~10-15%
//      affixed (AC1) — and is DETERMINISTIC: same seed → identical count + tally (AC3).
//   3) SCALE + SWIFT: a Swift elite is bigger (tpl.size bump) and FASTER, and its render gait
//      cadence scales by the SAME factor as its speed — steps stay natural (regression CAS-219/240, AC2).
//   4) ARMORED: a metallic elite SOAKS a fixed fraction of every hero hit (less dmg than a plain
//      mob taking the identical blow).
//   5) VAMPIRIC: when it LANDS a hit on the hero it leeches HP (its hp rises after a connect).
//   6) VOLATILE: its corpse ERUPTS an on-death AoE that damages the hero in radius — and NOT
//      when the hero is clear of the blast.
//   7) REWARD TIE-IN: an affixed mob pays MORE xp/gold and a higher Forja-gear chance (feeds CAS-237/243).
//   8) PERF: 60fps held with affixed mobs live.  9) 0 JS errors.
//
// Run: npm run cas247   (or: node tools/cas247-affixes.mjs)
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
    document.getElementById("nameInput").value = "AffixBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

async function until(page, fn, pred, ms = 5000) {
  const t0 = Date.now(); let v = null;
  while (Date.now() - t0 < ms) { v = await page.evaluate(fn); if (v && pred(v)) return v; await wait(50); }
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

  // (1) DATA — 4 distinct affixes + rate in the ~10-15% band.
  const meta = await page.evaluate(() => window.__dev.affixMeta());
  const byId = Object.fromEntries(meta.defs.map((d) => [d.id, d]));
  // CAS-1586: the pool grew to 5 with the frost (Aura Gélida) control affix; the original 4 must
  // stay byte-intact (AC-5) and frost must carry its distinct data-driven aura fields (AC-1).
  const distinct = meta.ids.length === 5
    && byId.swift && byId.swift.spdMul > 1 && byId.swift.gaitMul === byId.swift.spdMul
    && byId.armored && byId.armored.dmgReduce > 0
    && byId.vampiric && byId.vampiric.lifesteal > 0 && byId.vampiric.melee === true
    && byId.volatile && byId.volatile.blast > 0
    && byId.frost && byId.frost.auraR > 0 && byId.frost.auraSlow > 0 && byId.frost.auraSlow < 1 && !byId.frost.melee;
  if (distinct) pass(`[DATA] 5 distinct affixes present (swift/armored/vampiric/volatile/frost)`);
  else fail(`[DATA] affix set missing/not distinct: ${JSON.stringify(meta.defs)}`);
  if (meta.rate >= 0.10 && meta.rate <= 0.15) pass(`[DATA] spawn rate ${(meta.rate * 100).toFixed(0)}% within the 10-15% band`);
  else fail(`[DATA] spawn rate ${meta.rate} outside 10-15%`);

  // (2) ROLL RATE + DETERMINISM — many eligible spawns through the REAL maybeAffix.
  const r1 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  const r2 = await page.evaluate(() => { window.__dev.seed(4242); return window.__dev.affixRollRate(3000, "skeleton"); });
  if (r1.rate >= 0.09 && r1.rate <= 0.17) pass(`[RATE] ${r1.affixed}/${r1.n} rolled an affix = ${(r1.rate * 100).toFixed(1)}% (tally ${JSON.stringify(r1.tally)})`);
  else fail(`[RATE] ${r1.rate} outside ~10-15% expectation`);
  if (r1.affixed === r2.affixed && JSON.stringify(r1.tally) === JSON.stringify(r2.tally))
    pass(`[DET] same seed → identical roll (${r1.affixed} affixed, deterministic / server-safe)`);
  else fail(`[DET] affix roll NOT deterministic: ${r1.affixed} vs ${r2.affixed}`);

  // (3) SCALE + SWIFT cadence-coupling (CAS-219/240 guard).
  const sw = await page.evaluate(() => window.__dev.affixArena("swift", "wolf", 120));
  const spdRatio = sw.mod.spd / sw.base.spd;
  if (sw.mod.spd > sw.base.spd && sw.mod.size >= sw.base.size && Math.abs(sw.affixGait - spdRatio) < 0.08)
    pass(`[SWIFT] faster (spd ${sw.base.spd}→${sw.mod.spd}) + bigger (size ${sw.base.size}→${sw.mod.size}); gait×${sw.affixGait} tracks speed×${spdRatio.toFixed(2)} (cadence stays natural)`);
  else fail(`[SWIFT] speed/gait/scale not coupled: ${JSON.stringify(sw)}`);

  // (4) ARMORED soak — identical blow, plain vs armored.
  await page.evaluate(() => window.__dev.affixArena(null, "orc", 120));   // plain baseline
  const takenPlain = (await page.evaluate(() => window.__dev.affixHit(60))).taken;
  await page.evaluate(() => window.__dev.affixArena("armored", "orc", 120));
  const takenArm = (await page.evaluate(() => window.__dev.affixHit(60))).taken;
  if (takenArm < takenPlain && Math.abs(takenArm / takenPlain - 0.55) < 0.08)
    pass(`[ARMORED] soaked the blow: plain took ${takenPlain}, armored took ${takenArm} (~45% reduction)`);
  else fail(`[ARMORED] damage reduction off: plain ${takenPlain}, armored ${takenArm}`);

  // (5) VAMPIRIC leech-on-hit — pre-damage the elite, then let it connect; its hp must rise.
  await page.evaluate(() => window.__dev.affixArena("vampiric", "orc", 30)); // in melee range
  await page.evaluate(() => window.__dev.affixHit(120));                     // wound it below max
  const hpAfterWound = (await page.evaluate(() => window.__dev.affixSnap())).hp;
  const fed = await until(page, () => window.__dev.affixSnap(), (s) => s.heroDmgTaken > 0 && s.hp > hpAfterWound, 6000);
  if (fed && fed.heroDmgTaken > 0 && fed.hp > hpAfterWound)
    pass(`[VAMPIRIC] leeched on a connect: hp ${hpAfterWound}→${fed.hp} after landing a hit (hero took ${fed.heroDmgTaken})`);
  else fail(`[VAMPIRIC] no heal-on-hit observed: woundedHp=${hpAfterWound}, snap=${JSON.stringify(fed)}`);

  // (6) VOLATILE on-death AoE — erupts in radius, not when clear.
  await page.evaluate(() => window.__dev.affixArena("volatile", "skeleton", 30)); // inside blast 84
  const burstIn = (await page.evaluate(() => window.__dev.affixKill())).heroDmgTaken;
  await page.evaluate(() => window.__dev.affixArena("volatile", "skeleton", 320)); // clear of blast
  const burstOut = (await page.evaluate(() => window.__dev.affixKill())).heroDmgTaken;
  if (burstIn > 0 && burstOut === 0)
    pass(`[VOLATILE] corpse blast hit the hero in radius (${burstIn}) and missed when clear (${burstOut})`);
  else fail(`[VOLATILE] on-death AoE wrong: inRange=${burstIn}, clear=${burstOut}`);

  // (7) REWARD TIE-IN — affixed pays more (xp/gold/gear chance) → feeds Forja + return-hook.
  const rw = await page.evaluate(() => window.__dev.affixArena("armored", "skeleton", 120));
  const gold = rw.mod.gold[1] > rw.base.gold[1], xp = rw.mod.xp > rw.base.xp, gear = rw.mod.gearChance > rw.base.gearChance;
  if (gold && xp && gear)
    pass(`[REWARD] elite pays more — xp ${rw.base.xp}→${rw.mod.xp}, gold↑, Forja-gear ${rw.base.gearChance}→${rw.mod.gearChance}`);
  else fail(`[REWARD] reward boosts missing: ${JSON.stringify(rw)}`);

  // (8) PERF — affixed mobs live in a real zone.
  await page.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(7); });
  await wait(1200);
  const fpsA = await sampleFps(page, 1000), fpsB = await sampleFps(page, 1000);
  if (Math.min(fpsA, fpsB) >= 58) pass(`[PERF] 60fps held (${fpsA}, ${fpsB} fps)`);
  else fail(`[PERF] fps dropped: ${fpsA}, ${fpsB}`);

  // (9) zero JS errors.
  if (errors.length === 0) pass("[ERR] zero page errors");
  else fail(`[ERR] ${errors.length} page error(s): ${errors.slice(0, 4).join(" | ")}`);

  log("");
  log(ok ? "✓ CAS-247 elite-affixes self-test passed." : "✗ CAS-247 self-test FAILED.");
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
}
process.exit(ok ? 0 : 1);
