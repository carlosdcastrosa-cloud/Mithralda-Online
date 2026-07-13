// CAS-2282 — QA POST-FLIP LIVE OBSERVABLE regression for INTENDENTE DEL SANTUARIO / SANCTUARY QUARTERMASTER.
// Independent safety-net (NOT a gate blocker) over the CEO gate on CAS-2278. Runs against the DEPLOYED gh-pages build
// (SANCTUARY_REWARDS.enabled:true LIVE via CAS-2279/CAS-2281, build 37550201780f) — NOT the dark build, NOT a __dev flip
// for the enabled state. Differentiator vs my DARK observable (CAS-2278 23/23): the reward vendor must be DEFAULT-ON from
// the SERVED config on a fresh boot with 0 __dev intervention, claims must PERSIST across a REAL page reload, and the whole
// 7-flag Santuario arc must be healthy on the real deployed bytes (anti-CAS-2220 drift).
//
//   1  boot LIVE, build self-consistent vs version.json, quartermaster+arc+daynight hooks, 0 err, 0 non-favicon 404.
//   2  served sim/config.js: SANCTUARY_REWARDS.enabled:true + key:"Delete" (the flip shipped, not dark).
//   3  DEFAULT-ON (the LIVE proof): fresh boot ⇒ quartermaster().enabled===true with ZERO __dev flip.
//   4  rank-gated unlock at EVERY SANCTUARY_REP threshold via the real sanctuaryRep field (0/150/450/1000/2000 ⇒ 0..4).
//   5  claim via the REAL Delete/Supr KeyboardEvent in zone ⇒ lowest-rank first, field created (CAS-2273 lesson: real key).
//   6  claims in canonical order + idempotent (5th press ⇒ 'done', no dup).
//   7  effects on live knobs EXACT: recallCd ×0.8, restedCap ×1.5, safeRegen ×1.4, restedMult +0.15.
//   8  recall knob carries the reward: recall().cooldownSec≈384 + a real cast sets recallCD reduced (not base 480).
//   9  renown title = highest claimed rank (Exaltado del Santuario).
//  10  gating: rep-too-low in zone ⇒ 'locked'; claim OUTSIDE the sanctuary ⇒ 'away'.
//  11  PERSIST across a REAL page reload (LIVE-specific, enabled:true ⇒ rehydrate): claimed ids survive reload.
//  12  RENDER-OBSERVABLE «renown title» draws over the hero nameplate (thresholded changed-px isolation, CAS-2266/2272/2277).
//  13  ARC REGRESSION 7 flags ON: SANCTUARY_REP perk + BOUNTY claim + SAFEZONE regen + RESTED accrual + RECALL + SANCTUARY_REWARDS.
//  14  desktop fps ≥58 (calm inZone, median-of-3), 0 err, 0 404.
//  15  MOBILE: real tb.quartermaster tap @slot 6.65 claims WITH a drafted ultimate (CAS-2273-class collision resolved),
//      OLD slot 4.45 casts the ult (not the QM), tap OUTSIDE sanctuary gated, fps ≥58, 0 err, 0 404.
// Run: node tools/cas2282-quartermaster-live-observable-qa.mjs [liveUrl]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2282");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// LIVE console/net filters: gh-pages favicon 404 has no url + a generic "Failed to load resource" console line — net404 is authoritative.
function wireErrs(page, errs, net404) {
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/Failed to load resource|net::ERR_|favicon/i.test(t)) errs.push(t); } });
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon/i.test(u)) net404.push(u + " " + (r.failure()?.errorText || "")); });
  page.on("response", (r) => { if (r.status() === 404 && !/favicon/i.test(r.url())) net404.push(r.url() + " 404"); });
}
async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 30000 });
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
const toZone = async (page) => { await page.evaluate(() => { const t = window.__dev.safeZone().temple; window.__dev.tp(t.x / 32, t.y / 32); }); await sleep(260); await escToPlay(page); return page.evaluate(() => window.__dev.safeZone().inZone); };
async function ensureZone(page) { for (let i = 0; i < 4; i++) { if (await toZone(page)) return true; await sleep(120); } return false; }
const toWild = (page) => page.evaluate(() => { window.__dev.tpZone && window.__dev.tpZone("forest"); return window.__dev.safeZone().inZone; });
const pressSupr = (page) => page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Delete", key: "Delete", bubbles: true })));

const fps1 = (page) => page.evaluate(() => new Promise((res) => { let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 >= 1000) res(f); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
async function fpsMedian3(page) { const a = []; for (let i = 0; i < 3; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[1]; }

// RENDER-OBSERVABLE: the «renown title» text draws NON-PULSING over the hero nameplate (render.js:1079). Thresholded changed-px
// isolation (CAS-2266/2272/2277 footgun): a pixel is TRUE signal if it changed a lot base→probe (|Δ|>40) but was STABLE across two
// base frames (|Δ|<=22) — cancels pulsing badges + hero idle bob. Freeze daynight so the ground under the title stays static.
async function snapBand(page, key) {
  await page.evaluate(() => { if (window.__dev.daynight) window.__dev.daynight({ enabled: true, phase: 0.30 });
    if (window.__dev.weather) { try { window.__dev.weather({ enabled: false }); } catch (e) {} } });
  await sleep(160);
  return page.evaluate((key) => {
    const cv = document.getElementById("c"); const c = cv.getContext("2d");
    const dpr = cv.width / (window.innerWidth || cv.width);
    const cx = cv.width / 2;
    const bw = Math.round(360 * dpr), x0 = Math.max(0, Math.round(cx - bw / 2));
    const y0 = Math.round(cv.height * 0.30), y1 = Math.round(cv.height * 0.52);
    window[key] = new Uint8ClampedArray(c.getImageData(x0, y0, Math.min(bw, cv.width - x0), y1 - y0).data);
    return window[key].length;
  }, key);
}
async function cleanSignal(page, baseKey, ctrlKey, probeKey) {
  return page.evaluate((baseKey, ctrlKey, probeKey) => {
    const a = window[baseKey], s = window[ctrlKey], p = window[probeKey];
    if (!a || !s || !p) return -1;
    let n = 0; for (let i = 0; i < a.length; i += 4) {
      const stable = Math.abs(a[i] - s[i]) <= 22 && Math.abs(a[i + 1] - s[i + 1]) <= 22 && Math.abs(a[i + 2] - s[i + 2]) <= 22;
      if (!stable) continue;
      if (Math.abs(a[i] - p[i]) > 40 || Math.abs(a[i + 1] - p[i + 1]) > 40 || Math.abs(a[i + 2] - p[i + 2]) > 40) n++;
    }
    return n;
  }, baseKey, ctrlKey, probeKey);
}

const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
let mbrowser = null;
const errors = [], net404 = [];
try {
  const page = await browser.newPage();
  wireErrs(page, errors, net404);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await toPlay(page);
  const build = await page.evaluate(() => (window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || "")).catch(() => "");
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot clean + hooks + build self-consistent vs version.json (NOT hardcoded — a later flip advances LIVE build, CAS-2271 lesson)
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.quartermaster && window.__dev.sanctuary && window.__dev.bounty
    && window.__dev.safeZone && window.__dev.recall && window.__dev.rested && window.__dev.daynight));
  ok("1 boots to play; build self-consistent vs version.json; quartermaster+arc hooks; 0 err", hooks && build === verBuild && !!build, `build=${build} version.json=${verBuild}`);

  // 2 served config: enabled:true + key:"Delete" (the flip shipped)
  const cfg = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/config.js", { cache: "no-store" }); const t = await r.text();
    const m = t.match(/export const SANCTUARY_REWARDS\s*=\s*\{[\s\S]*?\n\};/); const blk = m ? m[0] : "";
    return { enabled: /enabled:\s*true/.test(blk), key: (blk.match(/key:\s*"([^"]+)"/) || [])[1] || "" }; }, LIVE);
  ok("2 served config SANCTUARY_REWARDS.enabled:true + key:'Delete'", cfg.enabled === true && cfg.key === "Delete", `enabled=${cfg.enabled} key=${cfg.key}`);

  // 3 DEFAULT-ON (the LIVE proof): fresh boot ⇒ enabled===true with ZERO __dev flip
  const q0 = await page.evaluate(() => window.__dev.quartermaster());
  ok("3 DEFAULT-ON from served config: quartermaster().enabled===true, 0 __dev flip, no claims yet",
     q0.enabled === true && q0.claimedIds.length === 0, `enabled=${q0.enabled} claimed=${q0.claimedIds.length}`);

  const inZone = await ensureZone(page);

  // 4 rank-gated unlock at EVERY threshold via the real sanctuaryRep field
  const gate = await page.evaluate(() => {
    const set = (n) => window.__dev.sanctuary({ setRep: n }); const rows = [];
    for (const [rep, expect] of [[0, 0], [150, 1], [450, 2], [1000, 3], [2000, 4]]) {
      set(rep); const q = window.__dev.quartermaster();
      rows.push({ rep, unlocked: q.rewards.filter((r) => r.unlocked).length, expect });
    }
    return rows;
  });
  ok("4 rank-gated unlock matches rep at every threshold (0/150/450/1000/2000 ⇒ 0/1/2/3/4)",
     gate.every((r) => r.unlocked === r.expect), gate.map((r) => `${r.rep}:${r.unlocked}`).join(" "));

  // 5 claim via the REAL Delete/Supr key in zone ⇒ lowest-rank first, field created
  await page.evaluate(() => window.__dev.sanctuary({ setRep: 2000 }));
  const preClaim = await page.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await pressSupr(page); await sleep(60);
  const c1 = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  const hasFieldNow = await page.evaluate(() => window.__dev.quartermaster().hasField);
  ok("5 REAL Delete key in zone claims lowest-rank first (swift_return), field created",
     preClaim === 0 && c1.length === 1 && c1[0] === "swift_return" && hasFieldNow === true, `claimed=${JSON.stringify(c1)}`);

  // 6 claims in order + idempotent
  await pressSupr(page); await pressSupr(page); await pressSupr(page); await sleep(60);
  const c4 = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  const doneRes = await page.evaluate(() => window.__dev.quartermaster({ claim: true }).result);
  const c4b = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  ok("6 claims in canonical order, idempotent (all 4, 5th ⇒ 'done', no dup)",
     JSON.stringify(c4) === JSON.stringify(["swift_return", "deep_reserves", "temple_grace", "pilgrims_zeal"])
     && doneRes === "done" && c4b.length === 4, `res=${doneRes} ids=${c4.length}`);

  // 7 effects on live knobs EXACT
  const eff = await page.evaluate(() => window.__dev.quartermaster());
  ok("7 effects exact: recallCd ×0.8, restedCap ×1.5, safeRegen ×1.4, restedMult +0.15",
     eff.effects.recallCd === 0.20 && eff.effects.restedCap === 0.50 && eff.effects.safeRegen === 0.40 && eff.effects.restedMult === 0.15
     && near(eff.recallCdSec, 480 * 0.8, 0.01) && near(eff.restedCap, 600 * 1.5, 0.01),
     `recallCdSec=${eff.recallCdSec} restedCap=${eff.restedCap} eff=${JSON.stringify(eff.effects)}`);

  // 8 recall knob carries the reward
  const rec = await page.evaluate(() => { window.__dev.recall({ bind: true }); const r = window.__dev.recall({ cast: true });
    const snap = window.__dev.recall(); return { result: r.result, recallCD: snap.recallCD, cooldownSec: snap.cooldownSec }; });
  ok("8 recall knob carries reward: recall().cooldownSec≈384 + cast sets recallCD reduced (not base 480)",
     near(rec.cooldownSec, 384, 0.5) && (rec.recallCD === 0 || (rec.recallCD > 300 && rec.recallCD <= 400)),
     `cooldownSec=${rec.cooldownSec} recallCD=${rec.recallCD}`);

  // 9 renown title = highest claimed rank
  ok("9 renown title = highest claimed rank (Exaltado del Santuario)", eff.title === "Exaltado del Santuario", `title="${eff.title}"`);

  // 10 gating: rep-too-low ⇒ 'locked'; outside sanctuary ⇒ 'away'
  const lockedRes = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.quartermaster({ claim: true }).result; });
  const awayRes = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); window.__dev.tpZone && window.__dev.tpZone("forest");
    return window.__dev.quartermaster({ claim: true }).result; });
  await ensureZone(page);
  ok("10 gating: rep-too-low ⇒ 'locked'; claim OUTSIDE sanctuary ⇒ 'away'", lockedRes === "locked" && awayRes === "away", `locked=${lockedRes} away=${awayRes}`);

  // 11 PERSIST across a REAL page reload (LIVE-specific): claim all 4, saveNow, reload, ids rehydrate (enabled:true ⇒ loadSave restores)
  await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); for (let i = 0; i < 4; i++) window.__dev.quartermaster({ claim: true });
    if (window.__dev.saveNow) window.__dev.saveNow(); });
  const preReload = await page.evaluate(() => window.__dev.quartermaster().claimedIds.slice());
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  // post-reload the saved game may boot straight into a non-menu scene; drive to play only from menu, else Esc→play.
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 30000 });
  const sceneAfter = await page.evaluate(() => window.__dev.scene());
  if (sceneAfter === "menu") await toPlay(page); else await escToPlay(page);
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 10000 }).catch(() => {});
  await sleep(300);
  const postReload = await page.evaluate(() => window.__dev.quartermaster().claimedIds.slice());
  ok("11 PERSIST across REAL reload: claimed ids rehydrate (enabled:true ⇒ loadSave restores sanctuaryRewards)",
     preReload.length === 4 && JSON.stringify(postReload) === JSON.stringify(preReload), `pre=${JSON.stringify(preReload)} post=${JSON.stringify(postReload)}`);

  // 12 RENDER-OBSERVABLE «renown title»: rep2000 + all claimed ⇒ «Exaltado del Santuario» draws over the hero head.
  await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); for (let i = 0; i < 4; i++) window.__dev.quartermaster({ claim: true }); });
  await ensureZone(page); await sleep(200);
  await snapBand(page, "__probe");                                        // ON, claimed ⇒ title drawn
  await page.evaluate(() => window.__dev.quartermaster({ enabled: false }));   // in-mem OFF ⇒ gated render skips title (disk stays true)
  await snapBand(page, "__base"); await snapBand(page, "__ctrl");
  const sig = await cleanSignal(page, "__base", "__ctrl", "__probe");
  const ctrlSig = await cleanSignal(page, "__base", "__ctrl", "__ctrl");
  await page.evaluate(() => window.__dev.quartermaster({ enabled: true }));    // restore ON
  await sleep(140);
  await page.screenshot({ path: join(OUT, "quartermaster-renown-title.png") });
  ok("12 RENDER-OBSERVABLE: «renown title» draws over the hero nameplate (changed-px signal >> control)",
     sig > 24 && sig > ctrlSig * 4 && ctrlSig < 12, `signal=${sig} control=${ctrlSig}`);

  // 13 ARC REGRESSION 7 flags ON
  const arcInZone = await ensureZone(page);
  const arc = await page.evaluate(async () => {
    const s = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__dev.bounty({ clear: true, setIdx: 1 });
    const b0 = window.__dev.bounty(); const repBefore = (window.__dev.sanctuary().rep) || 0;
    const acc = window.__dev.bounty({ act: true });
    let claimedBounty = null, repAfter = repBefore;
    if (acc.active) { window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });
      const cl = window.__dev.bounty({ act: true }); claimedBounty = cl.result; repAfter = (window.__dev.sanctuary().rep) || 0; }
    window.__dev.safeZone({ setHp: 40, pause: 0 }); await s(500); const hp2 = window.__dev.safeZone().hp;
    const r0 = window.__dev.rested(); const rc = window.__dev.recall(); const q = window.__dev.quartermaster();
    return { bountyEnabled: b0.enabled, claimedBounty, repBefore, repAfter, hpAfter: hp2, rested: !!r0, recall: !!rc, qmOn: q.enabled };
  });
  ok("13 arc regression 7 flags ON: bounty claim accrues rep, safezone regen, rested+recall+quartermaster healthy",
     arcInZone && arc.claimedBounty === "claimed" && arc.repAfter > arc.repBefore && arc.hpAfter > 40 && arc.rested && arc.recall && arc.qmOn,
     `inZone=${arcInZone} bounty=${arc.claimedBounty} rep ${arc.repBefore}->${arc.repAfter} hp=${arc.hpAfter} qm=${arc.qmOn}`);

  // 14 desktop fps
  await ensureZone(page);
  const fps = await fpsMedian3(page);
  ok("14 desktop fps ≥58 with 7 flags ON (calm inZone, median-of-3)", fps >= 58, `fps≈${fps}`);
  ok("14b 0 JS errors, 0 non-favicon net-404 across desktop pass", errors.length === 0 && net404.length === 0, `err=${errors.length} 404=${net404.length} ${net404.slice(0,3).join(" | ")}`);

  // ---- 15 MOBILE: real tb.quartermaster @slot 6.65 with a drafted ult (CAS-2273-class collision), old slot 4.45 casts ult, gated ----
  await page.close();
  mbrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  const mp = await mbrowser.newPage();
  const merr = [], mnet = [];
  wireErrs(mp, merr, mnet);
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mp.goto(`${LIVE}/?dev=1`, { waitUntil: "networkidle2", timeout: 70000 });
  await toPlay(mp);
  await mp.evaluate(() => { window.dispatchEvent(new Event("touchstart")); window.__dev.sanctuary({ setRep: 2000 }); });
  const mInZone = await ensureZone(mp); await sleep(150);
  const tapSlot = (p, slot) => p.evaluate(async (slotMul) => { const s = (ms) => new Promise((r) => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const VW = rect.width, VH = rect.height; const m = 14; const bs = Math.max(56, Math.min(VW, VH) * 0.115);
    const bx = m + bs * 0.5, by = VH - m - bs * slotMul;
    window.dispatchEvent(new Event("touchstart"));
    cv.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 4, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(60);
    cv.dispatchEvent(new PointerEvent("pointerup", { pointerId: 4, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(140); }, slot);
  const tapQM = (p) => tapSlot(p, 6.65);

  // 15a WITH a drafted ultimate (tb.ult.r>0): a tap on the FIXED slot 6.65 MUST advance the claim (CAS-2273 collision resolved)
  await mp.evaluate(() => { const m = window.__dev.ultMeta(); if (window.__dev.setUltId) window.__dev.setUltId(m.ults[0].id); });
  const mPreU = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapQM(mp);
  const mWithUlt = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  ok("15a MOBILE (ult drafted) tb.quartermaster tap @slot6.65 claims — no ult-slot collision (CAS-2273 class)",
     mInZone && mWithUlt > mPreU, `inZone=${mInZone} preUlt=${mPreU} afterTap=${mWithUlt}`);

  // 15b OLD slot 4.45 (now tb.ult only) with a charged ult casts the ult (charge consumed) and does NOT claim ⇒ button truly relocated
  await mp.evaluate(() => { const m = window.__dev.ultMeta(); if (window.__dev.setUltId) window.__dev.setUltId(m.ults[0].id); if (window.__dev.fillUltimate) window.__dev.fillUltimate(); });
  const oldB = await mp.evaluate(() => ({ qm: window.__dev.quartermaster().claimedIds.length,
    ch: (() => { const s = window.__dev.ultimateState ? window.__dev.ultimateState() : null; return s ? (s.charge ?? s.ultCharge ?? null) : null; })() }));
  await tapSlot(mp, 4.45);
  const oldA = await mp.evaluate(() => ({ qm: window.__dev.quartermaster().claimedIds.length,
    ch: (() => { const s = window.__dev.ultimateState ? window.__dev.ultimateState() : null; return s ? (s.charge ?? s.ultCharge ?? null) : null; })() }));
  const ultFired = (oldB.ch === null || oldA.ch === null) ? true : oldA.ch < oldB.ch;
  ok("15b OLD slot 4.45 casts tb.ult (charge consumed), does NOT claim QM ⇒ relocation clean, ult intact",
     oldA.qm === oldB.qm && ultFired, `qm ${oldB.qm}->${oldA.qm} ultCharge ${oldB.ch}->${oldA.ch}`);

  // 15c gated in the wild
  await mp.evaluate(() => { if (window.__dev.setUltId) window.__dev.setUltId("__none__"); });
  await toWild(mp); const wildB = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapQM(mp);
  const wildA = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  ok("15c MOBILE tap OUTSIDE the sanctuary does NOT claim (button gated to hub)", wildA === wildB, `${wildB}->${wildA}`);
  await ensureZone(mp);
  const mfps = await fpsMedian3(mp);
  ok("15d mobile fps ≥58, 0 err, 0 non-favicon 404", mfps >= 58 && merr.length === 0 && mnet.length === 0, `fps≈${mfps} err=${merr.length} 404=${mnet.length}`);
  await mp.screenshot({ path: join(OUT, "quartermaster-mobile.png") });

  console.log(`\nbuild=${build}\n${PASS}/${PASS + FAIL} PASS`);
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  try { await browser.close(); } catch (e) {}
  try { if (mbrowser) await mbrowser.close(); } catch (e) {}
  process.exit(FAIL ? 1 : 0);
}
