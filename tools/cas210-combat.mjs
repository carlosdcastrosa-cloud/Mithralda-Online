// ---------------------------------------------------------------------------
// CAS-210 — FOUNTAINS-style combat headless harness. Boots the REAL game in headless
// Chromium and drives the new high-skill, read-and-punish mechanics through the SAME
// sim AI / damage paths the game runs (no shortcut around updateEnemies / perfectDodge /
// hitEnemy), asserting:
//   1) DATA: the new `punisher` archetype (revenant) exists with distinct fields — a
//      multi-hit COMBO (combo>=2), a FASTER follow-up windup (comboWindup<windup) and a
//      LONG punish-recovery window (punishRecover>recover). A genuinely new combat verb.
//   2) COMBO RUNS: dropped in range, the real AI commits a chain — comboLeft counts down
//      2→1→0 through repeated windup→strike before it ever recovers, and the chain lands
//      MULTIPLE hits on a stationary target (the greedy-punish).
//   3) PUNISH WINDOW: after the chain it drops into a long recover (the read-and-punish gap).
//   4) RIPOSTE ARMS: the REAL perfectDodge() path opens the riposte window (~riposteWindow s).
//   5) RIPOSTE PAYOFF: a hit with the window armed deals ~riposteMult×CRIT_BASE the base
//      hit (a crushing counter) and CONSUMES the window (one counter per dodge).
//   6) SURFACED: the punisher is wired into real deep-zone spawner pools (abyss + trial).
//   7) 60 FPS held with a punisher engaging — perf budget.
//   8) 0 JS errors across the run.
//
// Run: npm run combat210   (or: node tools/cas210-combat.mjs)
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
    document.getElementById("nameInput").value = "CombatBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
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
    try { localStorage.removeItem("mithralda.save.v1"); } catch (e) {}
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; return cb(t); });
  });

  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await page.bringToFront();
  await enterPlay(page);
  pass("entered play as 'warrior'");

  // (1) DATA — the punisher archetype: combo chain, faster follow-up windup, long punish recover.
  const m = await page.evaluate(() => window.__dev.archMeta("revenant"));
  if (m && m.arch === "punisher" && m.combo >= 2 && m.comboWindup > 0 && m.comboWindup < m.windup && m.punishRecover > m.recover)
    pass(`[DATA] punisher present + distinct (combo ${m.combo}, windup ${m.windup}→${m.comboWindup}, punishRecover ${m.punishRecover} > recover ${m.recover})`);
  else fail(`[DATA] punisher archetype missing/not distinct: ${JSON.stringify(m)}`);

  // (2)+(3) COMBO RUNS + PUNISH WINDOW — drop one revenant in range in TOWN (no zone spawner
  // masking), let the REAL AI run, and poll archSnap. We must see comboLeft step DOWN 2→1→0
  // across repeated windup→strike (the chain), MULTIPLE hits land on the stationary tank,
  // and the chain end in a long recover (the punish/riposte window).
  await page.evaluate(() => { window.__dev.tpZone("town"); window.__dev.seed(7); });
  await page.evaluate(() => window.__dev.archArena("revenant", 40)); // 40 == range → commits immediately
  const seenCombo = new Set();
  let hits = 0, lastDmg = 0, sawRecover = false, maxCombo = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 4500) {
    const s = await page.evaluate(() => window.__dev.archSnap());
    if (s) {
      seenCombo.add(s.comboLeft);
      if (s.comboLeft > maxCombo) maxCombo = s.comboLeft;
      if (s.heroDmgTaken > lastDmg) { hits++; lastDmg = s.heroDmgTaken; }
      if (s.state === "recover") sawRecover = true;
    }
    await wait(30);
  }
  if (maxCombo >= 2 && seenCombo.has(2) && seenCombo.has(1) && seenCombo.has(0))
    pass(`[COMBO] chain counter stepped through the full combo (comboLeft seen: ${[...seenCombo].sort().join(",")})`);
  else fail(`[COMBO] never observed a full combo chain: maxCombo=${maxCombo}, seen=${[...seenCombo].join(",")}`);
  if (hits >= 2)
    pass(`[COMBO] punisher landed multiple hits in one aggression (${hits} hits, ${lastDmg} dmg taken)`);
  else fail(`[COMBO] punisher did not multi-hit a stationary target: hits=${hits}, dmg=${lastDmg}`);
  if (sawRecover)
    pass(`[PUNISH] chain resolved into a recover window (the read-and-punish gap)`);
  else fail(`[PUNISH] never saw the post-combo recover window`);

  // (4) RIPOSTE ARMS — the REAL perfectDodge() path opens the window for ~riposteWindow s.
  const arm = await page.evaluate(() => { const r = window.__dev.armRiposte(); return { r, snap: window.__dev.riposteSnap() }; });
  if (arm.r > 0 && Math.abs(arm.r - arm.snap.window) < 0.06)
    pass(`[RIPOSTE] perfect-dodge armed the counter window (riposte=${arm.r}s == window ${arm.snap.window}s)`);
  else fail(`[RIPOSTE] perfect-dodge did not arm the window: ${JSON.stringify(arm)}`);

  // (5) RIPOSTE PAYOFF — a hit with the window armed lands ~riposteMult×CRIT_BASE the base hit,
  // and the window is spent (riposteAfter==0). Compare two real hitEnemy() calls.
  const base = await page.evaluate(() => window.__dev.hitProbe(false, 100));
  const rip = await page.evaluate(() => window.__dev.hitProbe(true, 100));
  const ratio = rip.dmg / base.dmg;
  if (ratio >= 2.5 && rip.riposteAfter === 0)
    pass(`[RIPOSTE] counter hit crushed (base ${base.dmg} → riposte ${rip.dmg}, ×${ratio.toFixed(2)}) and consumed the window`);
  else fail(`[RIPOSTE] counter payoff wrong: base=${base.dmg}, riposte=${rip.dmg}, ratio=${ratio.toFixed(2)}, after=${rip.riposteAfter}`);

  // (6) SURFACED — the punisher is in real deep-zone spawner pools so it appears during play.
  const pools = await page.evaluate(() => window.__dev.zonePools());
  const zonesWith = Object.keys(pools).filter((z) => pools[z].includes("revenant"));
  if (zonesWith.includes("abyss") && zonesWith.includes("trial"))
    pass(`[POOL] punisher surfaces in deep zones: ${zonesWith.join(", ")}`);
  else fail(`[POOL] punisher not wired into deep spawner pools: ${JSON.stringify(zonesWith)}`);

  // (7) FPS — hold the frame budget with a punisher actively engaging.
  await page.evaluate(() => { window.__dev.tpZone("town"); window.__dev.archArena("revenant", 40); });
  const fps = await sampleFps(page, 1200);
  if (fps >= 58) pass(`[FPS] held ${fps} fps with a punisher engaging`);
  else fail(`[FPS] dropped below budget: ${fps} fps`);

  // (8) ERRORS
  if (errors.length === 0) pass("[ERR] zero page errors across the run");
  else fail(`[ERR] ${errors.length} page errors: ${errors.slice(0, 3).join(" | ")}`);

  log("");
  if (ok) { log("✓ CAS-210 combat harness passed."); }
  else { console.error("✗ CAS-210 combat harness FAILED."); }
} catch (e) {
  fail(`harness threw: ${e && e.stack ? e.stack : e}`);
} finally {
  await browser.close();
  await srv.close();
  process.exit(ok ? 0 : 1);
}
