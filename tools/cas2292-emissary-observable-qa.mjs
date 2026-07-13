// CAS-2292 — QA OBSERVABLE pass for EMISARIO DEL SANTUARIO / SANCTUARY EMISSARY (DARK, SANCTUARY_EMISSARY.enabled:false).
// Independent verification of the GE DARK build (self-verify cas2292-emissary-selfverify.mjs 20/20, commit 6d666e5).
//
// QA DIFFERENTIATOR vs the GE self-verify render check (#18): that probe used a HUGE band (0.36W×0.42H) and reported
// signal=21950 / noise=22485 — the "signal" is NOT interpretable because it is drowned in whole-screen world animation
// (the exact footgun logged in CAS-2291: a changed-px badge probe run over an animated region measures world churn, not
// the badge). This pass instead LOCALIZES the badge: it builds a stable-background mask across multiple OFF frames, finds
// the BOUNDING BOX of the isolated signal, and asserts the badge is a COMPACT element in the right-hand badge column
// (not whole-screen churn) — plus a FAR control zone that must stay ~0, and STATE differentiation (hint vs accepted vs
// ready), which can only come from the badge. Then byte-id OFF re-verify, the REAL accept→hunt→deliver chokepoint loop,
// a mobile tb.emissary observable, and fps-in-calm-safezone.
//
// Render footgun handled (mirror CAS-2291/warhorn): tickEmissary rewrites G.emissary from the REAL Date.now every frame,
// so an injected nowMs is clobbered next frame; the sim uses performance.now for dt (index.html) ⇒ pinning Date.now PINS
// the rotation WITHOUT freezing the sim. We pin Date.now to a period bucket and pass nowMs in the SAME act() call.
//
// Checks:
//   1  boots to play, __dev.emissary + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF: enabled false + schedule null (G.emissary never created) + hasField false + save has NO 'emissary' key
//      + worldFingerprint byte-stable across enable toggle + act⇒'off'.
//   3  REAL chokepoint loop (pinned clock ⇒ wolfcull): accept('accepted') → derived progress → deliver('claimed',
//      goldΔ==def.gold, repΔ==def.rep) → one-per-period('done').
//   4  render LOCALIZE: with the feature ON+accepted, the badge signal (isolated on a stable-bg mask) forms a COMPACT
//      bounding box in the right badge column (not whole-screen). FAR control zone (left half) stays ~0.
//   5  render STATE differentiation: OFF (no badge) vs ON-hint (dim, in-zone, unaccepted) vs ON-accepted (blue+progress)
//      vs ON-ready (green+listo) all differ INSIDE the badge bbox — proof the element reflects live quest state.
//   6  mobile tb.emissary observable: in touch mode + in-zone, the emissary HUD button renders (localized signal in the
//      lower-left button column) and is ABSENT with the feature OFF (byte-id / contextual gating).
//   7  fps NO-regression in a CALM safezone: EMISSARY ON does not degrade the frame budget vs OFF.
//   0  no JS errors during the whole run.
// Run: node tools/cas2292-emissary-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2292-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// deterministic rotation (periodSec=1200, epochMs=0): periodMs=1200000. period=floor(now/periodMs), emissaries[period%5].
const PM = 1200000;
const NOW_P0 = PM * 10 + 5000;   // period 10 → 10%5=0 → wolfcull (wolf,8,90,60) — used by the check-3 deliver loop
const NOW_P0R = PM * 15 + 5000;  // period 15 → 15%5=0 → wolfcull, a FRESH UNCLAIMED period for the render probes
const NOW_HINT = PM * 16 + 5000; // period 16 → 16%5=1 → boneward, drives the dim "hint" state (active≠accepted period)

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  // Wait for the sim to be up; the scene may be 'menu' (fresh) or already 'play' (shared-origin autosave — CAS-2291).
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 20000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") { await sleep(300); return; }
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 20000 });
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
const toHub = async (page) => { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(150); };
const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

const server = await startServer();
const base = server.url;
const errors = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ---------- DESKTOP ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.emissary && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.daynight));
  ok("1 boots to play, __dev.emissary + arc hooks + daynight + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF (independent re-verify): enabled false + schedule null + hasField false + save clean + fp stable + act 'off'
  const off = await page.evaluate(() => {
    const d = window.__dev.emissary();
    const save = JSON.stringify(window.__dev.saveBlob());
    const fp0 = JSON.stringify(window.__dev.worldFingerprint(4242));
    window.__dev.emissary({ enabled: true }); const fp1 = JSON.stringify(window.__dev.worldFingerprint(4242));
    window.__dev.emissary({ enabled: false }); const r = window.__dev.emissary({ act: true });
    return { enabled: d.enabled, schedule: d.schedule, hasField: d.hasField, noKey: !/"emissary"/.test(save), fpStable: fp0 === fp1, act: r.result, actField: r.hasField };
  });
  ok("2 byte-id OFF: enabled false + schedule null + hasField false + save no 'emissary' + fp stable + act⇒'off'",
     off.enabled === false && off.schedule === null && off.hasField === false && off.noKey && off.fpStable && off.act === "off" && off.actField === false,
     `enabled=${off.enabled} sched=${JSON.stringify(off.schedule)} hasField=${off.hasField} noKey=${off.noKey} fpStable=${off.fpStable} act=${off.act}`);

  await toHub(page);
  // pin the shared clock ⇒ period 10 ⇒ wolfcull (wolf,8,90,60). Sim keeps running (dt=perf.now); only the rotation is pinned.
  await page.evaluate((F) => { if (!window.__ORIG_NOW) window.__ORIG_NOW = Date.now; Date.now = () => F; }, NOW_P0);

  // 3 REAL chokepoint loop
  const loop = await page.evaluate((F) => {
    window.__dev.emissary({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary({ setRep: 0 }); window.__dev.rested({ enabled: false });
    const acc = window.__dev.emissary({ nowMs: F, act: true });                 // ACCEPT
    const def = acc.active;
    window.__dev.emissary({ kill: { type: def.target, n: 3 } });
    const mid = window.__dev.emissary();                                        // derived progress 3/8
    window.__dev.emissary({ kill: { type: def.target, n: def.count } });        // complete
    const g0 = window.__dev.emissary().gold, r0 = window.__dev.emissary().rep, complete = window.__dev.emissary().complete;
    const del = window.__dev.emissary({ act: true });                           // DELIVER
    const goldD = del.gold - g0, repD = del.rep - r0;
    const again = window.__dev.emissary({ act: true });                         // one-per-period
    return { accResult: acc.result, id: def.id, target: def.target, count: def.count, gold: def.gold, rep: def.rep,
      midProg: mid.progress, complete, delResult: del.result, goldD, repD, againResult: again.result, goldD2: window.__dev.emissary().gold - del.gold };
  }, NOW_P0);
  ok("3 REAL loop (wolfcull): accept→progress 3/8→deliver 'claimed' goldΔ==90 repΔ==60→'done' 0 double-pay",
     loop.accResult === "accepted" && loop.id === "wolfcull" && loop.midProg === 3 && loop.complete === true &&
     loop.delResult === "claimed" && loop.goldD === loop.gold && loop.gold === 90 && loop.repD === loop.rep && loop.rep === 60 &&
     loop.againResult === "done" && loop.goldD2 === 0,
     `acc=${loop.accResult} prog=${loop.midProg} del=${loop.delResult} goldΔ=${loop.goldD} repΔ=${loop.repD} again=${loop.againResult}`);

  // LOCALIZE by INTERSECTION-OF-TOGGLES. Key insight: accept/deliver spawn a floater() (moving combat text near the hero)
  // — deterministic whole-screen motion that would survive the intersection. So accept the quest ONCE, let the floaters
  // fade, then toggle ONLY enabled on↔off: the badge is gated on SANCTUARY_EMISSARY.enabled while h.emissary persists, so
  // the toggle shows/hides the badge with NO new floater and NO sim mutation. A pixel counts as "badge" only if it flips
  // (|ON-OFF|>60) on EVERY toggle; the static badge lands in the same place each cycle, world-drift pixels differ per
  // cycle and get ANDed away. No hard-coded HUD math.
  const localizeProbe = await page.evaluate(async (F) => {
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const W = cv.width, H = cv.height, N = W * H * 4;
    const grab = () => g.getImageData(0, 0, W, H).data;
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    Date.now = () => F;                                                        // re-pin to the FRESH period (check-3 left P10 claimed)
    window.__dev.daynight(0.5);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    // accept ONCE at the fresh period (re-accepts because h.emissary.period != F's period ⇒ unclaimed "3/8"), then let the
    // accept floater fully fade before probing
    window.__dev.emissary({ enabled: true }); window.__dev.emissary({ nowMs: F, act: true }); window.__dev.emissary({ kill: { type: "wolf", n: 3 } });
    await sleep(1800);
    let acc = null;                                                             // running AND of per-toggle flip masks
    for (let t = 0; t < 5; t++) {
      window.__dev.emissary({ enabled: true }); window.__dev.emissary({ nowMs: F });   // re-pin the rotation so the badge stays accepted+active
      await raf(); const on = grab();
      window.__dev.emissary({ enabled: false });
      await raf(); const offf = grab();
      const mask = new Uint8Array(N / 4);
      for (let p = 0, i = 0; i < N; i += 4, p++) {
        const d = Math.abs(on[i] - offf[i]) + Math.abs(on[i + 1] - offf[i + 1]) + Math.abs(on[i + 2] - offf[i + 2]);
        mask[p] = d > 60 ? 1 : 0;
      }
      if (!acc) acc = mask; else for (let p = 0; p < acc.length; p++) acc[p] &= mask[p];
    }
    window.__dev.emissary({ enabled: true }); window.__dev.emissary({ nowMs: F });      // leave it ON+accepted for the state probe
    let count = 0, minX = W, minY = H, maxX = 0, maxY = 0, farLeft = 0;
    for (let p = 0; p < acc.length; p++) {
      if (!acc[p]) continue;
      const x = p % W, y = (p / W) | 0; count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (x < W * 0.4) farLeft++;
    }
    const bbox = count ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null;
    return { W, H, count, bbox, farLeft, cxFrac: bbox ? +((minX + maxX) / 2 / W).toFixed(3) : null, cyFrac: bbox ? +((minY + maxY) / 2 / H).toFixed(3) : null };
  }, NOW_P0R);
  // Badge is a compact element in the RIGHT badge column, upper-mid vertically. Whole-screen churn would blow the bbox up.
  const b = localizeProbe;
  ok("4 render LOCALIZE: badge signal forms a COMPACT bbox in the right badge column; FAR-left control ~0",
     b.count > 60 && b.bbox && b.bbox.w <= 320 && b.bbox.h <= 90 && b.cxFrac > 0.58 && b.cyFrac > 0.12 && b.cyFrac < 0.62 && b.farLeft <= 8,
     `count=${b.count} bbox=${JSON.stringify(b.bbox)} center=(${b.cxFrac},${b.cyFrac}) farLeft=${b.farLeft}`);

  // 5 STATE differentiation inside the badge bbox: OFF vs hint vs accepted vs ready must all differ. The hero already has
  // an accepted wolfcull quest (period 10). Transitions are FLOATER-FREE: setPeriod to a DIFFERENT period makes the
  // active quest mismatch → dim "hint"; kill to count flips in-progress→"listo". No act() ⇒ no floater ⇒ diffs stay
  // localized to the badge bbox. Frames grabbed back-to-back (single raf) to minimise world drift inside the small band.
  const states = await page.evaluate(async (bbox, F, FH) => {
    if (!bbox) return null;
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.max(0, bbox.x - 4), y0 = Math.max(0, bbox.y - 4), w = Math.min(cv.width - x0, bbox.w + 8), h = Math.min(cv.height - y0, bbox.h + 8);
    const grab = () => Array.from(g.getImageData(x0, y0, w, h).data);
    // settle: two rafs so the game re-renders under the current (clobbering) tick before we read
    const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const diff = (a, c) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]) > 45) n++; } return n; };
    window.__dev.daynight(0.5);
    // OFF
    window.__dev.emissary({ enabled: false }); await settle(); const sOff = grab();
    // ON hint: PIN the clock to a different period (FH) so tickEmissary keeps active period ≠ accepted period → dim "hint".
    // setPeriod alone gets clobbered by the every-frame tick reading Date.now, so we drive Date.now itself.
    window.__dev.emissary({ enabled: true }); Date.now = () => FH; await settle(); const sHint = grab();
    // ON accepted (blue + "3/8"): re-pin the clock to the accepted quest's period (F)
    Date.now = () => F; await settle(); const sAcc = grab();
    // ON ready (green + "listo"): complete the kill count (kill does NOT floater — floater only fires on deliver)
    window.__dev.emissary({ kill: { type: "wolf", n: 8 } }); await settle(); const sReady = grab();
    return { offVsHint: diff(sOff, sHint), hintVsAcc: diff(sHint, sAcc), accVsReady: diff(sAcc, sReady), offVsAcc: diff(sOff, sAcc) };
  }, b.bbox, NOW_P0R, NOW_HINT);
  ok("5 render STATE differentiation: OFF≠hint, hint≠accepted, accepted≠ready inside the badge bbox (reflects quest state)",
     states && states.offVsHint > 20 && states.hintVsAcc > 15 && states.accVsReady > 10 && states.offVsAcc > 30,
     states ? `offVsHint=${states.offVsHint} hintVsAcc=${states.hintVsAcc} accVsReady=${states.accVsReady} offVsAcc=${states.offVsAcc}` : "no bbox");

  // capture desktop evidence (accepted state, badge visible)
  await page.evaluate(async (F) => { window.__dev.daynight(0.5); const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.emissary({ enabled: true }); window.__dev.emissary({ nowMs: F, act: true }); window.__dev.emissary({ kill: { type: "wolf", n: 3 } }); }, NOW_P0);
  await raf2Page(page);
  await page.screenshot({ path: join(OUT, "desktop-accepted-badge.png") });
  // restore real clock + daynight
  await page.evaluate(() => { if (window.__ORIG_NOW) Date.now = window.__ORIG_NOW; window.__dev.daynight(null); });

  // 7 fps NO-regression in a CALM safezone
  const fps = await page.evaluate(async () => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); await new Promise(r => setTimeout(r, 200));
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 900) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    window.__dev.emissary({ enabled: false }); const off = await measure();
    window.__dev.emissary({ enabled: true }); const on = await measure();
    return { off, on };
  });
  ok("7 fps NO-regression in calm safezone: EMISSARY ON ≥ OFF*0.9 (headless variable ⇒ relative)",
     fps.on >= fps.off * 0.9, `on≈${Math.round(fps.on)} off≈${Math.round(fps.off)}`);
  await page.close();

  // ---------- MOBILE ----------
  const m = await browser.newPage();
  await m.emulate({ viewport: { width: 414, height: 896, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
  const merr = [];
  m.on("pageerror", (e) => merr.push(String(e)));
  m.on("console", (e) => { if (e.type() === "error") merr.push(e.text()); });
  // mobile SHARES the localStorage origin with the desktop page → the desktop autosave would boot mobile straight to
  // 'play' and toPlay would hang (CAS-2291). Clear all mithralda.* keys before every document load.
  await m.evaluateOnNewDocument(() => { try { Object.keys(localStorage).filter(k => k.startsWith("mithralda")).forEach(k => localStorage.removeItem(k)); } catch (e) {} });
  await m.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(m);
  // the game only enters TOUCH mode (renders the tb.* HUD buttons) after the first touchstart (input.js:904, {once}).
  // hasTouch alone doesn't trigger it, so dispatch a synthetic touchstart — the handler just sets isTouch=true.
  await m.evaluate(() => window.dispatchEvent(new Event("touchstart")));
  await sleep(200);
  await toHub(m);
  await page0Pin(m, NOW_P0);
  // 6 mobile tb.emissary: the contextual HUD button renders when SANCTUARY_EMISSARY.enabled && heroInSafeZone (input.js) —
  // NO accept needed, so toggling enabled shows/hides the button with no floater. Intersection-of-toggles localizes it to
  // a COMPACT box in the lower-left button column (tb.emissary @ y=VH-m-bs*7.75), proving the button draws + is absent OFF.
  const mob = await m.evaluate(async () => {
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    // tb.emissary rect is DETERMINISTIC (input.js:463,547): bs=max(56, min(VW,VH)*0.115), m=14, center=(m+bs*0.5, VH-m-bs*7.75),
    // r=bs*0.46. Probe that exact box (world churn in a ~64px box the disk fills is negligible) + a CONTROL box one column
    // to the RIGHT (same y, x+bs*1.9) where NO emissary button exists → proves the signal is the button, not world churn.
    const bs = Math.max(56, Math.min(W, H) * 0.115), mm = 14;
    const bxc = mm + bs * 0.5, byc = H - mm - bs * 7.75, r = bs * 0.46;
    const box = (cx) => { const x0 = Math.max(0, Math.round(cx - r - 3)), y0 = Math.max(0, Math.round(byc - r - 3)), w = Math.round(2 * r + 6), h = Math.round(2 * r + 6); return { x0, y0, w, h }; };
    const B = box(bxc), C = box(bxc + bs * 1.9);
    const grab = (b) => g.getImageData(b.x0, b.y0, b.w, b.h).data;
    const raf = () => new Promise(r => requestAnimationFrame(r));
    window.__dev.daynight(0.5);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    await new Promise(r => setTimeout(r, 300));
    const inZone = window.__dev.emissary().inZone;
    let accB = null, accC = null;
    for (let t = 0; t < 5; t++) {
      window.__dev.emissary({ enabled: true }); await raf(); const onB = grab(B), onC = grab(C);
      window.__dev.emissary({ enabled: false }); await raf(); const offB = grab(B), offC = grab(C);
      const mk = (on, off) => { const a = new Uint8Array(on.length / 4); for (let p = 0, i = 0; i < on.length; i += 4, p++) { const d = Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]); a[p] = d > 60 ? 1 : 0; } return a; };
      const mB = mk(onB, offB), mC = mk(onC, offC);
      if (!accB) { accB = mB; accC = mC; } else { for (let p = 0; p < accB.length; p++) { accB[p] &= mB[p]; accC[p] &= mC[p]; } }
    }
    const sum = (a) => a.reduce((s, v) => s + v, 0);
    window.__dev.emissary({ enabled: true });
    return { W, H, inZone, bs, buttonCenter: { x: Math.round(bxc), y: Math.round(byc), r: Math.round(r) }, buttonSignal: sum(accB), controlSignal: sum(accC) };
  });
  // the disk fills its exact rect on enable/disable while the adjacent control rect (no button) stays ~0:
  ok("6 mobile tb.emissary observable (touch mode): ON+in-zone the disk fills its exact button rect; control rect ~0",
     mob.inZone === true && mob.buttonSignal > 120 && mob.buttonSignal > mob.controlSignal * 4,
     `inZone=${mob.inZone} center=${JSON.stringify(mob.buttonCenter)} buttonSignal=${mob.buttonSignal} controlSignal=${mob.controlSignal}`);
  await m.evaluate(() => { if (window.__ORIG_NOW) Date.now = window.__ORIG_NOW; window.__dev.daynight(null); });
  await m.screenshot({ path: join(OUT, "mobile-emissary-button.png") });
  errors.push(...merr);
  await m.close();

  ok("0 no JS errors during the whole run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);

// helpers that need page scope
async function raf2Page(page) { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
async function page0Pin(page, F) { await page.evaluate((f) => { if (!window.__ORIG_NOW) window.__ORIG_NOW = Date.now; Date.now = () => f; }, F); }
