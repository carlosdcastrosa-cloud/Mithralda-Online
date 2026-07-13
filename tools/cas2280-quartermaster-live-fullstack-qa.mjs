// CAS-2280 — QA POST-FLIP LIVE of INTENDENTE DEL SANTUARIO / SANCTUARY QUARTERMASTER (SANCTUARY_REWARDS.enabled:true).
// Runs against the SERVED gh-pages build (LIVE), NOT a local server: proves the CAS-2279 flip is real for players.
// Post-flip differentiator vs the DARK observable (CAS-2278): the flag is enabled:true from the SERVED config with NO
// __dev flip — the whole reward-vendor loop runs on the default-ON build the way a real player receives it.
//   1  boot LIVE, build===37550201780f, quartermaster + arc hooks, 0 err, 0 non-favicon 404.
//   2  served config LIVE: all 7 arc flags enabled:true (SANCTUARY_REWARDS + SANCTUARY_REP/BOUNTY_BOARD/RECALL/
//      SAFEZONE/TEMPLE_RESPAWN/RESTED_XP) + SANCTUARY_REWARDS.key==="Delete" (anti-CAS-2220 consistency-HEAD).
//   3  DEFAULT-ON (no __dev flip): quartermaster().enabled===true AND hasField===false at boot (byte-id OFF preserved).
//   4  rank-gated unlock at EVERY threshold via the real sanctuaryRep field (0/150/450/1000/2000 ⇒ 0/1/2/3/4 unlocked).
//   5  claim via the REAL Delete/Supr KEY in zone (desktop player route) ⇒ lowest-rank first, field created (CAS-2273 lesson).
//   6  claims in order + idempotent (all 4 canonical order; a 5th ⇒ 'done', no dup).
//   7  effects apply EXACTLY to the reused live knobs (recallCd 0.20 / restedCap 0.50 / safeRegen 0.40 / restedMult 0.15).
//   8  real recall knob carries the reward (recall().cooldownSec≈384, a real cast sets the reduced cd, not base 480).
//   9  renown title = highest claimed rank (Exaltado del Santuario).
//  10  gating: rep-too-low in zone ⇒ 'locked'; claim OUTSIDE the sanctuary ⇒ 'away'.
//  11  PERSISTENCE: a claimed reward survives saveNow + a REAL page reload (h.sanctuaryRewards rehydrates; effects stay).
//  12  reversibility (1-line revert proof): in-mem enabled:false ⇒ effects 0, recallCdSec back to base 480, claim ⇒ 'off'.
//  13  FULL-STACK 7-FLAG ARC regression ON: WASD move + real kill + Bounty(End) reachable + Recall(Home) teleports +
//      SAFEZONE regen + Rested accrual + reward claim — the whole recall→bounty→rep→reward loop with REWARDS live.
//  14  desktop fps ≥58 (calm inZone, median-of-3).
//  15  MOBILE: touch viewport boots default-ON; real tb.quartermaster tap @slot6.65 claims WITH an ult drafted
//      (collision with tb.ult resolved, CAS-2278 blocker 18b), gated OUTSIDE the hub, fps ≥58, 0 err.
// Run: node tools/cas2280-quartermaster-live-fullstack-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "37550201780f";
const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const OUT = join(ROOT, "shots", "cas2280");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && ['menu','play','classsel'].includes(window.__dev.scene())", { timeout: 30000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") return; // resumed from save
  if (await page.evaluate(() => window.__dev.scene()) === "menu") {
    await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
      window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 10000 });
  }
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 10000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 });
  await sleep(500);
}
async function escToPlay(page) {
  for (let i = 0; i < 6; i++) {
    if (await page.evaluate(() => window.__dev.scene() === "play")) break;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })));
    await sleep(80);
  }
}
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); }); await sleep(300); await escToPlay(page); return page.evaluate(() => window.__dev.safeZone().inZone); };
async function ensureZone(page) { for (let i = 0; i < 4; i++) { if (await toZone(page)) return true; await sleep(120); } return false; }
const toWild = async (page) => { await page.evaluate(() => window.__dev.tpZone && window.__dev.tpZone("forest")); await sleep(200); await escToPlay(page); return page.evaluate(() => window.__dev.safeZone().inZone); };

const fps1 = (page) => page.evaluate(() => new Promise(res => { let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 >= 1000) res(f); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
async function fpsMedian3(page) { const a = []; for (let i = 0; i < 3; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[1]; }

// press the REAL dedicated key (Delete/Supr) — proves the binding, not just the __dev claim (CAS-2273 lesson).
const pressSupr = (page) => page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Delete", key: "Delete", bubbles: true })));

const completeOneBounty = (page) => page.evaluate(() => {
  const acc = window.__dev.bounty({ act: true });
  if (!acc.active) return { ok: false, reason: acc.result };
  window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });
  const claim = window.__dev.bounty({ act: true });
  return { ok: claim.result === "claimed", claim };
});

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], net404 = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) net404.push(`${r.status()} ${r.url()}`); });
  // clear shared localStorage ONCE (first document only, guarded by sessionStorage) so the REAL reload keeps the save (persistence #11)
  await page.evaluateOnNewDocument(() => { try { if (!sessionStorage.getItem("__qa_booted")) { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); sessionStorage.setItem("__qa_booted", "1"); } } catch (e) {} });
  await page.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 60000 });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot clean + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.quartermaster && window.__dev.sanctuary && window.__dev.bounty
    && window.__dev.safeZone && window.__dev.recall && window.__dev.rested && window.__dev.hero && window.__dev.saveNow && window.__dev.saveBlob));
  ok("1 boot LIVE, build===37550201780f, quartermaster+arc+save hooks, 0 err, 0 non-favicon 404",
     build === EXPECT_BUILD && hooks && errors.length === 0 && net404.length === 0, `build=${build} hooks=${hooks} err=${errors.length} 404=${net404.length}`);

  // 2 served config LIVE: all 7 arc flags enabled:true + SANCTUARY_REWARDS.key==="Delete"
  const cfg = await page.evaluate(async (LIVE) => {
    const t = await (await fetch(`${LIVE}/sim/config.js?cb=${Date.now()}`)).text();
    const flagEnabled = (name) => { const i = t.indexOf(`export const ${name}`); if (i < 0) return null;
      const blk = t.slice(i, i + 500); const m = blk.match(/enabled:\s*(true|false)/); return m ? m[1] : null; };
    const flags = ["SANCTUARY_REWARDS", "SANCTUARY_REP", "BOUNTY_BOARD", "RECALL", "SAFEZONE", "TEMPLE_RESPAWN", "RESTED_XP"];
    const states = {}; for (const f of flags) states[f] = flagEnabled(f);
    const ri = t.indexOf("export const SANCTUARY_REWARDS"); const rblk = t.slice(ri, ri + 500);
    const key = (rblk.match(/key:\s*"([^"]+)"/) || [])[1];
    return { states, key };
  }, LIVE);
  const all7 = Object.values(cfg.states).every(v => v === "true") && Object.keys(cfg.states).length === 7;
  ok("2 served config LIVE: all 7 arc flags enabled:true AND SANCTUARY_REWARDS.key===\"Delete\"",
     all7 && cfg.key === "Delete", `${Object.entries(cfg.states).map(([k, v]) => k + "=" + v).join(" ")} key=${cfg.key}`);

  // 3 DEFAULT-ON, no __dev flip: enabled true AND hasField false at boot (byte-id OFF preserved: field created only on claim)
  const q0 = await page.evaluate(() => window.__dev.quartermaster());
  ok("3 DEFAULT-ON (no flip): quartermaster().enabled=true AND hasField=false at boot (byte-id OFF preserved)",
     q0.enabled === true && q0.hasField === false && q0.claimedIds.length === 0, `enabled=${q0.enabled} hasField=${q0.hasField} claimed=${q0.claimedIds.length}`);

  // 4 rank-gated unlock at EVERY threshold via the real sanctuaryRep field
  const gate = await page.evaluate(() => {
    const rows = [];
    for (const [rep, expect] of [[0, 0], [150, 1], [450, 2], [1000, 3], [2000, 4]]) {
      window.__dev.sanctuary({ setRep: rep }); const q = window.__dev.quartermaster();
      rows.push({ rep, unlocked: q.rewards.filter(r => r.unlocked).length, expect });
    }
    return rows;
  });
  ok("4 rank-gated unlock matches rep at every threshold (0/150/450/1000/2000 ⇒ 0/1/2/3/4 unlocked)",
     gate.every(r => r.unlocked === r.expect), gate.map(r => `${r.rep}:${r.unlocked}`).join(" "));

  // 5 claim via the REAL Delete/Supr key in zone ⇒ lowest-rank first, field created
  await ensureZone(page);
  await page.evaluate(() => window.__dev.sanctuary({ setRep: 2000 }));  // Exaltado ⇒ all 4 unlocked
  const preClaim = await page.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await pressSupr(page); await sleep(80);
  const c1 = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  const hasFieldNow = await page.evaluate(() => window.__dev.quartermaster().hasField);
  ok("5 REAL Delete key in zone claims lowest-rank first (swift_return), field created",
     preClaim === 0 && c1.length === 1 && c1[0] === "swift_return" && hasFieldNow === true, `claimed=${JSON.stringify(c1)}`);

  // 6 claim the rest in order + idempotent: 3 more presses ⇒ all 4 canonical order; a 5th ⇒ 'done', no dup
  await pressSupr(page); await pressSupr(page); await pressSupr(page); await sleep(80);
  const c4 = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  const doneRes = await page.evaluate(() => window.__dev.quartermaster({ claim: true }).result);
  const c4b = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  ok("6 claims in order, idempotent (all 4, 5th ⇒ 'done', no dup)",
     JSON.stringify(c4) === JSON.stringify(["swift_return", "deep_reserves", "temple_grace", "pilgrims_zeal"])
     && doneRes === "done" && c4b.length === 4, `res=${doneRes} ids=${c4.length}`);

  // 7 effects apply exactly to the reused knobs
  const eff = await page.evaluate(() => window.__dev.quartermaster());
  ok("7 effects apply exactly: recallCd 0.20 / restedCap 0.50 / safeRegen 0.40 / restedMult 0.15; recallCdSec≈384, restedCap≈900",
     eff.effects.recallCd === 0.20 && eff.effects.restedCap === 0.50 && eff.effects.safeRegen === 0.40 && eff.effects.restedMult === 0.15
     && near(eff.recallCdSec, 480 * 0.8, 0.01) && near(eff.restedCap, 600 * 1.5, 0.01),
     `recallCdSec=${eff.recallCdSec} restedCap=${eff.restedCap}`);

  // 8 REAL recall knob carries the reward
  const rec = await page.evaluate(() => { window.__dev.recall({ bind: true }); const r = window.__dev.recall({ cast: true });
    const snap = window.__dev.recall(); return { result: r.result, recallCD: snap.recallCD, cooldownSec: snap.cooldownSec }; });
  ok("8 recall knob carries the reward: recall().cooldownSec≈384 + cast sets reduced cd (not base 480)",
     near(rec.cooldownSec, 384, 0.5) && (rec.recallCD === 0 || (rec.recallCD > 300 && rec.recallCD <= 400)),
     `cooldownSec=${rec.cooldownSec} recallCD=${rec.recallCD} cast=${rec.result}`);

  // 9 renown title = highest claimed rank
  ok("9 renown title = highest claimed rank (Exaltado del Santuario)", eff.title === "Exaltado del Santuario", `title="${eff.title}"`);

  // 10 gating: rep-too-low in zone ⇒ 'locked'; claim OUTSIDE sanctuary ⇒ 'away'
  const lockedRes = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.quartermaster({ claim: true }).result; });
  await toWild(page);
  const awayRes = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); return window.__dev.quartermaster({ claim: true }).result; });
  await ensureZone(page);
  ok("10 gating: rep-too-low in zone ⇒ 'locked'; claim OUTSIDE the sanctuary ⇒ 'away'",
     lockedRes === "locked" && awayRes === "away", `locked=${lockedRes} away=${awayRes}`);

  // 11 PERSISTENCE across a REAL page reload: claim a reward, saveNow, reload ⇒ h.sanctuaryRewards rehydrates + effects stay
  await ensureZone(page);
  await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); });
  await pressSupr(page); await sleep(80);                       // claim swift_return (at least 1)
  const prePersist = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  const blob = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob() || {}));
  await page.evaluate(() => window.__dev.saveNow());
  await page.reload({ waitUntil: "networkidle2", timeout: 60000 });
  await toPlay(page);
  const post = await page.evaluate(() => window.__dev.quartermaster());
  ok("11 persistence: sanctuaryRewards in save blob + claim survives REAL reload (effects rehydrate, recallCdSec reduced)",
     /sanctuaryRewards/.test(blob) && prePersist.includes("swift_return") && post.claimedIds.includes("swift_return")
     && post.hasField === true && post.recallCdSec < 480,
     `blobKey=${/sanctuaryRewards/.test(blob)} pre=${JSON.stringify(prePersist)} post=${JSON.stringify(post.claimedIds)} recallCdSec=${post.recallCdSec}`);

  // 12 reversibility (1-line revert proof): in-mem enabled:false ⇒ effects 0, recallCdSec base 480, claim ⇒ 'off'
  const rev = await page.evaluate(() => { window.__dev.quartermaster({ enabled: false });
    const q = window.__dev.quartermaster(); const cl = window.__dev.quartermaster({ claim: true }).result;
    window.__dev.quartermaster({ enabled: true }); return { q, cl }; });
  ok("12 reversible OFF: effects 0, recallCdSec==base 480, claim ⇒ 'off'",
     rev.q.effects.recallCd === 0 && near(rev.q.recallCdSec, 480, 0.01) && rev.cl === "off", `recallCdSec=${rev.q.recallCdSec} claim=${rev.cl}`);

  // 13 FULL-STACK 7-FLAG ARC regression ON (all served enabled:true): recall→bounty→rep→reward loop live
  // 13a WASD movement from OPEN spawn (avoid prop-collision false-negative)
  const spawn = await page.evaluate(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; });
  await page.evaluate((s) => window.__dev.tp(s.x / 32, s.y / 32), spawn);
  await escToPlay(page);
  const moved = await page.evaluate(async () => {
    const h0 = window.__dev.hero(); const x0 = h0.x, y0 = h0.y; let md = 0;
    for (const code of ["KeyD", "KeyS", "KeyA", "KeyW"]) {
      window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.slice(3), bubbles: true }));
      await new Promise(r => setTimeout(r, 260));
      window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code.slice(3), bubbles: true }));
      const h = window.__dev.hero(); md = Math.max(md, Math.hypot(h.x - x0, h.y - y0));
    }
    return md;
  });
  // 13b combat: real kill via spawnKill (REAL killEnemy path bumps h.kills)
  const killed = await page.evaluate(() => { const before = window.__dev.bounty().kills | 0;
    window.__dev.spawnKill("rat"); return (window.__dev.bounty().kills | 0) - before; });
  // 13c Bounty Board reachable via REAL "End" key inZone + accrues rep (bounty→rep link)
  await ensureZone(page);
  await page.evaluate(() => window.__dev.bounty({ clear: true, setIdx: 1 }));
  await sleep(80);
  const preB = await page.evaluate(() => window.__dev.bounty().active);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "End", key: "End", bubbles: true })));
  await sleep(160);
  const postB = await page.evaluate(() => window.__dev.bounty().active);
  const bountyReachable = !preB && !!postB;
  const repBefore = await page.evaluate(() => window.__dev.sanctuary().rep | 0);
  const cb = await completeOneBounty(page);
  const repAfter = await page.evaluate(() => window.__dev.sanctuary().rep | 0);
  await escToPlay(page);
  // 13d Recall via REAL "Home" key: bind auto-set inZone (13c), tp to wilderness, recall back.
  //     Reset the recall cooldown first — check 8 already cast recall (consumed the CD) ⇒ Home would no-op on 'cooldown'.
  await page.evaluate(() => { window.__dev.recall({ bind: true }); window.__dev.recall({ setCd: 0 }); });
  await page.evaluate(() => window.__dev.tp(40, 40));
  await escToPlay(page);
  const rPre = await page.evaluate(() => ({ inZone: window.__dev.safeZone().inZone, ...(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; })() }));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Home", key: "Home", bubbles: true })));
  await sleep(300);
  const rPost = await page.evaluate(() => ({ inZone: window.__dev.safeZone().inZone, ...(() => { const h = window.__dev.hero(); return { x: h.x, y: h.y }; })() }));
  const recallWorked = rPre.inZone === false && (rPost.inZone === true || Math.hypot(rPost.x - rPre.x, rPost.y - rPre.y) > 200);
  // 13e safezone regen + rested + reward claim (real Delete) close the loop
  await ensureZone(page);
  const arc = await page.evaluate(async () => {
    const s = (ms) => new Promise(r => setTimeout(r, ms));
    window.__dev.safeZone({ setHp: 40, pause: 0 }); await s(500); const hp2 = window.__dev.safeZone().hp;
    const rested = window.__dev.rested ? window.__dev.rested() : null;
    return { hpAfter: hp2, restedEnabled: rested ? rested.enabled : null,
      safeEnabled: window.__dev.safeZone().enabled, recallEnabled: window.__dev.recall().enabled,
      inZone: window.__dev.safeZone().inZone };
  });
  // reward layer of the loop intact: rep→reward→knob still applies after the whole arc (all 4 already claimed earlier ⇒
  // the vendor chokepoint responds 'done' AND the claimed rewards keep reducing the recall knob = loop closed, 0 regression).
  const rw = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 });
    return { claimRes: window.__dev.quartermaster({ claim: true }).result, recallCdSec: window.__dev.quartermaster().recallCdSec, claimed: window.__dev.quartermaster().claimedIds.length }; });
  const rewardLoopOk = rw.claimRes === "done" && rw.claimed === 4 && rw.recallCdSec < 480;
  ok("13 full-stack 7-flag arc ON: WASD + kill + Bounty(End)+rep + Recall(Home) + SAFEZONE regen + Rested + reward-loop intact",
     moved > 4 && killed >= 1 && bountyReachable && cb.ok && repAfter > repBefore && recallWorked
     && arc.hpAfter > 40 && arc.restedEnabled && arc.safeEnabled && arc.recallEnabled && arc.inZone && rewardLoopOk,
     `move=${moved.toFixed(1)} kill=${killed} bountyEnd=${bountyReachable} rep ${repBefore}->${repAfter} recall=${recallWorked} hp=${arc.hpAfter} rested=${arc.restedEnabled} reward=${rw.claimRes}/cd${rw.recallCdSec}`);

  // 14 desktop fps
  await ensureZone(page);
  await sleep(600);
  const fps = await fpsMedian3(page);
  ok("14 desktop fps ≥58 with REWARDS ON (calm inZone, median-of-3)", fps >= 58, `fps≈${fps}`);
  await page.screenshot({ path: join(OUT, "desktop-final.png") }).catch(() => {});
  ok("14b 0 JS errors, 0 non-favicon 404 across desktop pass", errors.length === 0 && net404.length === 0, `err=${errors.length} 404=${net404.length}`);

  // 15 MOBILE: default-ON touch boot, real tb.quartermaster tap @slot6.65 claims WITH an ult drafted (collision resolved), gated in wild
  const mp = await browser.newPage();
  await mp.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
  const merr = [], mnet = [];
  mp.on("pageerror", (e) => merr.push(String(e)));
  mp.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) merr.push(m.text()); });
  mp.on("requestfailed", (r) => { if (!/favicon/.test(r.url())) mnet.push(r.url()); });
  mp.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) mnet.push(`${r.status()} ${r.url()}`); });
  await mp.evaluateOnNewDocument(() => { try { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); } catch (e) {} });
  await mp.goto(`${LIVE}/?dev=1&cb=${EXPECT_BUILD}`, { waitUntil: "networkidle2", timeout: 60000 });
  await toPlay(mp);
  const mEnabled = await mp.evaluate(() => window.__dev.quartermaster().enabled);
  await mp.evaluate(() => { window.dispatchEvent(new Event("touchstart")); window.__dev.sanctuary({ setRep: 2000 }); });
  const mInZone = await ensureZone(mp); await sleep(150);
  const tapSlot = (p, slot) => p.evaluate(async (slotMul) => { const s = (ms) => new Promise(r => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const VW = rect.width, VH = rect.height; const m = 14; const bs = Math.max(56, Math.min(VW, VH) * 0.115);
    const bx = m + bs * 0.5, by = VH - m - bs * slotMul;
    window.dispatchEvent(new Event("touchstart"));
    cv.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 4, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(60);
    cv.dispatchEvent(new PointerEvent("pointerup", { pointerId: 4, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(140); }, slot);
  const tapQM = (p) => tapSlot(p, 6.65);                        // tb.quartermaster FIXED slot (input.js, commit 4592074)

  // 15a with a drafted ULTIMATE present, the tb.quartermaster tap @slot6.65 MUST claim (blocker 18b resolved: no longer shadowed by tb.ult)
  await mp.evaluate(() => { const m = window.__dev.ultMeta(); if (window.__dev.setUltId) window.__dev.setUltId(m.ults[0].id); });
  const mPreU = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapQM(mp);
  const mWithUlt = await mp.evaluate(() => window.__dev.quartermaster().claimedIds);
  ok("15a MOBILE (ult drafted) tb.quartermaster tap @slot6.65 claims via tryQuartermaster (collision 18b resolved)",
     mEnabled === true && mInZone && mWithUlt.length === mPreU + 1 && mWithUlt[0] === "swift_return",
     `enabled=${mEnabled} inZone=${mInZone} preUlt=${mPreU} claimed=${JSON.stringify(mWithUlt)}`);

  // 15b gated OUTSIDE the hub: same tap does NOT claim more (button gated to sanctuary)
  await mp.evaluate(() => { if (window.__dev.setUltId) window.__dev.setUltId("__none__"); });
  await toWild(mp);
  const mWildBefore = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapQM(mp);
  const mWildAfter = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await ensureZone(mp);
  const mfps = await fpsMedian3(mp);
  await mp.screenshot({ path: join(OUT, "mobile-final.png") }).catch(() => {});
  ok("15b MOBILE tap OUTSIDE sanctuary does NOT claim (hub-gated); mobile fps ≥58, 0 err, 0 404",
     mWildAfter === mWildBefore && mfps >= 58 && merr.length === 0 && mnet.length === 0,
     `wild ${mWildBefore}->${mWildAfter} fps≈${mfps} err=${merr.length} 404=${mnet.length}`);

  console.log(`\nbuild=${build}\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  try { await browser.close(); } catch (e) {}
}
process.exit(FAIL ? 1 : 0);
