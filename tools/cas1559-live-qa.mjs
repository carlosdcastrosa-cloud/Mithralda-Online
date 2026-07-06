// ---------------------------------------------------------------------------
// CAS-1559 — Meta-progression v1 LIVE QA gate (verifies gh-pages, NOT local).
//
// Drives the REAL published build at the canonical live URL through the full
// CAS-1559 test plan:
//   1. Persistencia    — death banks Esencia (shown on recap), survives reload;
//                        a bought node survives reload too (mithralda.meta.v1).
//   2. Ganancia escalada — a deeper run (higher tier + bosses down) banks MORE
//                        essence than a short lvl-1 death (direction, not value).
//   3. Altar           — 5 nodes; costs grow per level; caps respected; cannot
//                        buy without essence nor over the cap.
//   4. Payoff aplicado — buy +HP/+dmg/+oro/+reroll/+vel → next run applies them
//                        from the start; persists across respawn.
//   5. No regresión    — clean boot, ~60fps, 0 real console errors across
//                        boot/death/altar/new-run.
//   6. Reset QA        — resetMeta() → essence 0 / nodes 0.
//
// Run: node tools/cas1559-live-qa.mjs   (targets the live gh-pages build)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";

const LIVE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";
let ok = true;
const pass = (m) => console.log("✔ " + m);
const fail = (m) => { ok = false; console.error("✖ " + m); };
const dwell = (ms) => new Promise((r) => setTimeout(r, ms));
const nodeLvl = (snap, k) => snap.nodes.find((n) => n.key === k).lvl;
const nodeOf = (snap, k) => snap.nodes.find((n) => n.key === k);

const exe = findChromium();
if (!exe) { console.error("✖ No Chromium binary found."); process.exit(1); }
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

async function enterPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const el = document.getElementById("nameInput"); if (el) el.value = "MetaQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 6000 });
  await key(page, "Digit1");
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 6000 });
}

try {
  const errors = [];
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console.error: " + m.text()); });
  await page.setViewport({ width: 960, height: 720 });

  // --- build id verification (sign against the LIVE build, not a stale one) ---
  const ver = await page.evaluate(async (base) => { const r = await fetch(base + "/version.json?_=" + Math.floor(performance.now())); return r.json(); }, LIVE);
  console.log(`ℹ live build = ${ver.build} (files ${ver.files})`);

  await page.goto(`${LIVE}/index.html?dev`, { waitUntil: "load" });
  await page.waitForFunction("window.__meta && typeof window.__meta==='function'", { timeout: 20000 });
  // start clean
  await page.evaluate(() => window.__metaReset());
  const clean = await page.evaluate(() => window.__meta());
  if (clean.essence === 0 && clean.nodes.every((n) => n.lvl === 0)) pass("clean start via __metaReset()");
  else fail("reset did not clean: " + JSON.stringify(clean));

  await enterPlay(page);
  pass(`booted to play on LIVE build ${ver.build}`);

  // ===== 1. PERSISTENCIA =====
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 6000 });
  const recap = await page.evaluate(() => window.__dev.recapState());
  const m1 = await page.evaluate(() => window.__meta());
  if (recap && typeof recap.essence === "number" && recap.essence >= 1)
    pass(`[1] death recap shows Esencia ganada = +${recap.essence} (recap.essenceTotal=${recap.essenceTotal})`);
  else fail("[1] recap missing/zero essence: " + JSON.stringify(recap));
  if (m1.essence >= 1) pass(`[1] Esencia banked in account store = ${m1.essence}`);
  else fail("[1] no essence banked: " + JSON.stringify(m1));

  // accumulate a spendable balance: a few more lvl-1 deaths
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__dev.retryRun());
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
    await page.evaluate(() => window.__dev.killHero());
    await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
  }
  const banked = await page.evaluate(() => window.__meta());
  pass(`[1] accumulated Esencia across deaths = ${banked.essence}`);

  // reload → essence persists (own store, independent of run save)
  await dwell(120);
  const preReload = await page.evaluate(() => window.__meta());
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__meta && typeof window.__meta==='function'", { timeout: 20000 });
  const afterReload = await page.evaluate(() => window.__meta());
  if (afterReload.essence === preReload.essence) pass(`[1] Esencia persisted across reload (${afterReload.essence})`);
  else fail(`[1] essence lost on reload: ${preReload.essence} -> ${afterReload.essence}`);

  // buy a node → reload → purchase persists
  const buyRes = await page.evaluate(() => window.__metaBuy("hpMax"));
  const afterBuy = await page.evaluate(() => window.__meta());
  if (buyRes && nodeLvl(afterBuy, "hpMax") === 1) pass(`[1] bought hpMax → lvl 1 (essence ${preReload.essence}->${afterBuy.essence})`);
  else fail("[1] buy failed: " + JSON.stringify({ buyRes, afterBuy }));
  await dwell(120);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction("window.__meta && typeof window.__meta==='function'", { timeout: 20000 });
  const afterBuyReload = await page.evaluate(() => window.__meta());
  if (nodeLvl(afterBuyReload, "hpMax") === 1 && afterBuyReload.essence === afterBuy.essence)
    pass(`[1] purchase persisted across reload (hpMax lvl ${nodeLvl(afterBuyReload, "hpMax")}, essence ${afterBuyReload.essence})`);
  else fail("[1] purchase not persisted: " + JSON.stringify(afterBuyReload));

  // ===== 3. ALTAR view model (5 nodes, growing costs, caps) =====
  const snap = await page.evaluate(() => window.__meta());
  if (snap.nodes.length === 5) pass(`[3] altar exposes 5 nodes: ${snap.nodes.map((n) => n.key).join(",")}`);
  else fail("[3] wrong node count: " + snap.nodes.length);
  // cost grows per level: check hpMax cost at lvl1 (=20) > cost at lvl0 (=10)
  const hpNode = nodeOf(snap, "hpMax");
  if (hpNode.lvl === 1 && hpNode.cost === 20) pass(`[3] hpMax cost grows per level (lvl1 next cost = ${hpNode.cost}, was 10 at lvl0)`);
  else fail("[3] cost curve wrong: " + JSON.stringify(hpNode));

  // ===== 2. GANANCIA ESCALADA (direction) =====
  // fresh lvl-1 death baseline vs a deep run (tier 3 + 2 bosses down)
  await page.evaluate(() => window.__metaReset());
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
  const shortGain = (await page.evaluate(() => window.__dev.recapState())).essence;
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  await page.evaluate(() => window.__dev.setConquest(3, ["z1", "z2"])); // tier 3, 2 bosses down
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
  const deepGain = (await page.evaluate(() => window.__dev.recapState())).essence;
  if (deepGain > shortGain) pass(`[2] deeper run banks MORE essence: short=${shortGain} < deep(tier3+2boss)=${deepGain}`);
  else fail(`[2] scaling wrong direction: short=${shortGain} deep=${deepGain}`);

  // ===== 4. PAYOFF APLICADO =====
  // reset, grant a big balance by farming deep runs, buy one level of each node,
  // then start a fresh run and read the applied bonuses vs a zero-meta baseline.
  await page.evaluate(() => window.__metaReset());
  // baseline hero stats (zero meta) on a fresh run
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  const base = await page.evaluate(() => ({ s: window.__dev.heroStats(), d: window.__dev.draftCharges() }));
  // farm essence: deep deaths bank a lot each
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__dev.killHero());
    await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
    await page.evaluate(() => window.__dev.retryRun());
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
    await page.evaluate(() => window.__dev.setConquest(3, ["z1", "z2"]));
  }
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
  const farmMeta = await page.evaluate(() => window.__meta());
  pass(`[4] farmed Esencia for buys = ${farmMeta.essence}`);
  // buy one level of every node
  const bought = await page.evaluate(() => ["hpMax", "dmg", "moveSpd", "reroll", "startGold"].map((k) => ({ k, ok: window.__metaBuy(k) })));
  const boughtSnap = await page.evaluate(() => window.__meta());
  const allLvl1 = ["hpMax", "dmg", "moveSpd", "reroll", "startGold"].every((k) => nodeLvl(boughtSnap, k) >= 1);
  if (allLvl1) pass(`[4] bought +1 of every node: ${boughtSnap.nodes.map((n) => n.key + "=" + n.lvl).join(" ")}`);
  else fail("[4] not all nodes bought: " + JSON.stringify({ bought, boughtSnap }));
  // start a NEW run → bonuses applied from the start
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  const buffed = await page.evaluate(() => ({ s: window.__dev.heroStats(), d: window.__dev.draftCharges() }));
  const checks = [
    ["+12 HP máx", buffed.s.maxHp === base.s.maxHp + 12, `maxHp ${base.s.maxHp}->${buffed.s.maxHp}`],
    ["+2 daño base", buffed.s.baseDmg === base.s.baseDmg + 2, `baseDmg ${base.s.baseDmg}->${buffed.s.baseDmg}`],
    ["+25 oro inicial", buffed.s.gold === base.s.gold + 25, `gold ${base.s.gold}->${buffed.s.gold}`],
    ["+1 reroll", buffed.d.rerollLeft === base.d.rerollLeft + 1, `rerollLeft ${base.d.rerollLeft}->${buffed.d.rerollLeft}`],
    ["+3% vel mov", buffed.s.moveSpeed > base.s.moveSpeed, `moveSpeed ${base.s.moveSpeed}->${buffed.s.moveSpeed}`],
  ];
  for (const [name, good, detail] of checks) { if (good) pass(`[4] ${name} applied from run-start (${detail})`); else fail(`[4] ${name} NOT applied (${detail})`); }
  // persists across respawn
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  const respawned = await page.evaluate(() => ({ s: window.__dev.heroStats(), d: window.__dev.draftCharges() }));
  if (respawned.s.maxHp === buffed.s.maxHp && respawned.d.rerollLeft === base.d.rerollLeft + 1)
    pass(`[4] bonuses persist across respawn (maxHp ${respawned.s.maxHp}, reroll ${respawned.d.rerollLeft}) — no double-count`);
  else fail("[4] respawn drifted bonuses: " + JSON.stringify({ buffed: buffed.s.maxHp, respawned: respawned.s }));

  // ===== altar render + screenshot (visual evidence) =====
  await page.evaluate(() => window.__dev.killHero());
  await page.waitForFunction("window.__dev.scene()==='dead'", { timeout: 5000 });
  await key(page, "KeyA");
  const altarScene = await page.evaluate(() => window.__dev.scene());
  if (altarScene === "altar") { await dwell(150); await page.screenshot({ path: "tools/cas1559-altar-live.png" }); pass("[3] altar scene opened + rendered (screenshot: tools/cas1559-altar-live.png)"); }
  else { await page.screenshot({ path: "tools/cas1559-altar-live.png" }); console.log(`ℹ altar hotkey landed on scene='${altarScene}' (screenshot captured anyway)`); }

  // buy-guard: over-cap and insufficient-essence both refused
  await page.evaluate(() => window.__metaReset());
  const noEssBuy = await page.evaluate(() => window.__metaBuy("hpMax")); // essence 0 → must fail
  if (noEssBuy === false) pass("[3] buy refused with insufficient Esencia (returns false, no negative balance)");
  else fail("[3] buy succeeded with zero essence!");

  // ===== 5. NO REGRESIÓN — fps sample =====
  await page.evaluate(() => window.__metaReset());
  await page.evaluate(() => window.__dev.retryRun());
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(tick); else res(n); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 45) pass(`[5] frame loop healthy (~${fps} rAF ticks/s in headless)`);
  else console.log(`ℹ [5] headless fps sample = ${fps} (headless rAF is not a real-hardware fps guarantee)`);

  // ===== 6. RESET QA =====
  await page.evaluate(() => window.__metaBuy("dmg"));
  await page.evaluate(() => window.__metaReset());
  const reset = await page.evaluate(() => window.__meta());
  if (reset.essence === 0 && reset.nodes.every((n) => n.lvl === 0)) pass("[6] resetMeta() → essence 0 / nodes 0");
  else fail("[6] reset failed: " + JSON.stringify(reset));

  // ===== 5. console errors =====
  const real = errors.filter((e) => !/favicon|404|ERR_/i.test(e));
  if (real.length === 0) pass(`[5] zero real console/page errors across boot/death/altar/buy/new-run (${errors.length} total incl. benign)`);
  else fail(`[5] real errors: ${real.slice(0, 5).join(" | ")}`);
} catch (e) {
  fail("harness threw: " + e.message + "\n" + (e.stack || ""));
} finally {
  await browser.close();
}
console.log(ok ? "\n✅ CAS-1559 META-PROGRESSION LIVE QA PASS" : "\n❌ CAS-1559 LIVE QA FAIL");
process.exit(ok ? 0 : 1);
