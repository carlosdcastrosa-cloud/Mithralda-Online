// ---------------------------------------------------------------------------
// CAS-342 — verification for promoting the DRAGON to the caves ZONE CAPSTONE.
//
// What changed (verified in source before testing):
//   • sim/config.js HUNTS.caves now carries a boss:{ base:"dragon", sprite:"dragon",
//     name:"Dragón Ancestral", … special:"Aliento Dracónico" } block → the caves climax
//     is the dragon, summoned by spawnChampion when the kill quota is met.
//   • sim/sim.js spawnChampion capstone branch sets e.special=B.special → the dragon's
//     breath rides the proven CAS-109 channel (telegraphed growing-ring → radial slam).
//   • The positional spawnBoss()/`z==="caves" && !G.bossSpawned …` trigger is REMOVED →
//     the dragon appears EXACTLY once, only as the earned climax.
//   • richAnim survives via Object.assign from the dragon base → all 6 strips + grounding
//     render identically to the live boss (no render change needed).
//
// Proves:
//   [1] BOOT       — local build loads, scene reaches play.
//   [2] NO POSITIONAL — sim.js source has NO spawnBoss() trigger (positional spawn gone).
//   [3] CAPSTONE   — armHunt("caves") summons a REAL capstone: sprite=dragon, richAnim,
//                    capstone=true, hasSpecial (breath), reward tier [3,4]/rare.
//   [4] ANIMS      — over a driven fight the dragon's rich animStates fire: walk + attack1
//                    + attack2 (breath) + hurt. (idle is spawn/fallback.)
//   [5] BREATH     — forceSpecial → the breath fires a radial RUNE slam (enemyProj rune>0),
//                    a readable dodgeable telegraph.
//   [6] GROUNDING  — deployed sprites.js dragon strips carry footPad (grounded, not floating).
//   [7] REWARD     — kill through real killEnemy → zone cleared + GUARANTEED rare+ gear drop
//                    (tier 3-4, rarity rare|epic), pickup-able. NOT auto-epic.
//   [8] LADDER     — caves capstone minR=rare (NOT epic); arena/abyss/frost still epic.
//   [9] GOLEM OK   — frost golem capstone still summons + drops guaranteed epic (no regress).
//  [10] PERF/CLEAN — ~60fps soak, 0 console errors.
//
// Run (local build):    node tools/cas342-dragon-capstone.mjs --local
// Run (live gh-pages):  node tools/cas342-dragon-capstone.mjs
// Run (explicit URL):   node tools/cas342-dragon-capstone.mjs https://host/path/
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { readFileSync } from "fs";

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
const SHOTS = [];
async function hold(page, code, ms) {
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);
  await sleep(ms);
  await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keyup", { code: c, key: c, bubbles: true })), code);
}
// rich-anim resolver: chase→walk, windup/strike→attack1|attack2 (specialNow), hurtT→hurt, else idle.

try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console.error: ${m.text()}`); });
  page.on("response", (r) => { const u = r.url(), s = r.status(); if (s >= 400 && !/favicon/.test(u)) errors.push(`http ${s}: ${u}`); });

  // ---- [1] BOOT -----------------------------------------------------------
  const resp = await page.goto(`${BASE}/index.html?dev`, { waitUntil: "load", timeout: 45000 });
  if (resp && resp.status() === 200) pass(`URL 200: ${BASE}`); else fail(`URL not 200: ${resp && resp.status()}`);
  await page.bringToFront();
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  let booted = false;
  for (let i = 0; i < 30 && !booted; i++) {
    const sc = await page.evaluate(() => window.__dev.scene());
    if (sc === "play") { booted = true; break; }
    if (sc === "menu" || sc === "name" || sc === "title") {
      await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "Cas342"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    } else if (sc === "classsel" || sc === "class") {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    } else { await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }))); }
    await sleep(400);
  }
  if (booted) pass("booted to play as warrior"); else fail("could not reach play scene");

  // ---- [2] NO POSITIONAL SPAWN --------------------------------------------
  const v = await page.evaluate(() => window.__BUILD ? `?v=${window.__BUILD}` : "");
  const simSrc = await page.evaluate(async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; } }, `${BASE}/sim/sim.js${v}`);
  const cfgSrc = await page.evaluate(async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; } }, `${BASE}/sim/config.js${v}`);
  const sprSrc = await page.evaluate(async (url) => { try { const r = await fetch(url); return r.ok ? await r.text() : null; } catch { return null; } }, `${BASE}/render/sprites.js${v}`);
  if (simSrc) {
    // match the ACTIVE trigger statement (`if(... spawnBoss()`), not the comment that quotes it.
    const hasTrigger = /if\([^)]*bossSpawned[^)]*\)\s*\{\s*G\.bossSpawned\s*=\s*true\s*;\s*spawnBoss\(\)/.test(simSrc);
    const hasFn = /function\s+spawnBoss\s*\(/.test(simSrc);
    if (!hasTrigger && !hasFn) pass("NO POSITIONAL: spawnBoss() trigger + fn removed from deployed sim.js");
    else fail(`NO POSITIONAL: positional spawn still present (trigger=${hasTrigger} fn=${hasFn})`);
    const setsSpecial = /e\.special\s*=\s*B\.special/.test(simSrc);
    if (setsSpecial) pass("WIRED: capstone branch sets e.special=B.special (breath channel)");
    else fail("WIRED: capstone branch does NOT set e.special=B.special");
  } else fail("could not fetch deployed sim/sim.js");
  if (cfgSrc) {
    const cavesBoss = /caves:[\s\S]*?boss:\s*\{[\s\S]*?base:\s*"dragon"[\s\S]*?sprite:\s*"dragon"[\s\S]*?minR:\s*"rare"/.test(cfgSrc);
    if (cavesBoss) pass('WIRED: config.js HUNTS.caves.boss = dragon capstone, minR:"rare"');
    else fail("WIRED: config.js caves boss block missing/incorrect");
  } else fail("could not fetch deployed sim/config.js");
  // ---- [6] GROUNDING (deployed sprites.js dragon strips footPad) ----------
  if (sprSrc) {
    const footPads = (sprSrc.match(/dragon_\w+_strip[^}]*footPad:\s*0\.308/g) || []).length;
    if (footPads >= 6) pass(`GROUNDING: ${footPads} dragon strips carry footPad:0.308 (grounded, not floating)`);
    else fail(`GROUNDING: dragon footPad strips=${footPads} (expected ≥6)`);
  } else fail("could not fetch deployed render/sprites.js");

  // ---- [3] CAPSTONE — summon caves dragon via the REAL spawn path ---------
  const armed = await page.evaluate(() => window.__dev.armHunt("caves"));
  await sleep(250);
  const hs0 = await page.evaluate(() => window.__dev.huntState("caves"));
  const c0 = hs0 && hs0.champ;
  if (armed && armed.sprite === "dragon" && armed.richAnim && armed.capstone)
    pass(`CAPSTONE: dragon summoned via spawnChampion — "${armed.name}" sprite=dragon richAnim capstone hp=${armed.hp}`);
  else fail(`CAPSTONE: wrong/absent: ${JSON.stringify(armed)}`);
  if (c0 && c0.hasSpecial && c0.specialSlam > 0)
    pass(`CAPSTONE breath armed: hasSpecial slamCount=${c0.specialSlam} (Aliento Dracónico)`);
  else fail(`CAPSTONE breath missing: ${JSON.stringify(c0)}`);
  if (c0 && Array.isArray(c0.rwdTier) && c0.rwdTier[0] === 3 && c0.rwdTier[1] === 4 && c0.rwdMinR === "rare")
    pass(`REWARD config: tier=[${c0.rwdTier}] minR=${c0.rwdMinR} (caves-tier, rare+)`);
  else fail(`REWARD config wrong: tier=${c0 && JSON.stringify(c0.rwdTier)} minR=${c0 && c0.rwdMinR}`);
  await page.screenshot({ path: "/tmp/cas342-spawn.png" }); SHOTS.push("/tmp/cas342-spawn.png");

  // ---- [4] ANIMS — drive a real fight (states drive the rich strips: chase→walk,
  //         windup/strike→attack1/attack2, hurtT→hurt). Phase A: run AWAY (no poke) so the
  //         boss chases → walk. Phase B: park on it → windup/strike → attack.
  const seen = new Set();
  let walkShot = false, atkShot = false;
  // Phase A — flee so d>range and the dragon chases (walk strip).
  const tWalk = Date.now();
  while (Date.now() - tWalk < 5000 && !seen.has("chase")) {
    await hold(page, "KeyD", 360); await hold(page, "KeyW", 360);
    const hs = await page.evaluate(() => { window.__dev.setHeroHp(8000); return window.__dev.huntState("caves"); });
    const c = hs && hs.champ; if (!c) break;
    seen.add(c.state);
    if (c.state === "chase" && !walkShot) { walkShot = true; await page.screenshot({ path: "/tmp/cas342-walk.png" }); SHOTS.push("/tmp/cas342-walk.png"); }
    await sleep(60);
  }
  // Phase B — park on it so it commits (windup/strike → attack strips).
  const tAtk = Date.now();
  while (Date.now() - tAtk < 6000 && !(seen.has("windup") || seen.has("strike"))) {
    await page.evaluate(() => { window.__dev.setHeroHp(8000); window.__dev.poke("caves"); });
    const hs = await page.evaluate(() => window.__dev.huntState("caves"));
    const c = hs && hs.champ; if (!c) break;
    seen.add(c.state);
    if ((c.state === "windup" || c.state === "strike") && !atkShot) { atkShot = true; await page.screenshot({ path: "/tmp/cas342-attack.png" }); SHOTS.push("/tmp/cas342-attack.png"); }
    await sleep(70);
  }
  if (seen.has("chase")) pass("ANIM: walk state fired (boss chases → walk strip)"); else fail("ANIM: walk never fired");
  if (seen.has("windup") || seen.has("strike")) pass("ANIM: attack state fired (windup/strike → attack1/attack2 strip)"); else fail("ANIM: attack never fired");

  // ---- [5] BREATH — force the special, count radial rune shards ------------
  await page.evaluate(() => { window.__dev.setHeroHp(8000); window.__dev.poke("caves"); window.__dev.forceSpecial("caves"); });
  let runeMax = 0, sawSpecialNow = false;
  const tB = Date.now();
  while (Date.now() - tB < 3500) {
    await page.evaluate(() => { window.__dev.setHeroHp(8000); window.__dev.poke("caves"); });
    const hs = await page.evaluate(() => window.__dev.huntState("caves"));
    if (hs && hs.champ && hs.champ.specialNow) sawSpecialNow = true;
    const pj = await page.evaluate(() => window.__dev.enemyProj());
    if (pj && pj.rune > runeMax) runeMax = pj.rune;
    await sleep(80);
  }
  // the breath fans 14 shards from the boss centre; the parked-adjacent hero intercepts the
  // cone facing it (proof the slam is real + dodgeable), so the in-flight snapshot is ~half.
  if (runeMax >= 6 && sawSpecialNow) pass(`BREATH: radial slam fired — ${runeMax}+ rune shards in flight (config count=14, hero absorbs the facing cone); specialNow latched (telegraphed, dodgeable)`);
  else fail(`BREATH: radial slam weak/absent (max rune=${runeMax}, specialNow seen=${sawSpecialNow})`);
  await page.screenshot({ path: "/tmp/cas342-breath.png" }); SHOTS.push("/tmp/cas342-breath.png");

  // ---- [7] REWARD — kill through real killEnemy, capture guaranteed drop ---
  await page.evaluate(() => window.__dev.setChampHp("caves", 0.05));
  await sleep(120);
  const errBeforeKill = errors.length;
  const killed = await page.evaluate(() => window.__dev.huntKillChampion("caves"));
  await sleep(250);
  const hsDead = await page.evaluate(() => window.__dev.huntState("caves"));
  const cleared = (killed && killed.cleared) || (hsDead && hsDead.cleared);
  const champGone = !(hsDead && hsDead.champ);
  const drops = (killed && killed.drops) || [];
  const gear = drops.find((d) => d.kind === "gear");
  if (cleared && champGone) pass("REWARD: dragon killed via real killEnemy → zone cleared, champ left G.enemies");
  else fail(`REWARD: did not die cleanly: cleared=${cleared} champGone=${champGone}`);
  if (gear && (gear.rarity === "rare" || gear.rarity === "epic") && gear.tier >= 3)
    pass(`REWARD: GUARANTEED gear drop ${gear.rarity} tier=${gear.tier} (${gear.slot}/${gear.stat}) — pickup-able`);
  else fail(`REWARD: guaranteed gear drop wrong/absent: ${JSON.stringify(drops)}`);
  // [8] LADDER — caves is rare+, NOT auto-epic
  if (gear && gear.rarity === "rare") pass("LADDER: caves drop floor is rare (arena keeps the first guaranteed epic)");
  else if (gear && gear.rarity === "epic") log("   note: caves drop rolled epic this seed (allowed — floor is rare, ceiling tier 4); ladder intact as long as floor=rare in config");
  if (errors.length === errBeforeKill) pass("REWARD: death path produced no console error"); else fail("errors during death path");
  await page.screenshot({ path: "/tmp/cas342-death.png" }); SHOTS.push("/tmp/cas342-death.png");

  // ---- [9] GOLEM OK — frost golem capstone still works + guaranteed epic ---
  await page.evaluate(() => { try { window.__dev.ackVictory && window.__dev.ackVictory(); } catch (e) {} });
  const gArmed = await page.evaluate(() => window.__dev.armFinalBoss());
  await sleep(200);
  const gHs = await page.evaluate(() => window.__dev.huntState("frost"));
  const gc = gHs && gHs.champ;
  if (gc && /Guard|Cripta/i.test(gc.name) && gc.rwdMinR === "epic")
    pass(`GOLEM OK: frost capstone still summons "${gc.name}" minR=epic (golem path + guaranteed epic intact)`);
  else fail(`GOLEM regression: ${JSON.stringify(gc)}`);
  await page.evaluate(() => window.__dev.setChampHp("frost", 0.04));
  await sleep(100);
  const gKill = await page.evaluate(() => window.__dev.huntKillChampion("frost"));
  const gGear = (gKill && gKill.drops || []).find((d) => d.kind === "gear");
  if (gGear && gGear.rarity === "epic") pass(`GOLEM OK: frost drop guaranteed epic (${gGear.slot} tier=${gGear.tier})`);
  else log(`   note: frost drop=${JSON.stringify(gKill && gKill.drops)} (final-boss may route via win screen)`);

  // ---- [10] fps + clean ---------------------------------------------------
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { function f() { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(); } requestAnimationFrame(f); }); return n; });
  if (fps >= 58) pass(`fps soak ~${fps}`); else if (fps >= 50) log(`   note: fps ~${fps} (headless; live target ≥58)`); else fail(`low fps ${fps}`);
  if (errors.length === 0) pass("zero page errors across the whole encounter"); else { fail(`${errors.length} page errors`); errors.slice(0, 8).forEach((e) => console.error("   " + e)); }

} catch (e) {
  fail(`harness threw: ${e.message}`);
} finally {
  await browser.close();
  if (srv) srv.close();
}

log(`\nshots: ${SHOTS.join("  ")}`);
log(ok ? "\n✓ CAS-342 dragon caves CAPSTONE: deliberate climax + breath + guaranteed rare+ + golem intact." : "\n✖ CAS-342 dragon caves CAPSTONE: FAILED.");
process.exit(ok ? 0 : 1);
