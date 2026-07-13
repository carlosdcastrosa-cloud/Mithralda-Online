// CAS-2271 — QA POST-FLIP LIVE full-stack regression for TABLÓN DE RECOMPENSAS / BOUNTY BOARD (BOUNTY_BOARD.enabled:true ON DISK).
// Independent QA (b5c10283) against the LIVE gh-pages build after the CAS-2270 flip+deploy (build 80fd94fed020).
// This is NOT the in-memory DARK observable pass (CAS-2269): here BOUNTY_BOARD is ON BY DEFAULT from the SERVED config — no
// __dev flip turns it on. __dev is used only to DRIVE the deterministic paths (setIdx / spawnKill real killEnemy / arc hooks)
// and, for the reversibility proof, as an OFF baseline to isolate the badge and the byte-id save.
//
// Delta over the observable pass (why this exists):
//   · Boots the ACTUAL live URL (cache-bust) and asserts build===EXPECT + 0 JS err + 0 non-favicon 404.
//   · Proves ON-BY-DEFAULT from the SERVED sim/config.js (BOUNTY_BOARD.enabled:true, key KeyB, requireSafeZone true) — not a flip.
//   · Drives the REAL 'KeyB' KEY through the LIVE input.js path (sim.tryBounty) to prove the player accept/claim trigger works live.
//   · REAL kill path: __dev.spawnKill(type) → real killEnemy bumps h.kills + killsByType[type] ⇒ progress derived from live counters.
//   · Type isolation: a TYPE contract advances only on the right type (killsByType), a wrong type does NOT advance it.
//   · Turn-in grants gold + XP via the real gainXP chokepoint (no new currency); rotation (bountyIdx) advances deterministically.
//   · Badge render observable LIVE: changed-px signal(ON−OFF) ≫ noise(OFF−OFF), reversible (CAS-2266/2269 footgun-safe).
//   · byte-id OFF reversibility LIVE: in-mem OFF ⇒ save has NO bounty/bountyIdx keys + worldFingerprint stable (revert = clean 1-line).
//   · Determinism 0-RNG: same zone+idx ⇒ same featured contract (bountyDef pure), stable across repeated reads.
//   · FULL-STACK arc-Santuario regression LIVE with BOUNTY on: SAFEZONE regen + Descanso accrual + No-Aggro idle + Temple respawn
//     + RECALL bind/Home. Core loops: keyboard movement + combat kill (real killEnemy). Perf: 60fps desk + mobile.
// Run: node tools/cas2271-bounty-live-fullstack-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "80fd94fed020";
const OUT = join(ROOT, "shots", "cas2271");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const report = { live: LIVE, expectBuild: EXPECT_BUILD, build: null, desk: {}, mobile: {} };
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

function wireErrs(page, errs, net404) {
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text();
    if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t); } });
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
const escToPlay = async (page) => page.evaluate(async () => {
  const s = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); }
});
// tp INTO the SAFEZONE (Templo POI) and clear any entry modal so scene==='play'
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); });
  await sleep(280); await escToPlay(page); };
async function measFps(page, ms) {
  return await page.evaluate(async (dur) => {
    let frames = 0; const t0 = performance.now();
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 < dur) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
    return Math.round(frames * 1000 / (performance.now() - t0));
  }, ms);
}
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
  report.build = build;
  const spawn = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; }); // open hub spawn (walkable) for the movement check

  // 1 boot clean on LIVE
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bounty && window.__dev.spawnKill && window.__dev.safeZone &&
    window.__dev.rested && window.__dev.recall && window.__dev.noAggro && window.__dev.saveBlob && window.__dev.worldFingerprint &&
    window.__dev.daynight && window.__dev.hero));
  ok("1 boots clean on LIVE, build===EXPECT, __dev.bounty+spawnKill+arc hooks+__BUILD, 0 err, 0 404",
     errors.length === 0 && net404.length === 0 && build === EXPECT_BUILD && hooks,
     `build=${build} expect=${EXPECT_BUILD} err=${errors.length} 404=${net404.length}`);

  // 2 served config: BOUNTY_BOARD.enabled:true + key KeyB + requireSafeZone true (shipped LIVE, not a flip)
  const served = await page.evaluate(async (base) => {
    const r = await fetch(base + "/sim/config.js?cb=" + Date.now()); const txt = await r.text();
    const blk = (txt.match(/export const BOUNTY_BOARD\s*=\s*\{[\s\S]*?\n\};/) || [""])[0];
    const g = (re) => { const m = blk.match(re); return m ? m[1] : "??"; };
    const nB = (blk.match(/id:"/g) || []).length;
    return { status: r.status, enabled: g(/enabled:\s*(true|false)/), key: g(/key:\s*"([^"]+)"/), rsz: g(/requireSafeZone:\s*(true|false)/), nB };
  }, LIVE);
  ok("2 served config LIVE: BOUNTY_BOARD.enabled:true, key KeyB, requireSafeZone:true, 6 contracts",
     served.status === 200 && served.enabled === "true" && served.key === "KeyB" && served.rsz === "true" && served.nB === 6,
     `enabled=${served.enabled} key=${served.key} requireSafeZone=${served.rsz} contracts=${served.nB}`);

  // 3 ON BY DEFAULT from disk — bounty().enabled===true out of the box, featured contract resolves deterministically
  const b0 = await page.evaluate(() => { const a = window.__dev.bounty(); const b = window.__dev.bounty(); return { enabled: a.enabled, f1: a.featured, f2: b.featured, active: a.active, hasField: a.hasField }; });
  report.desk.b0 = b0;
  ok("3 LIVE default ON (on-disk): bounty().enabled===true + featured contract resolves + no active contract yet",
     b0.enabled === true && b0.f1 && b0.f1.id && b0.f1.id === b0.f2.id && b0.active === null,
     `enabled=${b0.enabled} featured=${b0.f1 && b0.f1.id} active=${b0.active}`);

  // 4 determinism 0-RNG: same zone+idx ⇒ same featured contract (bountyDef pure), stable across reads
  const det = await page.evaluate(() => {
    const seen = [];
    for (let i = 0; i < 6; i++) { window.__dev.bounty({ setIdx: i }); const f1 = window.__dev.bounty().featured; const f2 = window.__dev.bounty().featured;
      seen.push({ i, id: f1.id, target: f1.target, stable: f1.id === f2.id && f1.target === f2.target }); }
    window.__dev.bounty({ setIdx: 0 });
    return seen;
  });
  const detOk = det.every(d => d.stable) && new Set(det.map(d => d.id)).size === 6;
  ok("4 determinism 0-RNG: each bountyIdx maps to a STABLE featured contract (bountyDef pure, 6 distinct)",
     detOk, det.map(d => `${d.i}:${d.id}${d.stable ? "" : "!UNSTABLE"}`).join(" "));

  // 5 byte-id OFF reversibility LIVE: in-mem OFF ⇒ save has NO bounty/bountyIdx keys + worldFingerprint stable; restore ON.
  //   (ON-disk default serializes bountyIdx:0 which is expected/clean; the OFF path is the reversible-revert proof.)
  const rev = await page.evaluate(() => {
    const S = (x) => typeof x === "string" ? x : JSON.stringify(x);
    const fpOn = S(window.__dev.worldFingerprint());
    window.__dev.bounty({ enabled: false });
    const saveOff = window.__dev.saveBlob(); const offStr = typeof saveOff === "string" ? saveOff : JSON.stringify(saveOff);
    const leakOff = /"bounty"|"bountyIdx"/.test(offStr);
    const fpOff = S(window.__dev.worldFingerprint());
    window.__dev.bounty({ enabled: true });
    const fpOn2 = S(window.__dev.worldFingerprint());
    return { leakOff, fpStable: fpOn === fpOff && fpOff === fpOn2 };
  });
  ok("5 byte-id OFF reversibility LIVE: in-mem OFF ⇒ save omits bounty/bountyIdx keys + worldFingerprint byte-stable across toggle",
     rev.leakOff === false && rev.fpStable === true, `leakOff=${rev.leakOff} fpStable=${rev.fpStable}`);

  // 6 REAL 'KeyB' KEY (LIVE input.js path) — the PLAYER trigger. EXPECTED: accept the featured contract in the SAFEZONE.
  //   DEFECT (CAS-2273): KeyB is the DEFAULT bind for the `customize` (wardrobe) rebindable action (settings.js:49, since
  //   CAS-1659). input.js:271 `playAction(code)` resolves "customize" and RETURNS before the bounty handler at input.js:363,
  //   so pressing B opens the wardrobe and the bounty is NEVER accepted. This check FAILS on purpose to document the defect.
  await page.evaluate(() => { window.__dev.bounty({ enabled: true, clear: true, setIdx: 1 }); }); // idx 1 = "wolves" (target wolf, count 6)
  await toZone(page);
  const accKey = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const before = window.__dev.bounty();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyB", key: "b", bubbles: true })); await s(150);
    const afterScene = window.__dev.scene();
    const keyAccepted = window.__dev.bounty().active !== null;
    // recover: close whatever KeyB opened (wardrobe), return to play, then accept through the REAL tryBounty chokepoint
    for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); }
    const acc = window.__dev.bounty({ act: true });
    return { beforeActive: before.active, afterScene, keyAccepted, result: acc.result, active: acc.active, progress: acc.progress, complete: acc.complete, inZone: acc.inZone }; });
  ok(`6 [DEFECT CAS-2273] REAL 'KeyB' key accepts bounty in SAFEZONE — FAILS: opens '${accKey.afterScene}' (wardrobe), bounty NOT accepted`,
     accKey.keyAccepted === true, `keyAccepted=${accKey.keyAccepted} keyOpenedScene=${accKey.afterScene} (expected accept, got customize)`);
  ok("6b accept via REAL tryBounty chokepoint (sim path, __dev.act) works ⇒ active wolf contract, progress 0 (feature LOGIC healthy)",
     accKey.beforeActive === null && accKey.result === "accepted" && accKey.active && accKey.active.target === "wolf" && accKey.progress === 0 && accKey.complete === false && accKey.inZone === true,
     `result=${accKey.result} active=${accKey.active && accKey.active.target} count=${accKey.active && accKey.active.count} prog=${accKey.progress}`);
  const need = accKey.active.count;

  // 7 re-trigger while incomplete via the real chokepoint ⇒ no-op (contract unchanged, no double-accept)
  const noop = await page.evaluate(() => { const a = window.__dev.bounty({ act: true }); return { result: a.result, target: a.active && a.active.target, progress: a.progress }; });
  ok("7 no-op in progress (real chokepoint) ⇒ 'inprogress', unchanged wolf contract, no double-accept",
     noop.result === "inprogress" && noop.target === "wolf" && noop.progress === 0, `result=${noop.result} target=${noop.target} prog=${noop.progress}`);

  // 8 progress DERIVED from REAL kills (spawnKill → real killEnemy bumps live counters) — wrong type first, then right type
  const prog = await page.evaluate(() => {
    window.__dev.spawnKill("skeleton"); window.__dev.spawnKill("skeleton");   // WRONG type ⇒ must NOT advance a wolf contract
    const wrong = window.__dev.bounty().progress;
    const partial = Math.max(1, (window.__dev.bounty().active.count | 0) - 2);
    for (let i = 0; i < partial; i++) window.__dev.spawnKill("wolf");          // RIGHT type ⇒ advances via killsByType
    const p1 = window.__dev.bounty();
    return { wrong, partial, prog1: p1.progress, complete1: p1.complete, base: p1.active.base };
  });
  ok("8 progress DERIVED via REAL killEnemy: wrong type (skeleton) does NOT advance, right type (wolf) does (complete=false partial)",
     prog.wrong === 0 && prog.prog1 === prog.partial && prog.complete1 === false,
     `wrongTypeΔ=${prog.wrong} rightTypeProg=${prog.prog1}/${need} complete=${prog.complete1}`);

  // 9 COMPLETE via real kills ⇒ complete=true, progress clamped to count
  const comp = await page.evaluate((need) => {
    let guard = 0; while (!window.__dev.bounty().complete && guard++ < 20) window.__dev.spawnKill("wolf");
    const b = window.__dev.bounty(); return { progress: b.progress, complete: b.complete };
  }, need);
  ok("9 COMPLETE via real kills ⇒ complete=true, progress clamped to count",
     comp.complete === true && comp.progress === need, `prog=${comp.progress}/${need} complete=${comp.complete}`);

  // 10 + 11 + 12 CLAIM via the REAL tryBounty chokepoint in zone: gold += reward, XP via gainXP (lvl monotonic), cleared, rotates
  await toZone(page);
  const claim = await page.evaluate(() => {
    const pre = window.__dev.bounty(); const reward = pre.active;
    const post = window.__dev.bounty({ act: true });
    return { reward, result: post.result, goldPre: pre.gold, goldPost: post.gold, lvlPre: pre.lvl, lvlPost: post.lvl, idxPre: pre.bountyIdx, idxPost: post.bountyIdx, active: post.active, hasField: post.hasField }; });
  const goldGain = claim.goldPost - claim.goldPre;
  ok("10 CLAIM via real chokepoint w/ complete ⇒ 'claimed', gold += reward.gold, contract cleared",
     claim.result === "claimed" && goldGain === claim.reward.gold && claim.active === null,
     `result=${claim.result} goldΔ=${goldGain} expected=${claim.reward.gold} active=${claim.active}`);
  ok("11 XP granted on claim via real gainXP chokepoint (lvl monotonic ≥ pre; reward.xp=" + claim.reward.xp + ")",
     claim.lvlPost >= claim.lvlPre, `lvl ${claim.lvlPre}→${claim.lvlPost}`);
  ok("12 ROTATION deterministic: bountyIdx advances on claim (0 RNG, featured rotates)",
     claim.idxPost === claim.idxPre + 1, `idx ${claim.idxPre}→${claim.idxPost}`);

  // 13 TYPE isolation (killsByType, not h.kills 'any'): accept a rat contract, kill a DIFFERENT type ⇒ no progress, right ⇒ +1
  const typeIso = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    let idx = 0; for (let i = 0; i < 8; i++) { window.__dev.bounty({ setIdx: i }); const f = window.__dev.bounty().featured; if (f && f.target === "rat") { idx = i; break; } }
    window.__dev.bounty({ clear: true, setIdx: idx });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(200);
    for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    const acc = window.__dev.bounty({ act: true });
    window.__dev.spawnKill("bandit"); window.__dev.spawnKill("bandit");  // wrong type
    const wrong = window.__dev.bounty().progress;
    window.__dev.spawnKill("rat");                                       // right type
    const right = window.__dev.bounty().progress;
    return { target: acc.active && acc.active.target, wrong, right }; });
  ok("13 TYPE isolation via killsByType: wrong-type kills don't advance a rat contract, right-type does",
     typeIso.target === "rat" && typeIso.wrong === 0 && typeIso.right === 1,
     `target=${typeIso.target} wrongΔ=${typeIso.wrong} rightΔ=${typeIso.right}`);

  // 14 BADGE render observable LIVE (footgun CAS-2266/2269: freeze daynight/weather + silence recall/rested + settle rAF, >55/ch gate)
  const rd = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.daynight({ enabled: true, phase: 0.30 }); window.__dev.weather({ phase: 0.0 });
    const restedWas = window.__dev.rested ? window.__dev.rested().enabled : false;
    if (window.__dev.rested) window.__dev.rested({ enabled: false });
    const recallWas = window.__dev.recall ? window.__dev.recall().enabled : false;
    if (window.__dev.recall) window.__dev.recall({ enabled: false });
    window.__dev.bounty({ enabled: true });
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(300);
    for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    // accept an ACTIVE contract ⇒ badge draws BRIGHT (amber alpha 0.74); the featured-preview badge is too DIM (0.55) for the gate
    if (!window.__dev.bounty().active) window.__dev.bounty({ act: true });
    await s(120);
    const cv = document.getElementById("c"); const W = cv.width, H = cv.height;
    // Badge row docks BELOW the minimap+quest-tracker (badgeRowAnchor()+58) at y≈0.33·H. Probe a TIGHT band there so the
    // minimap-shimmer zone above (hero/enemy blips animate between grabs = false signal, CAS-2266 footgun) is excluded.
    // The active-contract badge is a small amber scroll (alpha≈0.43) + cream label over a bright temple bg ⇒ use a 40/ch
    // threshold (55 clips the low-contrast amber to a handful of px); the label's black-outlined text carries the signal.
    const rx = Math.max(0, W - 175), ry = Math.floor(H * 0.31), rw = 175, rh = Math.floor(H * 0.11);
    const tmp = document.createElement("canvas"); tmp.width = rw; tmp.height = rh; const tctx = tmp.getContext("2d");
    const grab = () => { tctx.clearRect(0, 0, rw, rh); tctx.drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh); return tctx.getImageData(0, 0, rw, rh).data; };
    const changed = (p, q) => { let n = 0; for (let i = 0; i < p.length; i += 4) { if (Math.abs(p[i] - q[i]) > 40 || Math.abs(p[i + 1] - q[i + 1]) > 40 || Math.abs(p[i + 2] - q[i + 2]) > 40) n++; } return n; };
    const settle = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(() => r())); };
    window.__dev.bounty({ enabled: false }); await settle(); const offA = grab(); await settle(); const offB = grab();
    const noisePx = changed(offA, offB);
    window.__dev.bounty({ enabled: true }); await settle(); const on1 = grab();
    window.__dev.bounty({ enabled: false }); await settle(); const off1 = grab();
    const signalPx = changed(on1, off1);
    window.__dev.bounty({ enabled: true }); await settle(); const on2 = grab();
    window.__dev.bounty({ enabled: false }); await settle(); const off2 = grab();
    const signalPx2 = changed(on2, off2);
    window.__dev.bounty({ enabled: true }); // restore LIVE default ON
    if (window.__dev.rested && restedWas) window.__dev.rested({ enabled: true });
    if (window.__dev.recall && recallWas) window.__dev.recall({ enabled: true });
    window.__dev.daynight({ phase: null }); window.__dev.weather({ phase: null });
    return { noisePx, signalPx, signalPx2 };
  });
  ok("14 BADGE render observable LIVE: changed-px signal(ON−OFF) ≫ noise(OFF−OFF), reversible on re-toggle",
     rd.signalPx > rd.noisePx * 3 + 40 && rd.signalPx2 > rd.noisePx * 3 + 40, `signalPx=${rd.signalPx} noisePx=${rd.noisePx} signalPx2=${rd.signalPx2}`);
  await toZone(page); await page.evaluate(() => { window.__dev.bounty({ enabled: true }); if (!window.__dev.bounty().active) window.__dev.bounty({ act: true }); });
  await sleep(300); await page.screenshot({ path: join(OUT, "live-bounty-badge.png") });

  // 15 ARC-Santuario regression LIVE with BOUNTY on: SAFEZONE regen + Descanso accrual + No-Aggro idle
  const regr = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(220);
    window.__dev.safeZone({ setHp: 40, pause: 0 }); const hp0 = window.__dev.safeZone().hp; await s(1400); const hp1 = window.__dev.safeZone().hp;
    let restedGrew = null;
    if (window.__dev.rested().enabled) { window.__dev.rested({ setPool: 0 }); const p0 = window.__dev.rested().pool; await s(1200); restedGrew = window.__dev.rested().pool > p0; }
    let noAggroIdle = null; const nz = window.__dev.noAggro && window.__dev.noAggro();
    if (nz && nz.enabled && nz.noAggro) { window.__dev.noAggro({ clear: true });
      window.__dev.noAggro({ spawn: "wolf", dx: 70, dy: 0, hostile: false }); await s(900);
      const n2 = window.__dev.noAggro(); noAggroIdle = (n2.enemies || []).length > 0 && (n2.enemies || []).every(e => e.state !== "chase");
      window.__dev.noAggro({ clear: true }); }
    return { hp0, hp1, restedGrew, noAggroIdle }; });
  await escToPlay(page);
  ok("15 arc regression LIVE (BOUNTY on): SAFEZONE regen heals + Descanso accrues + No-Aggro idle",
     regr.hp1 > regr.hp0 + 1 && (regr.restedGrew === null || regr.restedGrew === true) && (regr.noAggroIdle === null || regr.noAggroIdle === true),
     `hp ${regr.hp0}→${regr.hp1} restedGrew=${regr.restedGrew} noAggroIdle=${regr.noAggroIdle}`);

  // 16 Temple respawn + RECALL bind intact (stack capstones): die ⇒ respawn home at Templo; bind fixes Recall bindPoint in zone
  const capstone = await page.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    let respawn = { skip: true };
    if (window.__dev.templeRespawn && window.__dev.templeRespawn().enabled) {
      window.__dev.tp(2, 2); await s(160); const tr = window.__dev.templeRespawn({ respawn: true }); await s(120);
      respawn = { skip: false, inSafe: tr.inSafeZone, near: tr.nearTemple }; }
    let recall = { skip: true };
    if (window.__dev.recall && window.__dev.recall().enabled) {
      const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(220);
      const r = window.__dev.recall(); recall = { skip: false, bound: r.bound, dist: r.bindPoint ? Math.hypot(r.bindPoint.x - r.sanctuary.x, r.bindPoint.y - r.sanctuary.y) : null }; }
    return { respawn, recall }; });
  await escToPlay(page);
  ok("16 stack capstones intact: Temple respawn lands home (inSafeZone+nearTemple) + RECALL binds in zone (dist≈0)",
     (capstone.respawn.skip || (capstone.respawn.inSafe === true && capstone.respawn.near === true)) &&
     (capstone.recall.skip || (capstone.recall.bound === true && capstone.recall.dist < 1)),
     `respawn=${JSON.stringify(capstone.respawn)} recall=${JSON.stringify(capstone.recall)}`);

  // 17 core loop LIVE: keyboard movement (max Δ across W/A/S/D at the OPEN hub spawn) + combat kill via real killEnemy
  const core = await page.evaluate(async (sp) => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.tp(sp.x / 32, sp.y / 32); await s(220);
    for (let i = 0; i < 8 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(90); }
    const scene = window.__dev.scene();
    const press = async (code, key) => { const b = window.__dev.hero();
      window.dispatchEvent(new KeyboardEvent("keydown", { code, key, bubbles: true })); await s(420);
      window.dispatchEvent(new KeyboardEvent("keyup", { code, key, bubbles: true })); await s(60);
      const a = window.__dev.hero(); return Math.hypot(a.x - b.x, a.y - b.y); };
    let best = 0;
    for (const [c, k] of [["KeyD", "d"], ["KeyA", "a"], ["KeyW", "w"], ["KeyS", "s"]]) best = Math.max(best, await press(c, k));
    const k0 = window.__dev.bounty().kills; window.__dev.spawnKill("rat"); const k1 = window.__dev.bounty().kills;  // combat/kill path lands
    return { scene, moved: best, killed: k1 > k0 }; }, spawn);
  await escToPlay(page);
  ok("17 core loop LIVE: keyboard movement drives hero + kill path lands (killEnemy bumps counter)",
     core.scene === "play" && core.moved > 15 && core.killed === true, `scene=${core.scene} maxΔ=${core.moved.toFixed(1)}px killed=${core.killed}`);

  // 18 desk fps
  const dfps = await medFps(page);
  report.desk.fps = dfps;
  ok("18 desk fps ≥58 (median-of-3) with BOUNTY LIVE", dfps >= 58, `fps≈${dfps}`);
  await page.close();

  // ---------------- MOBILE ----------------
  const mp = await browser.newPage();
  await mp.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1");
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const mErr = [], mNet404 = [];
  wireErrs(mp, mErr, mNet404);
  await mp.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}m`, { waitUntil: "networkidle2", timeout: 45000 });
  await toPlay(mp);
  ok("19 MOBILE boots to play on LIVE, 0 err, 0 404", (await mp.evaluate(() => window.__dev.scene() === "play")) && mErr.length === 0 && mNet404.length === 0,
     `err=${mErr.length} 404=${mNet404.length}`);

  // 20 mobile touch-move (virtual stick) at the OPEN spawn (before any tp — CAS-2254 footgun)
  const moved = await mp.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const b = window.__dev.hero(); const sx = rect.left + rect.width * 0.20, sy = rect.top + rect.height * 0.72;
    window.dispatchEvent(new Event("touchstart"));
    const pd = (t, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: 1, pointerType: "touch", clientX: x, clientY: y, bubbles: true }));
    pd("pointerdown", sx, sy);
    for (let i = 0; i < 16; i++) { pd("pointermove", sx + 55, sy); await s(50); }
    pd("pointerup", sx + 55, sy);
    const a = window.__dev.hero(); return Math.hypot(a.x - b.x, a.y - b.y); });
  ok("20 MOBILE touch-move drives hero (virtual stick)", moved > 20, `Δ=${moved.toFixed(1)}px`);

  // 21 mobile default-ON + accept/complete/claim reachable through the real chokepoint (tryBounty via __dev.act), gold+rotation land
  //   (NOTE: mobile has NO player-facing bounty trigger at all — no HUD button, and KeyB does not apply on touch; tracked in CAS-2273.)
  const mFlow = await mp.evaluate(async () => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.bounty({ clear: true, setIdx: 1 });  // wolves, count 6
    const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); await s(240);
    for (let i = 0; i < 6 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await s(80); }
    const acc = window.__dev.bounty({ act: true }); const enabled = acc.enabled; const accepted = acc.result === "accepted" && acc.active && acc.active.target === "wolf";
    const goldPre = acc.gold, idxPre = acc.bountyIdx, reward = acc.active ? acc.active.gold : 0;
    let guard = 0; while (!window.__dev.bounty().complete && guard++ < 20) window.__dev.spawnKill("wolf");
    const post = window.__dev.bounty({ act: true });
    return { enabled, accepted, goldGain: post.gold - goldPre, reward, cleared: post.active === null, rotated: post.bountyIdx === idxPre + 1 }; });
  await escToPlay(mp);
  ok("21 MOBILE default-ON full loop: accept→complete→claim (gold += reward, cleared, rotation advances)",
     mFlow.enabled === true && mFlow.accepted === true && mFlow.goldGain === mFlow.reward && mFlow.cleared === true && mFlow.rotated === true,
     `enabled=${mFlow.enabled} accepted=${mFlow.accepted} goldΔ=${mFlow.goldGain}/${mFlow.reward} cleared=${mFlow.cleared} rotated=${mFlow.rotated}`);

  // 22 mobile fps
  const mfps = await medFps(mp);
  report.mobile.fps = mfps;
  ok("22 MOBILE fps ≥55 (median-of-3) with BOUNTY LIVE", mfps >= 55, `fps≈${mfps}`);
  await mp.screenshot({ path: join(OUT, "live-mobile-bounty.png") });

  ok("0 no JS errors + no non-favicon 404 across desktop+mobile",
     errors.length === 0 && net404.length === 0 && mErr.length === 0 && mNet404.length === 0,
     [...errors, ...net404, ...mErr, ...mNet404].slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\nBUILD ${report.build} (expect ${EXPECT_BUILD}) desk=${report.desk.fps}fps mobile=${report.mobile.fps}fps`);
console.log(`${PASS}/${PASS + FAIL} checks passed (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
