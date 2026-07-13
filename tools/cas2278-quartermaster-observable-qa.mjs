// CAS-2278 — QA OBSERVABLE for INTENDENTE DEL SANTUARIO / SANCTUARY QUARTERMASTER (DARK, SANCTUARY_REWARDS.enabled:false).
// Independent safety-net over the GE self-verify (17/17). Closes the FACTION loop opened by SANCTUARY_REP (LIVE): each rep rank
// (Reconocido→Honrado→Venerado→Exaltado) unlocks ONE claimable reward at the Quartermaster (inside the SAFEZONE), each reusing a
// live knob (recallCd/restedCap/safeRegen/restedMult) + a RENOWN TITLE over the hero nameplate. Deterministic, 0 RNG, 0 new
// currency/key/inventory, reversible in 1 line.
//
// QA differentiators over self-verify:
//   · byte-id OFF re-confirmed by MY OWN probe (hasField false + save blob clean + worldFingerprint stable across toggle + knobs base).
//   · rank-gated unlock proven at EVERY threshold via the real sanctuaryRep field.
//   · claim proven through the REAL dedicated key (Delete/Supr KeyboardEvent) — the CAS-2273 lesson (a dedicated key is NOT proven
//     until the real KeyboardEvent is dispatched; __dev claim bypasses the binding).
//   · RENDER-OBSERVABLE renown title/badge: the thin NON-PULSING «title» text ACTUALLY DRAWS — proven via thresholded changed-px
//     isolation (CAS-2266/2272/2277 footgun) comparing claimed vs unclaimed at CONSTANT rep, daynight frozen.
//   · full-stack arc regression with REWARDS ON (SANCTUARY_REP perk + BOUNTY + SAFEZONE + Rested + RECALL healthy), desk+mobile 60fps.
//
// Observed via __dev.quartermaster (flip SANCTUARY_REWARDS.enabled IN-MEMORY — disk stays false ⇒ byte-id) + __dev.sanctuary (rep) +
// the REAL claim chokepoint (Delete key + mobile tb.quartermaster) + __dev.recall/rested/safeZone/bounty/saveBlob/worldFingerprint/daynight.
//
// Run: node tools/cas2278-quartermaster-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2278-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 35000 });
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
const toZone = (page) => page.evaluate(() => { const sz = window.__dev.safeZone(); const t = sz.temple;
  window.__dev.tp(t.x / 32, t.y / 32); return window.__dev.safeZone().inZone; });
async function ensureZone(page) { for (let i = 0; i < 4; i++) { if (await toZone(page)) return true; await sleep(120); } return false; }
const toWild = (page) => page.evaluate(() => { window.__dev.tpZone && window.__dev.tpZone("forest");
  return window.__dev.safeZone().inZone; });

const fps1 = (page) => page.evaluate(() => new Promise(res => { let f = 0; const t0 = performance.now();
  const loop = () => { f++; if (performance.now() - t0 >= 1000) res(f); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); }));
async function fpsMedian3(page) { const a = []; for (let i = 0; i < 3; i++) a.push(await fps1(page)); a.sort((x, y) => x - y); return a[1]; }

// press the REAL dedicated key (Delete/Supr) — proves the binding, not just the __dev claim (CAS-2273 lesson).
const pressSupr = (page) => page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Delete", key: "Delete", bubbles: true })));

// RENDER-OBSERVABLE: the Intendente badge + «renown title» draw NON-PULSING in the top-right badge column (below the minimap),
// over a LIVE world (pulsing sibling badges + moving minimap blips). Clean isolation (CAS-2266/2272/2277): a pixel is a TRUE
// signal if it changed a lot between a base frame and the probe (|Δ|>40) BUT was STABLE between two base frames (|Δ|<=22). That
// cancels pulsing badges + blips. Freeze daynight + weather so the frozen bg keeps the control at ~0.
// Probe the HERO NAMEPLATE band: the «renown title» draws over the hero head (render.js:1079), camera-centred, NOT zone-gated
// (unlike the HUD Intendente badge which needs inCitySafe). Frozen daynight ⇒ the ground under the title is static; the hero
// idle bob (below the title, at the sprite) fails the base→ctrl stability filter and is excluded ⇒ only the title text survives.
async function snapBand(page, key) {
  await page.evaluate(() => { if (window.__dev.daynight) window.__dev.daynight({ enabled: true, phase: 0.30 });
    if (window.__dev.weather) { try { window.__dev.weather({ enabled: false }); } catch (e) {} } });
  await sleep(160);
  return page.evaluate((key) => {
    const cv = document.getElementById("c"); const c = cv.getContext("2d");
    const dpr = cv.width / (window.innerWidth || cv.width);
    const cx = cv.width / 2;                                 // camera centres on the hero ⇒ nameplate at screen centre-x
    const bw = Math.round(360 * dpr), x0 = Math.max(0, Math.round(cx - bw / 2));
    const y0 = Math.round(cv.height * 0.30), y1 = Math.round(cv.height * 0.52);  // just ABOVE the hero head (title band)
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

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
let mbrowser = null;
const errors = [], net404 = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => net404.push(r.url()));
  page.on("response", (r) => { if (r.status() === 404) net404.push(r.url()); });
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`${base}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await toPlay(page);
  const build = await page.evaluate(() => (window.__BUILD || (window.__dev && window.__dev.build && window.__dev.build()) || "")).catch(() => "");

  // 1 boot clean + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.quartermaster && window.__dev.sanctuary && window.__dev.bounty
    && window.__dev.safeZone && window.__dev.recall && window.__dev.rested && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.daynight));
  ok("1 boots to play; quartermaster + arc + daynight hooks present; 0 err", hooks && errors.length === 0, `build=${build} err=${errors.length}`);

  // 2 DARK default: enabled false AND hasField false (field never created) — byte-id anti-CAS-2220
  const q0 = await page.evaluate(() => window.__dev.quartermaster());
  ok("2 DARK default: SANCTUARY_REWARDS.enabled===false AND h.sanctuaryRewards never created (hasField false)",
     q0.enabled === false && q0.hasField === false && q0.claimedIds.length === 0, `enabled=${q0.enabled} hasField=${q0.hasField}`);

  // 3 byte-id save OFF: saveBlob() has NO sanctuaryRewards key
  const blobOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: saveBlob() omits sanctuaryRewards (allowlist clean)", !/sanctuaryRewards/.test(blobOff));

  // 4 worldFingerprint byte-stable across the enabled toggle (0 RNG drift) — flip on, no claims, flip off.
  //    worldFingerprint returns an OBJECT (30MB stringified footgun) ⇒ md5 it in-page, never print/compare raw.
  const fpHash = () => page.evaluate(() => { const s = JSON.stringify(window.__dev.worldFingerprint(1234));
    let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h + ":" + s.length; });
  const fpA = await fpHash();
  await page.evaluate(() => window.__dev.quartermaster({ enabled: true }));
  const fpOn = await fpHash();
  await page.evaluate(() => window.__dev.quartermaster({ enabled: false }));
  const fpB = await fpHash();
  ok("4 worldFingerprint byte-stable across enabled toggle (no claims)", fpA === fpOn && fpOn === fpB, `${fpA}==${fpB}`);

  // 5 effects OFF byte-id: enabled false ⇒ all effects 0 AND effective knobs == base
  const eff0 = await page.evaluate(() => { const q = window.__dev.quartermaster(); const rc = window.__dev.recall();
    return { q, recallBase: rc.cooldownSec }; });
  const q0e = eff0.q;
  ok("5 effects OFF byte-id: effects all 0, recallCdSec==base, restedCap==base",
     q0e.effects.recallCd === 0 && q0e.effects.restedCap === 0 && q0e.effects.safeRegen === 0 && q0e.effects.restedMult === 0
     && near(q0e.recallCdSec, eff0.recallBase, 0.001) && near(q0e.restedCap, 600, 0.01),
     `recallCdSec=${q0e.recallCdSec} base=${eff0.recallBase} restedCap=${q0e.restedCap}`);

  // ---- flip ON in-memory (disk stays false) + go to sanctuary for the interactive checks ----
  await page.evaluate(() => window.__dev.quartermaster({ enabled: true }));
  const inZone = await toZone(page);

  // 6 rank-gated unlock at EVERY threshold via the real sanctuaryRep field
  const gate = await page.evaluate(() => {
    const set = (n) => window.__dev.sanctuary({ setRep: n });
    const rows = [];
    for (const [rep, expect] of [[0, 0], [150, 1], [450, 2], [1000, 3], [2000, 4]]) {
      set(rep); const q = window.__dev.quartermaster();
      rows.push({ rep, unlocked: q.rewards.filter(r => r.unlocked).length, expect });
    }
    return rows;
  });
  ok("6 rank-gated unlock matches rep at every threshold (0/150/450/1000/2000 ⇒ 0/1/2/3/4 unlocked)",
     gate.every(r => r.unlocked === r.expect), gate.map(r => `${r.rep}:${r.unlocked}`).join(" "));

  // 7 claim via the REAL Delete/Supr key in zone ⇒ claims lowest-rank first, field created, claimedIds grows in order
  await page.evaluate(() => window.__dev.sanctuary({ setRep: 2000 }));            // Exaltado ⇒ all 4 unlocked
  const preClaim = await page.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await pressSupr(page); await sleep(60);
  const c1 = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  const hasFieldNow = await page.evaluate(() => window.__dev.quartermaster().hasField);
  ok("7 REAL Delete key in zone claims lowest-rank first (swift_return), field created",
     preClaim === 0 && c1.length === 1 && c1[0] === "swift_return" && hasFieldNow === true, `claimed=${JSON.stringify(c1)}`);

  // 8 claim the rest in order + idempotent: 3 more presses ⇒ all 4 canonical order; a 5th ⇒ "done", no dup
  await pressSupr(page); await pressSupr(page); await pressSupr(page); await sleep(60);
  const c4 = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  const doneRes = await page.evaluate(() => window.__dev.quartermaster({ claim: true }).result);
  const c4b = await page.evaluate(() => window.__dev.quartermaster().claimedIds);
  ok("8 claims in order, idempotent (all 4, 5th ⇒ 'done', no dup)",
     JSON.stringify(c4) === JSON.stringify(["swift_return", "deep_reserves", "temple_grace", "pilgrims_zeal"])
     && doneRes === "done" && c4b.length === 4, `res=${doneRes} ids=${c4.length}`);

  // 9 effects apply to the reused knobs (exact Σ): recallCd 0.20, restedCap 0.50, safeRegen 0.40, restedMult 0.15
  const eff = await page.evaluate(() => window.__dev.quartermaster());
  ok("9 effects apply exactly: recallCdSec ×0.8, restedCap ×1.5, effects Σ exact",
     eff.effects.recallCd === 0.20 && eff.effects.restedCap === 0.50 && eff.effects.safeRegen === 0.40 && eff.effects.restedMult === 0.15
     && near(eff.recallCdSec, 480 * 0.8, 0.01) && near(eff.restedCap, 600 * 1.5, 0.01),
     `recallCdSec=${eff.recallCdSec} restedCap=${eff.restedCap}`);

  // 10 REAL effect on the recall knob: with swift_return claimed, the recall hook's OWN effective cooldownSec == reduced (480×0.8),
  //    and a real cast sets h.recallCD to that reduced value (independent cross-check of the reward flowing into recallCooldownSec).
  const rec = await page.evaluate(() => { window.__dev.recall({ bind: true }); const r = window.__dev.recall({ cast: true });
    const snap = window.__dev.recall(); return { result: r.result, recallCD: snap.recallCD, cooldownSec: snap.cooldownSec }; });
  ok("10 recall knob carries the reward: recall().cooldownSec≈384 + cast sets recallCD reduced (not base 480)",
     near(rec.cooldownSec, 384, 0.5) && (rec.recallCD === 0 || (rec.recallCD > 300 && rec.recallCD <= 400)),
     `cooldownSec=${rec.cooldownSec} recallCD=${rec.recallCD} cast=${rec.result}`);

  // 11 renown title = highest claimed rank title (Exaltado)
  ok("11 renown title = highest claimed rank (Exaltado del Santuario)", eff.title === "Exaltado del Santuario", `title="${eff.title}"`);

  // 12 gating: rep-too-low in zone ⇒ "locked" (no rank reached, claims irrelevant); outside sanctuary ⇒ "away"
  const lockedRes = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 0 }); return window.__dev.quartermaster({ claim: true }).result; });
  const awayRes = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 }); window.__dev.tpZone && window.__dev.tpZone("forest");
    return window.__dev.quartermaster({ claim: true }).result; });
  await toZone(page);
  ok("12 gating: rep-too-low in zone ⇒ 'locked'; claim OUTSIDE the sanctuary ⇒ 'away'",
     lockedRes === "locked" && awayRes === "away", `locked=${lockedRes} away=${awayRes}`);

  // 13 persist SERIALIZATION: saveBlob ON (with claims) contains sanctuaryRewards ids in canonical config order
  //    (cross-reload rehydration is byte-id-gated on enabled ⇒ verified in the POST-FLIP LIVE re-verify, matching the arc pattern)
  const blobOn = await page.evaluate(() => { window.__dev.sanctuary({ setRep: 2000 });
    for (let i = 0; i < 4; i++) window.__dev.quartermaster({ claim: true }); return JSON.stringify(window.__dev.saveBlob()); });
  const serOk = /"sanctuaryRewards"\s*:\s*\[\s*"swift_return"\s*,\s*"deep_reserves"\s*,\s*"temple_grace"\s*,\s*"pilgrims_zeal"\s*\]/.test(blobOn);
  ok("13 persist serialization: saveBlob ON contains sanctuaryRewards ids in canonical order", serOk);

  // 14 RENDER-OBSERVABLE «renown title»: the social-layer deliverable — the title text ACTUALLY DRAWS over the hero nameplate.
  //    State: rep2000 + all 4 claimed (from check 13). PROBE = enabled ON ⇒ «Exaltado del Santuario» drawn above the hero head.
  //    BASE/CTRL = enabled:false ⇒ render gate (render.js:1079) skips the title ⇒ nothing above the head. Hero stands still in the
  //    sanctuary; frozen daynight keeps the ground static. Thresholded changed-px isolates the title from the hero idle bob.
  await page.evaluate(() => { window.__dev.quartermaster({ enabled: true }); window.__dev.sanctuary({ setRep: 2000 }); });
  await toZone(page); await sleep(200);
  await snapBand(page, "__probe");                              // ON, claimed ⇒ «Exaltado del Santuario» over the hero head
  await page.evaluate(() => window.__dev.quartermaster({ enabled: false }));   // OFF ⇒ title vanishes (gated render)
  await snapBand(page, "__base");
  await snapBand(page, "__ctrl");                              // second OFF frame ⇒ control (hero idle bob cancels via stability filter)
  const sig = await cleanSignal(page, "__base", "__ctrl", "__probe");
  const ctrlSig = await cleanSignal(page, "__base", "__ctrl", "__ctrl");        // OFF vs OFF ⇒ ~0
  await page.evaluate(() => window.__dev.quartermaster({ enabled: true }));    // restore ON for the screenshot + downstream checks
  await sleep(140);
  await page.screenshot({ path: join(OUT, "quartermaster-renown-title.png") });
  ok("14 RENDER-OBSERVABLE: «renown title» draws over the hero nameplate (changed-px signal >> control)",
     sig > 24 && sig > ctrlSig * 4 && ctrlSig < 12, `signal=${sig} control=${ctrlSig}`);

  // 15 reversible: enabled:false ⇒ effects 0, recallCdSec back to base, claim ⇒ "off"
  const rev = await page.evaluate(() => { window.__dev.quartermaster({ enabled: false });
    const q = window.__dev.quartermaster(); const cl = window.__dev.quartermaster({ claim: true }).result; return { q, cl }; });
  ok("15 reversible OFF: effects 0, recallCdSec==base 480, claim ⇒ 'off'",
     rev.q.effects.recallCd === 0 && near(rev.q.recallCdSec, 480, 0.01) && rev.cl === "off", `recallCdSec=${rev.q.recallCdSec} claim=${rev.cl}`);

  // 16 ARC REGRESSION with REWARDS ON: sanctuary rep perk + bounty claim + safezone regen + rested accrual + recall still healthy
  await page.evaluate(() => window.__dev.quartermaster({ enabled: true }));
  const arcInZone = await ensureZone(page);
  const arc = await page.evaluate(async () => {
    const s = (ms) => new Promise(r => setTimeout(r, ms));
    // bounty: clear then accept + complete + claim (real route) accrues rep
    window.__dev.bounty({ clear: true, setIdx: 1 });
    const b0 = window.__dev.bounty(); const repBefore = (window.__dev.sanctuary().rep) || 0;
    const acc = window.__dev.bounty({ act: true });
    let claimedBounty = null, repAfter = repBefore;
    if (acc.active) { window.__dev.bounty({ kill: { type: acc.active.target, n: (acc.active.count | 0) + 2 } });
      const cl = window.__dev.bounty({ act: true }); claimedBounty = cl.result; repAfter = (window.__dev.sanctuary().rep) || 0; }
    // safezone regen: set hp low + pause:0 (setHp alone doesn't clear _safeRegenPauseT ⇒ regen would stall — cas2269 footgun)
    window.__dev.safeZone({ setHp: 40, pause: 0 }); await s(500); const hp2 = window.__dev.safeZone().hp;
    // rested accrual: pool grows outside then spends
    const r0 = window.__dev.rested();
    // recall snapshot present
    const rc = window.__dev.recall();
    return { bountyEnabled: b0.enabled, claimedBounty, repBefore, repAfter, hpAfter: hp2, rested: !!r0, recall: !!rc };
  });
  ok("16 arc regression ON: bounty claim accrues rep, safezone regen, rested+recall snapshots healthy",
     arcInZone && arc.claimedBounty === "claimed" && arc.repAfter > arc.repBefore && arc.hpAfter > 40 && arc.rested && arc.recall,
     `inZone=${arcInZone} bounty=${arc.claimedBounty} rep ${arc.repBefore}->${arc.repAfter} hp=${arc.hpAfter}`);

  // 17 desktop fps ≥58 with feature ON (calm inZone, median-of-3)
  await toZone(page);
  const fps = await fpsMedian3(page);
  ok("17 desktop fps ≥58 with REWARDS ON (calm inZone, median-of-3)", fps >= 58, `fps≈${fps}`);
  ok("17b 0 JS errors, 0 net-404 across desktop pass", errors.length === 0 && net404.length === 0, `err=${errors.length} 404=${net404.length}`);

  // ---- 18 MOBILE: touch viewport boots, real tb.quartermaster tap claims in zone, gated in wild, fps ----
  // Fresh browser instance (not a newPage on the heavily-used desktop browser) ⇒ clean boot, matches the isolated smoke.
  await page.close();
  mbrowser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
  const mp = await mbrowser.newPage();
  const merr = [], mnet = [];
  mp.on("pageerror", (e) => merr.push(String(e)));
  mp.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) merr.push(m.text()); });
  mp.on("requestfailed", (r) => mnet.push(r.url()));
  mp.on("response", (r) => { if (r.status() === 404) mnet.push(r.url()); });
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mp.goto(`${base}/?dev=1`, { waitUntil: "networkidle2", timeout: 60000 });
  await toPlay(mp);
  await mp.evaluate(() => { window.dispatchEvent(new Event("touchstart")); window.__dev.quartermaster({ enabled: true }); window.__dev.sanctuary({ setRep: 2000 }); });
  const mInZone = await ensureZone(mp); await sleep(150);
  const tapQM = (p) => p.evaluate(async () => { const s = (ms) => new Promise(r => setTimeout(r, ms));
    const cv = document.getElementById("c"); const rect = cv.getBoundingClientRect();
    const VW = rect.width, VH = rect.height; const m = 14; const bs = Math.max(56, Math.min(VW, VH) * 0.115);
    const bx = m + bs * 0.5, by = VH - m - bs * 4.45;         // tb.quartermaster slot (input.js:529)
    window.dispatchEvent(new Event("touchstart"));
    cv.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 4, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(60);
    cv.dispatchEvent(new PointerEvent("pointerup", { pointerId: 4, pointerType: "touch", clientX: rect.left + bx, clientY: rect.top + by, bubbles: true })); await s(140); });

  // 18a POSITIVE CONTROL: with NO drafted ultimate, the tb.quartermaster tap DOES claim ⇒ coords + gating + sim path all correct.
  await mp.evaluate(() => { if (window.__dev.setUltId) window.__dev.setUltId("__none__"); });   // clear ult ⇒ tb.ult.r=0
  const mPre = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapQM(mp);
  const mNoUlt = await mp.evaluate(() => window.__dev.quartermaster().claimedIds);
  ok("18a MOBILE (no ultimate) tb.quartermaster tap claims via tryQuartermaster chokepoint",
     mInZone && mPre === 0 && mNoUlt.length === 1 && mNoUlt[0] === "swift_return", `inZone=${mInZone} pre=${mPre} claimed=${JSON.stringify(mNoUlt)}`);

  // 18b ⛔ DEFECT: with a drafted ULTIMATE, tb.ult sits at the SAME slot (x:m+bs*0.5, y:VH-m-bs*4.45) as tb.quartermaster and is
  //     iterated FIRST in handleUITap (input.js:667) ⇒ it CONSUMES the tap; the quartermaster is UNREACHABLE by touch. This is the
  //     CAS-2273-class collision (dedicated trigger shadowed), but for the TOUCH button — caught in QA BEFORE flip. Desktop (Delete) OK.
  await mp.evaluate(() => { const m = window.__dev.ultMeta(); if (window.__dev.setUltId) window.__dev.setUltId(m.ults[0].id); }); // draft an ult ⇒ tb.ult.r>0
  const mPreU = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapQM(mp);
  const mWithUlt = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  const shadowed = (mWithUlt === mPreU);                       // claim count did NOT advance ⇒ tap was swallowed by tb.ult
  ok("18b ⛔ DEFECT: with a drafted ultimate the quartermaster tap is SHADOWED by tb.ult (same slot) ⇒ unreachable by touch",
     shadowed === false, `preUlt=${mPreU} afterTap=${mWithUlt} shadowed=${shadowed} (FAIL = collision confirmed, hand to GE)`);

  // 18c gated in the wild: button absent ⇒ tap same spot does NOT claim more (clear ult first to isolate the zone gate)
  await mp.evaluate(() => { if (window.__dev.setUltId) window.__dev.setUltId("__none__"); });
  await toWild(mp); const mWildBefore = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  await tapQM(mp);
  const mWildAfter = await mp.evaluate(() => window.__dev.quartermaster().claimedIds.length);
  ok("18c MOBILE tap OUTSIDE the sanctuary does NOT claim (button gated to hub)", mWildAfter === mWildBefore, `${mWildBefore}->${mWildAfter}`);
  await toZone(mp);
  const mfps = await fpsMedian3(mp);
  ok("18d mobile fps ≥58, 0 err, 0 404", mfps >= 58 && merr.length === 0 && mnet.length === 0, `fps≈${mfps} err=${merr.length} 404=${mnet.length}`);
  await mp.screenshot({ path: join(OUT, "quartermaster-mobile.png") });

  console.log(`\nbuild=${build}\n${PASS}/${PASS + FAIL} PASS`);
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  try { await browser.close(); } catch (e) {}
  try { if (mbrowser) await mbrowser.close(); } catch (e) {}
  await server.close();
  process.exit(FAIL ? 1 : 0);
}
