// ---------------------------------------------------------------------------
// Headless harness for the read-and-react combat ARCHETYPES (CAS-115). Boots the
// REAL game in headless Chromium and drives the new behaviour through the SAME
// updateEnemies AI the game runs (no shortcut around the state machine), asserting:
//   1) DATA: >=3 distinct archetypes (rusher/caster/brute) exist with distinct
//      behaviour fields, and the dangerous ones (brute) out-reward the chumps — AC1/AC3.
//   2) CASTER KITES: when the hero closes inside `kite`, the caster RETREATS (distance
//      grows); parked in the band it fires telegraphed projectiles — AC1/AC2.
//   3) RUSHER LUNGES: after a short telegraph it dashes forward and the hit connects
//      (hero takes damage), closing a large gap in the strike window — AC1/AC2.
//   4) BRUTE GROUND-SLAM: a hero standing inside the `aoe` radius eats the blow; a hero
//      that repositions OUT of the radius during the windup takes NO damage — AC2 (the
//      telegraph is dodgeable by positioning).
//   5) 60 FPS held with a full mixed archetype pack live — AC4.
//   6) 0 JS errors across the run — AC5.
//
// Run: npm run arch   (or: node tools/archetypes.mjs)
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
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {} });
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 15000 });
  if (await page.evaluate(() => window.__dev.scene() !== "menu")) await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__dev.scene && window.__dev.scene() === 'menu'", { timeout: 15000 });
  await page.evaluate(() => {
    document.getElementById("nameInput").value = "ArchBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// Poll archSnap() until `pred(snap)` or timeout; returns the last snapshot seen.
async function until(page, pred, ms = 4000) {
  const t0 = Date.now(); let snap = null;
  while (Date.now() - t0 < ms) {
    snap = await page.evaluate(() => window.__dev.archSnap());
    if (snap && pred(snap)) return snap;
    await wait(50);
  }
  return snap;
}

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console.error: ${m.text()}`); });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (1) DATA — three distinct archetypes with distinct behaviour fields + danger reward.
  const meta = await page.evaluate(() => ({
    wolf: window.__dev.archMeta("wolf"), bat: window.__dev.archMeta("bat"), bandit: window.__dev.archMeta("bandit"),
    spearman: window.__dev.archMeta("spearman"), mage: window.__dev.archMeta("mage"), wraith: window.__dev.archMeta("wraith"),
    orc: window.__dev.archMeta("orc"), moose: window.__dev.archMeta("moose"),
    rat: window.__dev.archMeta("rat"), skeleton: window.__dev.archMeta("skeleton"),
  }));
  const archset = new Set([meta.wolf.arch, meta.mage.arch, meta.orc.arch].filter(Boolean));
  if (archset.size >= 3 && archset.has("rusher") && archset.has("caster") && archset.has("brute"))
    pass(`[DATA] 3 distinct archetypes present: ${[...archset].join(", ")}`);
  else fail(`[DATA] expected rusher+caster+brute, got ${[...archset].join(", ")}`);
  if (meta.wolf.arch === "rusher" && meta.wolf.lunge > 0 && meta.bandit.lunge > 0 && meta.bat.lunge > 0)
    pass(`[DATA] rushers carry a lunge (wolf ${meta.wolf.lunge}, bandit ${meta.bandit.lunge}, bat ${meta.bat.lunge})`);
  else fail(`[DATA] rusher lunge fields missing: ${JSON.stringify([meta.wolf, meta.bandit, meta.bat])}`);
  if (meta.mage.arch === "caster" && meta.mage.kite > 0 && meta.mage.ranged && meta.wraith.kite > 0 && meta.spearman.kite > 0)
    pass(`[DATA] casters carry a kite distance (mage ${meta.mage.kite}, wraith ${meta.wraith.kite}, spearman ${meta.spearman.kite})`);
  else fail(`[DATA] caster kite fields missing: ${JSON.stringify([meta.mage, meta.wraith, meta.spearman])}`);
  if (meta.orc.arch === "brute" && meta.orc.aoe > 0 && meta.moose.aoe > 0)
    pass(`[DATA] brutes carry an aoe radius (orc ${meta.orc.aoe}, moose ${meta.moose.aoe})`);
  else fail(`[DATA] brute aoe fields missing: ${JSON.stringify([meta.orc, meta.moose])}`);
  // danger -> reward: the brute (slow tank, biggest hit) out-rewards the basic chump it
  // shares a zone with, and out-hits everything.
  const bruteGold = meta.orc.gold[1], skelGold = meta.skeleton.gold[1];
  if (meta.orc.xp > meta.skeleton.xp && bruteGold > skelGold && meta.orc.dmg >= meta.skeleton.dmg && meta.moose.xp > meta.bandit.xp)
    pass(`[DATA] danger scales reward (brute orc xp${meta.orc.xp}/g${bruteGold} > chump skel xp${meta.skeleton.xp}/g${skelGold}; moose xp${meta.moose.xp} > bandit ${meta.bandit.xp})`);
  else fail(`[DATA] reward not scaled by danger: ${JSON.stringify(meta)}`);

  // (2) CASTER KITES — drop a caster INSIDE its kite radius; the real AI must back away.
  await page.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(11); });
  const kite0 = await page.evaluate(() => window.__dev.archArena("wraith", 70, 0)); // 70 < kite 162 → retreat
  const kStart = await until(page, (s) => s && s.dist > 0, 1500);
  await wait(1400);
  const kEnd = await page.evaluate(() => window.__dev.archSnap());
  if (kite0 && kStart && kEnd && kEnd.dist > kStart.dist + 20)
    pass(`[CASTER] kited away from the crowding hero (dist ${kStart.dist} → ${kEnd.dist})`);
  else fail(`[CASTER] caster did not retreat: start ${kStart && kStart.dist}, end ${kEnd && kEnd.dist}`);
  // park it in the firing band → it should sling telegraphed projectiles.
  await page.evaluate(() => window.__dev.archMoveHero(195, 0)); // 195 in [kite162, range230]
  const fired = await until(page, (s) => s && s.enemyProj > 0, 2500);
  if (fired && fired.enemyProj > 0) pass(`[CASTER] fired a telegraphed projectile from the band (${fired.enemyProj} live)`);
  else fail(`[CASTER] caster did not fire from the band: ${JSON.stringify(fired)}`);

  // (3) RUSHER LUNGES — drop a rusher beyond melee range; it closes + the hit lands.
  await page.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(7); });
  const r0 = await page.evaluate(() => window.__dev.archArena("wolf", 120, 0)); // 120 >> range 42
  const rHit = await until(page, (s) => s && s.heroDmgTaken > 0, 4000);
  if (r0 && rHit && rHit.heroDmgTaken > 0 && rHit.dist <= meta.wolf.lunge)
    pass(`[RUSHER] lunged in from range and connected (hero took ${rHit.heroDmgTaken}, closed to ${rHit.dist}px)`);
  else fail(`[RUSHER] rusher lunge did not connect: ${JSON.stringify(rHit)}`);

  // (4a) BRUTE GROUND-SLAM HITS a hero standing inside the AoE radius.
  await page.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(3); });
  await page.evaluate(() => window.__dev.archArena("orc", 28, 0)); // 28 < aoe 60 and < range → it slams
  const bHit = await until(page, (s) => s && s.heroDmgTaken > 0, 4000);
  if (bHit && bHit.heroDmgTaken > 0)
    pass(`[BRUTE] ground-slam hit the hero inside the radius (took ${bHit.heroDmgTaken})`);
  else fail(`[BRUTE] brute slam never landed on an in-radius hero: ${JSON.stringify(bHit)}`);

  // (4b) DODGEABLE — reposition OUT of the radius during the windup → that slam misses.
  await page.evaluate(() => { window.__dev.tpZone("forest"); window.__dev.seed(3); });
  await page.evaluate(() => window.__dev.archArena("orc", 28, 0));
  const wind = await until(page, (s) => s && s.state === "windup", 4000);
  // step out to 150px (> aoe 60 + size) the instant the telegraph appears, then ride out the strike.
  const dmgAtWindup = await page.evaluate(() => { window.__dev.archMoveHero(150, 0); return window.__dev.archSnap().heroDmgTaken; });
  await until(page, (s) => s && (s.state === "recover" || s.state === "chase"), 2000);
  await wait(250);
  const dodged = await page.evaluate(() => window.__dev.archSnap());
  if (wind && wind.state === "windup" && dodged && dodged.heroDmgTaken === dmgAtWindup)
    pass(`[BRUTE] stepping out of the telegraphed radius AVOIDED the slam (dmg stayed ${dmgAtWindup})`);
  else fail(`[BRUTE] dodge out of radius still took damage: windup=${wind && wind.state}, before=${dmgAtWindup}, after=${dodged && dodged.heroDmgTaken}`);

  // (5) 60 FPS held with a full mixed-archetype pack live around the hero.
  await page.evaluate(() => {
    window.__dev.tpZone("abyss");
    window.__dev.archArena("orc", 60, 40);
    ["wraith", "mage", "wolf", "bandit", "moose", "bat"].forEach((t, i) =>
      window.__dev.spawn(t, 80 * Math.cos(i), 80 * Math.sin(i)));
  });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps with a full mixed archetype pack live`);
  else fail(`[FPS] dropped to ${fps} fps under the mixed pack`);

  // (6) zero JS errors
  if (errors.length === 0) pass("[ERR] zero page errors across the run");
  else fail(`[ERR] ${errors.length} page errors:\n   ${errors.join("\n   ")}`);

} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  srv.stop && srv.stop();
}

log(ok ? "\n✓ Archetype harness passed." : "\n✗ Archetype harness FAILED.");
process.exit(ok ? 0 : 1);
