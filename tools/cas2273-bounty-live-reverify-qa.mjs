// CAS-2273 — QA POST-FIX-DEPLOY LIVE re-verify of the Bounty Board player-input fix (sev-2).
// The CAS-2271 harness FAILED check 6 on build 80fd94fed020 (KeyB shadowed by customize/wardrobe ⇒ Bounty Board
// unreachable). The GE fix (fc7e8af) + CTO deploy moved BOUNTY_BOARD.key "KeyB"→"End" and added a contextual mobile
// HUD button; new LIVE build = 7ab8a04b7f37. This harness re-runs the CAS-2271 net's key checks against the FIXED
// LIVE build, driving the REAL input paths (KeyboardEvent code:"End" + canvas PointerEvent tap) — NOT __dev — so the
// binding itself is exercised, and re-confirms the arc-Santuario regression + core loop are intact on the new build.
//   1  boot LIVE, build===7ab8a04b7f37, __dev+arc hooks, 0 err, 0 non-favicon 404.
//   2  served sim/config.js: BOUNTY_BOARD.enabled:true + key "End" + requireSafeZone true (the FIX shipped, not a flip).
//   6  [WAS THE DEFECT] real "End" key in the SAFEZONE ACCEPTS the featured contract; scene stays "play" (wardrobe NOT opened).
//   6b regression: "KeyB" opens the wardrobe (scene==="customize") and accepts NOTHING — binding intact both ways.
//   6c FULL loop via the real "End" key: complete (real killEnemy counters) → CLAIM by pressing "End" → gold+XP, rotation.
//   7  requireSafeZone gate: "End" OUTSIDE the zone does NOT accept.
//   8  byte-id OFF reversibility LIVE: in-mem enabled=false ⇒ real "End" key inert.
//  15  arc-Santuario regression LIVE (BOUNTY on): SAFEZONE regen + Descanso accrual + No-Aggro idle.
//  17  core loop LIVE: keyboard movement + real kill path lands.
//  M   MOBILE: contextual HUD button tap accepts in the zone; gated (absent) outside; fps.
//  18  desk fps median-of-3.
// Run: node tools/cas2273-bounty-live-reverify-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "7ab8a04b7f37";
const OUT = join(ROOT, "shots", "cas2273");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

function wireErrs(page, errs, net404) {
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t); } });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/i.test(u)) net404.push(u + " " + (r.failure()?.errorText || "")); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon/i.test(r.url())) net404.push(r.url() + " 404"); });
}
async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 25000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}
const escToPlay = async (page) => page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); } });
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); }); await sleep(280); await escToPlay(page); };
const toWild = async (page) => { await page.evaluate(() => window.__dev.tp(40, 40)); await sleep(240); await escToPlay(page); };
const key = (page, code, k) => page.evaluate((c, kk) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: kk || c, bubbles: true })), code, k);
async function measFps(page, ms) { return await page.evaluate(async (dur) => { let f = 0; const t0 = performance.now();
  await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 < dur) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); }); return Math.round(f * 1000 / (performance.now() - t0)); }, ms); }
const medFps = async (page) => { const a = []; for (let i = 0; i < 3; i++) a.push(await measFps(page, 1000)); a.sort((x, y) => x - y); return a[1]; };

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ---------------- DESKTOP ----------------
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 660, deviceScaleFactor: 1 });
  const errors = [], net404 = [];
  wireErrs(page, errors, net404);
  await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);
  const spawn = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });

  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bounty && window.__dev.spawnKill && window.__dev.safeZone && window.__dev.rested && window.__dev.recall && window.__dev.noAggro && window.__dev.hero));
  ok("1 boot clean on LIVE, build===7ab8a04b7f37, hooks, 0 err, 0 404",
     errors.length === 0 && net404.length === 0 && build === EXPECT_BUILD && hooks, `build=${build} err=${errors.length} 404=${net404.length}`);

  // 2 served config: enabled true + key "End" + requireSafeZone true
  const served = await page.evaluate(async (base) => { const r = await fetch(base + "/sim/config.js?cb=" + Date.now()); const t = await r.text();
    const m = t.match(/BOUNTY_BOARD\s*=\s*\{[\s\S]*?\}/); const blk = m ? m[0] : "";
    const g = (re) => { const x = blk.match(re); return x ? x[1] : null; };
    return { status: r.status, enabled: g(/enabled:\s*(true|false)/), key: g(/key:\s*"([^"]+)"/), rsz: g(/requireSafeZone:\s*(true|false)/) }; }, LIVE);
  ok("2 served config LIVE: BOUNTY_BOARD.enabled:true, key \"End\", requireSafeZone:true (fix shipped)",
     served.status === 200 && served.enabled === "true" && served.key === "End" && served.rsz === "true", JSON.stringify(served));

  // 6 [WAS DEFECT] real "End" key accepts in the SAFEZONE; wardrobe NOT opened
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 }));
  await toZone(page);
  const pre6 = await page.evaluate(() => window.__dev.bounty().active);
  await key(page, "End", "End"); await sleep(150);
  const a6 = await page.evaluate(() => ({ scene: window.__dev.scene(), active: window.__dev.bounty().active }));
  ok("6 [was FAIL] real 'End' key ACCEPTS the featured contract in the SAFEZONE (scene stays play, wardrobe NOT opened)",
     pre6 === null && a6.scene === "play" && a6.active !== null, `pre=${pre6} scene=${a6.scene} active=${a6.active && a6.active.target}`);

  // 6b regression: KeyB opens wardrobe, accepts nothing
  await page.evaluate(() => window.__dev.bounty({ clear: true })); await sleep(60);
  await key(page, "KeyB", "b"); await sleep(150);
  const b6 = await page.evaluate(() => ({ scene: window.__dev.scene(), active: window.__dev.bounty().active }));
  ok("6b regression: 'KeyB' opens the wardrobe (customize) and accepts NO bounty — binding intact",
     b6.scene === "customize" && b6.active === null, `scene=${b6.scene} active=${b6.active}`);
  await escToPlay(page);

  // 6c FULL loop via the real "End" key: complete (real counters) → CLAIM via "End"
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 })); await toZone(page);
  const pre = await page.evaluate(() => { const b = window.__dev.bounty(); return { gold: b.gold, lvl: b.lvl, idx: b.bountyIdx }; });
  await key(page, "End", "End"); await sleep(140);
  const need = await page.evaluate(() => { const b = window.__dev.bounty(); return b.active ? b.active.count : 6; });
  await page.evaluate((n) => window.__dev.bounty({ kill: { type: "wolf", n } }), need + 1); await sleep(120);
  const rdy = await page.evaluate(() => window.__dev.bounty().complete);
  await key(page, "End", "End"); await sleep(160);
  const post = await page.evaluate(() => { const b = window.__dev.bounty(); return { active: b.active, gold: b.gold, lvl: b.lvl, idx: b.bountyIdx }; });
  ok("6c FULL loop via real 'End': complete(real kills)→CLAIM (gold+XP, rotation advances, contract cleared)",
     rdy === true && post.active === null && post.gold > pre.gold && post.idx === pre.idx + 1,
     `complete=${rdy} gold ${pre.gold}->${post.gold} lvl ${pre.lvl}->${post.lvl} idx ${pre.idx}->${post.idx}`);

  // 7 requireSafeZone gate on the real key
  await page.evaluate(() => window.__dev.bounty({ clear: true })); await toWild(page);
  await key(page, "End", "End"); await sleep(120);
  const wild = await page.evaluate(() => { const b = window.__dev.bounty(); return { inZone: b.inZone, active: b.active }; });
  ok("7 requireSafeZone: 'End' OUTSIDE the zone does NOT accept", wild.inZone === false && wild.active === null, JSON.stringify(wild));

  // 8 byte-id OFF reversibility: enabled=false ⇒ End inert
  await toZone(page); await page.evaluate(() => window.__dev.bounty({ clear: true, enabled: false }));
  await key(page, "End", "End"); await sleep(120);
  const off = await page.evaluate(() => { const b = window.__dev.bounty(); return { enabled: b.enabled, active: b.active }; });
  ok("8 reversible LIVE: enabled=false ⇒ real 'End' key inert", off.enabled === false && off.active === null, JSON.stringify(off));
  await page.evaluate(() => window.__dev.bounty({ enabled: true }));

  // 15 arc-Santuario regression LIVE with BOUNTY on
  const regr = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(220);
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp; await s(1400); const hp1 = window.__dev.safeZone().hp;
    let restedGrew = null; if (window.__dev.rested().enabled) { window.__dev.rested({ setPool: 0 }); const p0 = window.__dev.rested().pool; await s(1200); restedGrew = window.__dev.rested().pool > p0; }
    let noAggroIdle = null; const nz = window.__dev.noAggro && window.__dev.noAggro();
    if (nz && nz.enabled && nz.noAggro) { window.__dev.noAggro({ clear: true }); window.__dev.noAggro({ spawn: "wolf", dx: 70, dy: 0, hostile: false }); await s(900);
      const n2 = window.__dev.noAggro(); noAggroIdle = (n2.enemies || []).length > 0 && (n2.enemies || []).every(e => e.state !== "chase"); window.__dev.noAggro({ clear: true }); }
    return { hp0, hp1, restedGrew, noAggroIdle }; });
  await escToPlay(page);
  ok("15 arc regression LIVE (BOUNTY on): SAFEZONE regen heals + Descanso accrues + No-Aggro idle",
     regr.hp1 > regr.hp0 + 1 && (regr.restedGrew === null || regr.restedGrew === true) && (regr.noAggroIdle === null || regr.noAggroIdle === true),
     `hp ${regr.hp0}->${regr.hp1} restedGrew=${regr.restedGrew} noAggroIdle=${regr.noAggroIdle}`);

  // 17 core loop LIVE: keyboard movement + real kill
  const core = await page.evaluate(async (sp) => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(sp.x / 32, sp.y / 32); await s(220);
    for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); }
    const scene = window.__dev.scene();
    const press = async (code, k) => { const b = window.__dev.hero(); window.dispatchEvent(new KeyboardEvent("keydown", { code, key: k, bubbles: true })); await s(420);
      window.dispatchEvent(new KeyboardEvent("keyup", { code, key: k, bubbles: true })); await s(60); const a = window.__dev.hero(); return Math.hypot(a.x - b.x, a.y - b.y); };
    let best = 0; for (const [c, k] of [["KeyD", "d"], ["KeyA", "a"], ["KeyW", "w"], ["KeyS", "s"]]) best = Math.max(best, await press(c, k));
    const k0 = window.__dev.bounty().kills; window.__dev.spawnKill("rat"); const k1 = window.__dev.bounty().kills;
    return { scene, moved: best, killed: k1 > k0 }; }, spawn);
  await escToPlay(page);
  ok("17 core loop LIVE: keyboard movement drives hero + kill path lands", core.scene === "play" && core.moved > 15 && core.killed === true, `scene=${core.scene} maxΔ=${core.moved.toFixed(1)}px killed=${core.killed}`);

  const dfps = await medFps(page);
  ok("18 desk fps >=58 (median-of-3) with BOUNTY LIVE", dfps >= 58, `fps~${dfps}`);
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 })); await toZone(page); await key(page, "End", "End"); await sleep(120);
  await page.screenshot({ path: join(OUT, "live-desk-end.png") });
  await page.close();

  // ---------------- MOBILE ----------------
  const mp = await browser.newPage();
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErr = [], mNet = []; wireErrs(mp, mErr, mNet);
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(mp);
  const tapAt = async (p) => p.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const VW = rect.width, VH = rect.height; const m = 14; const bs = Math.max(56, Math.min(VW, VH) * 0.115);
    const bx = m + bs * 0.5, by = VH - m - bs * 5.55;
    window.dispatchEvent(new Event("touchstart"));
    cv.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 3, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(60);
    cv.dispatchEvent(new PointerEvent("pointerup", { pointerId: 3, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(140); });
  await mp.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 })); await toZone(mp);
  const mPre = await mp.evaluate(() => window.__dev.bounty().active);
  await tapAt(mp);
  const mIn = await mp.evaluate(() => window.__dev.bounty().active);
  ok("M1 MOBILE HUD button tap in the zone accepts via tryBounty chokepoint",
     mPre === null && mIn !== null && mIn.target === "wolf", `pre=${mPre} active=${mIn && mIn.target}`);
  // gated outside: tap same spot in the wild does NOT accept (button absent)
  await mp.evaluate(() => window.__dev.bounty({ clear: true })); await toWild(mp);
  await tapAt(mp);
  const mWild = await mp.evaluate(() => { const b = window.__dev.bounty(); return { inZone: b.inZone, active: b.active }; });
  ok("M2 MOBILE tap OUTSIDE the zone does NOT accept (button gated to hub)", mWild.inZone === false && mWild.active === null, JSON.stringify(mWild));
  const mfps = await medFps(mp);
  ok("M3 mobile fps >=55, 0 err, 0 404", mfps >= 55 && mErr.length === 0 && mNet.length === 0, `fps~${mfps} err=${mErr.length} 404=${mNet.length}`);
  await mp.screenshot({ path: join(OUT, "live-mobile-end.png") });

  console.log(`\nLIVE=${LIVE} build=${build}\n${PASS}/${PASS + FAIL} PASS`);
} finally {
  await browser.close();
  process.exit(FAIL ? 1 : 0);
}
