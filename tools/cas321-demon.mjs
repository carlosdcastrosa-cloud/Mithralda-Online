// ---------------------------------------------------------------------------
// CAS-321 — headless verification for the dark_demon_3 (warlock hybrid) MOB.
// Boots the REAL game in headless Chromium and drives the demon through the SAME
// updateEnemies AI the game runs (archArena → no shortcut around the state machine),
// asserting the board's core requirement: BOTH animations reproduce in combat.
//   1) DATA: ETPL.demon exists — arch "warlock", sprite "demon", size ~28, hybrid
//      ranged (proj/projspd) + melee (meleeR). It is in the Abismo trash pool.
//   2) WARLOCK CAST: the demon parked at range fires a bolt with animState "cast"
//      (castNow true) → the demon_cast strip plays (board "warlock" animation).
//   3) CLAW MELEE: with the hero pulled inside meleeR the demon strikes with
//      animState "attack" (castNow false) and the hero takes damage → demon_attack
//      strip plays (board "claw" animation).
//   4) 60 FPS held with the demon live; 0 JS errors across the run.
//
// Run: npm run cas321   (or: node tools/cas321-demon.mjs)
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
    document.getElementById("nameInput").value = "DemonBot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true }));
  });
  await page.waitForFunction("window.__dev.scene() === 'classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("window.__dev.scene() === 'play'", { timeout: 5000 });
}

// Poll archSnap() until pred(snap) or timeout; returns the last snapshot seen.
async function until(page, pred, ms = 5000) {
  const t0 = Date.now(); let snap = null;
  while (Date.now() - t0 < ms) {
    snap = await page.evaluate(() => window.__dev.archSnap());
    if (snap && pred(snap)) return snap;
    await wait(40);
  }
  return snap;
}

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${srv.url}/index.html?dev`, { waitUntil: "load" });
  await enterPlay(page);

  // 1) DATA — template shape + zone membership.
  const meta = await page.evaluate(() => window.__dev.archMeta("demon"));
  if (meta && meta.arch === "warlock") pass(`[DATA] ETPL.demon arch="warlock"`);
  else fail(`[DATA] ETPL.demon arch wrong: ${JSON.stringify(meta)}`);
  if (meta && meta.sprite === "demon") pass(`[DATA] sprite="demon" (drives enemy_demon cutout + demon_attack/demon_cast strips)`);
  else fail(`[DATA] sprite wrong: ${meta && meta.sprite}`);
  if (meta && meta.size >= 26 && meta.size <= 30) pass(`[DATA] size ${meta.size} (~2.1 tiles, imposing)`);
  else fail(`[DATA] size out of band: ${meta && meta.size}`);
  if (meta && meta.meleeR && meta.projspd && meta.proj) pass(`[DATA] hybrid fields present meleeR=${meta.meleeR} proj=${meta.proj} projspd=${meta.projspd}`);
  else fail(`[DATA] hybrid fields missing: ${JSON.stringify(meta)}`);

  const pools = await page.evaluate(() => window.__dev.zonePools());
  const inAbyss = (pools && pools.abyss) || [];
  if (inAbyss.includes("demon")) pass(`[DATA] demon in Abismo spawner pool: ${inAbyss.join(",")}`);
  else fail(`[DATA] demon NOT in abyss pool: ${inAbyss}`);

  // 2) WARLOCK CAST — spawn the demon at range, let it commit a ranged attack.
  await page.evaluate(() => window.__dev.archArena("demon", 180, 0));
  let projBefore = (await page.evaluate(() => window.__dev.archSnap())).enemyProj;
  const castSnap = await until(page, (s) => s.castNow === true && (s.animState === "cast"), 6000);
  if (castSnap && castSnap.castNow && castSnap.animState === "cast")
    pass(`[CAST] warlock animation fires: animState="cast" castNow=true at dist ${castSnap.dist}`);
  else fail(`[CAST] never reached cast state: ${JSON.stringify(castSnap)}`);
  // bolt actually leaves the demon
  const boltSnap = await until(page, (s) => s.enemyProj > projBefore, 4000);
  if (boltSnap && boltSnap.enemyProj > projBefore) pass(`[CAST] warlock bolt fired (enemyProj ${projBefore} -> ${boltSnap.enemyProj})`);
  else fail(`[CAST] no bolt left the demon (enemyProj stuck at ${projBefore})`);

  // 3) CLAW MELEE — pull the hero inside meleeR so the next commit is a claw.
  // Re-arena to a clean state, then hold the hero point-blank and watch for a melee hit.
  await page.evaluate(() => window.__dev.archArena("demon", 40, 0));
  let clawSeen = false, dmgSeen = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && !(clawSeen && dmgSeen)) {
    await page.evaluate(() => window.__dev.archMoveHero(30, 0)); // keep the hero inside meleeR
    const s = await page.evaluate(() => window.__dev.archSnap());
    if (s) {
      if ((s.state === "windup" || s.state === "strike") && s.castNow === false && s.animState === "attack") clawSeen = true;
      if (s.heroDmgTaken > 0) dmgSeen = true;
    }
    await wait(40);
  }
  if (clawSeen) pass(`[CLAW] claw animation fires in melee: animState="attack" castNow=false`);
  else fail(`[CLAW] demon never showed the claw (attack) state inside meleeR`);
  if (dmgSeen) pass(`[CLAW] claw connects — hero takes melee damage point-blank`);
  else fail(`[CLAW] claw never dealt damage`);

  // 4) FPS + errors — demon live.
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const tick = () => { n++; (performance.now() - t0 < 1000) ? requestAnimationFrame(tick) : res(Math.round(n * 1000 / (performance.now() - t0))); };
    requestAnimationFrame(tick);
  }));
  if (fps >= 58) pass(`[FPS] held ${fps} fps with the demon live`);
  else fail(`[FPS] dropped to ${fps} fps`);

  if (errors.length === 0) pass(`[ERR] 0 JS errors across the run`);
  else fail(`[ERR] ${errors.length} JS errors: ${errors.slice(0, 3).join(" | ")}`);
} catch (e) {
  fail(`harness threw: ${e && e.stack || e}`);
} finally {
  await browser.close();
  (srv.close || srv.stop) && (srv.close ? srv.close() : srv.stop());
}

log(ok ? "\nALL CAS-321 CHECKS PASSED" : "\nCAS-321 CHECKS FAILED");
process.exit(ok ? 0 : 1);
