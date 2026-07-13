// CAS-2294 — QA POST-FLIP LIVE OBSERVABLE + full-stack regression for EMISARIO DEL SANTUARIO / SANCTUARY EMISSARY.
// Runs against the canonical LIVE gh-pages build (SANCTUARY_EMISSARY.enabled:true LIVE via CTO flip CAS-2293) — the real
// production URL players use (board directive CAS-412). NOT a local server, NOT the retired Higgsfield mirror.
//
// Differentiator vs the DARK observable (CAS-2292, 8/8 PASS build 6d666e5): the LIVE proof =
//   * served sim/config.js SANCTUARY_EMISSARY.enabled:true (the flip shipped) + build self-consistent vs version.json
//   * DEFAULT-ON — a FRESH boot with ZERO __dev flip has emissary().enabled===true AND a non-null real-clock schedule
//     (proof real players get a rotating world-quest, no injection).
//   * full-stack regression — the 8-flag Sanctuary arc stack (WORLD_EVENT / SANCTUARY_REWARDS / SANCTUARY_REP /
//     BOUNTY_BOARD / RECALL / SAFEZONE / TEMPLE_RESPAWN / RESTED_XP) all still enabled:true, 0 regression, fps stable.
// Then the same observable end-to-end evidence as DARK: REAL accept→progress→deliver 'claimed' (goldΔ/repΔ exact)→'done'
// (no double-pay); localized badge (compact bbox, right column); render STATE diff; mobile tb.emissary.
//
// Render footgun (mirror CAS-2291/2292): tickEmissary rewrites G.emissary from the REAL Date.now EVERY frame, so an
// injected nowMs is clobbered next frame; the sim uses performance.now for dt ⇒ pinning Date.now PINS the rotation
// WITHOUT freezing the sim. We pin Date.now to a period bucket and pass nowMs in the SAME synchronous act() call.
//
// Checks:
//   1  boot LIVE; build self-consistent vs version.json (NOT hardcoded — a later flip advances LIVE build, CAS-2271 lesson);
//      __dev.emissary + full arc hooks + daynight; 0 JS err; 0 non-favicon 404.
//   2  served sim/config.js: SANCTUARY_EMISSARY.enabled:true + 8-flag Sanctuary arc stack all enabled:true (regression).
//   3  DEFAULT-ON (the LIVE proof): fresh boot ⇒ emissary().enabled===true + real-clock schedule!==null, ZERO __dev flip.
//   4  REAL chokepoint loop (pinned clock ⇒ wolfcull): accept('accepted')→derived progress 3/8→deliver('claimed',
//      goldΔ==def.gold==90, repΔ==def.rep==60)→one-per-period('done'), 0 double-pay.
//   5  render LOCALIZE: ON+accepted ⇒ badge signal (isolated on a stable-bg mask) forms a COMPACT bbox in the right badge
//      column; FAR-left control zone ~0.
//   6  render STATE differentiation: OFF vs hint vs accepted vs ready all differ INSIDE the badge bbox.
//   7  fps NO-regression in a CALM safezone: EMISSARY ON does not degrade the frame budget vs a transient OFF.
//   8  mobile tb.emissary observable (touch mode + in-zone): the HUD button fills its exact rect, absent OFF.
//   0  no JS errors / no non-favicon 404 across the whole run.
// Run: node tools/cas2294-emissary-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2294-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// deterministic rotation (periodSec=1200, epochMs=0): periodMs=1200000. period=floor(now/periodMs), emissaries[period%5].
const PM = 1200000;
const NOW_P0 = PM * 10 + 5000;   // period 10 → 10%5=0 → wolfcull (wolf,8,90,60) — the deliver loop
const NOW_P0R = PM * 15 + 5000;  // period 15 → 15%5=0 → wolfcull, a FRESH UNCLAIMED period for the render probes
const NOW_HINT = PM * 16 + 5000; // period 16 → 16%5=1 → boneward, drives the dim "hint" state (active≠accepted period)

// LIVE console/net filters: gh-pages favicon 404 has no url + a generic "Failed to load resource" console line.
const isFaviconOnly = (u) => /favicon/i.test(u || "");

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") { await sleep(300); return; }
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 25000 });
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

const errors = [], net404 = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  // ---------- DESKTOP ----------
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  await page.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(page);

  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot clean + hooks + build self-consistent vs version.json (NOT hardcoded — a later flip advances LIVE build)
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.emissary && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.daynight));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.emissary + arc hooks + daynight; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: SANCTUARY_EMISSARY.enabled:true + 8-flag Sanctuary arc stack all enabled:true (regression)
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { EMISSARY: en("SANCTUARY_EMISSARY"), WORLD_EVENT: en("WORLD_EVENT"), REWARDS: en("SANCTUARY_REWARDS"),
      REP: en("SANCTUARY_REP"), BOUNTY: en("BOUNTY_BOARD"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"),
      TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP") };
  }, LIVE);
  const allArcTrue = cfg.WORLD_EVENT === "true" && cfg.REWARDS === "true" && cfg.REP === "true" && cfg.BOUNTY === "true" &&
    cfg.RECALL === "true" && cfg.SAFEZONE === "true" && cfg.TEMPLE === "true" && cfg.RESTED === "true";
  ok("2 served config: SANCTUARY_EMISSARY.enabled:true + 8-flag arc stack all enabled:true (0 regression)",
     cfg.EMISSARY === "true" && allArcTrue, JSON.stringify(cfg));

  // 3 DEFAULT-ON (the LIVE proof): fresh boot ⇒ emissary().enabled===true + real-clock schedule!==null, ZERO __dev flip
  const dOn = await page.evaluate(() => { const e = window.__dev.emissary(); return { enabled: e.enabled, schedule: e.schedule }; });
  ok("3 DEFAULT-ON from served config: emissary().enabled===true + real-clock schedule!==null, 0 __dev flip",
     dOn.enabled === true && dOn.schedule !== null && dOn.schedule !== undefined,
     `enabled=${dOn.enabled} schedule=${JSON.stringify(dOn.schedule)}`);

  await toHub(page);
  await page.evaluate((F) => { if (!window.__ORIG_NOW) window.__ORIG_NOW = Date.now; Date.now = () => F; }, NOW_P0);

  // 4 REAL chokepoint loop (rested OFF is a transient __dev flip to isolate the exact gold/rep delta)
  const loop = await page.evaluate((F) => {
    window.__dev.sanctuary({ setRep: 0 }); window.__dev.rested({ enabled: false });
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
      midProg: mid.progress, complete, delResult: del.result, goldD, repD, againResult: again.result,
      goldD2: window.__dev.emissary().gold - del.gold };
  }, NOW_P0);
  ok("4 REAL loop (wolfcull): accept→progress 3/8→deliver 'claimed' goldΔ==90 repΔ==60→'done' 0 double-pay",
     loop.accResult === "accepted" && loop.id === "wolfcull" && loop.midProg === 3 && loop.complete === true &&
     loop.delResult === "claimed" && loop.goldD === loop.gold && loop.gold === 90 && loop.repD === loop.rep && loop.rep === 60 &&
     loop.againResult === "done" && loop.goldD2 === 0,
     `acc=${loop.accResult} id=${loop.id} prog=${loop.midProg} del=${loop.delResult} goldΔ=${loop.goldD} repΔ=${loop.repD} again=${loop.againResult} dbl=${loop.goldD2}`);

  // 5 render LOCALIZE by INTERSECTION-OF-TOGGLES (accept once, let floaters fade, then toggle only enabled on↔off)
  const b = await page.evaluate(async (F) => {
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const W = cv.width, H = cv.height, N = W * H * 4;
    const grab = () => g.getImageData(0, 0, W, H).data;
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const slp = (ms) => new Promise(r => setTimeout(r, ms));
    Date.now = () => F;
    window.__dev.daynight(0.5);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.emissary({ enabled: true }); window.__dev.emissary({ nowMs: F, act: true }); window.__dev.emissary({ kill: { type: "wolf", n: 3 } });
    await slp(1800);
    let acc = null;
    for (let t = 0; t < 5; t++) {
      window.__dev.emissary({ enabled: true }); window.__dev.emissary({ nowMs: F });
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
    window.__dev.emissary({ enabled: true }); window.__dev.emissary({ nowMs: F });
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
  ok("5 render LOCALIZE: badge signal forms a COMPACT bbox in the right badge column; FAR-left control ~0",
     b.count > 60 && b.bbox && b.bbox.w <= 320 && b.bbox.h <= 90 && b.cxFrac > 0.58 && b.cyFrac > 0.12 && b.cyFrac < 0.62 && b.farLeft <= 8,
     `count=${b.count} bbox=${JSON.stringify(b.bbox)} center=(${b.cxFrac},${b.cyFrac}) farLeft=${b.farLeft}`);

  // 6 STATE differentiation inside the badge bbox: OFF vs hint vs accepted vs ready
  const states = await page.evaluate(async (bbox, F, FH) => {
    if (!bbox) return null;
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.max(0, bbox.x - 4), y0 = Math.max(0, bbox.y - 4), w = Math.min(cv.width - x0, bbox.w + 8), h = Math.min(cv.height - y0, bbox.h + 8);
    const grab = () => Array.from(g.getImageData(x0, y0, w, h).data);
    const settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const diff = (a, c) => { let n = 0; for (let i = 0; i < a.length; i += 4) { if (Math.abs(a[i] - c[i]) + Math.abs(a[i + 1] - c[i + 1]) + Math.abs(a[i + 2] - c[i + 2]) > 45) n++; } return n; };
    window.__dev.daynight(0.5);
    window.__dev.emissary({ enabled: false }); await settle(); const sOff = grab();
    window.__dev.emissary({ enabled: true }); Date.now = () => FH; await settle(); const sHint = grab();
    Date.now = () => F; await settle(); const sAcc = grab();
    window.__dev.emissary({ kill: { type: "wolf", n: 8 } }); await settle(); const sReady = grab();
    return { offVsHint: diff(sOff, sHint), hintVsAcc: diff(sHint, sAcc), accVsReady: diff(sAcc, sReady), offVsAcc: diff(sOff, sAcc) };
  }, b.bbox, NOW_P0R, NOW_HINT);
  ok("6 render STATE differentiation: OFF≠hint, hint≠accepted, accepted≠ready inside the badge bbox",
     states && states.offVsHint > 20 && states.hintVsAcc > 15 && states.accVsReady > 10 && states.offVsAcc > 30,
     states ? `offVsHint=${states.offVsHint} hintVsAcc=${states.hintVsAcc} accVsReady=${states.accVsReady} offVsAcc=${states.offVsAcc}` : "no bbox");

  // capture desktop evidence
  await page.evaluate(async (F) => { window.__dev.daynight(0.5); const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.emissary({ enabled: true }); window.__dev.emissary({ nowMs: F, act: true }); window.__dev.emissary({ kill: { type: "wolf", n: 3 } }); }, NOW_P0);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: join(OUT, "desktop-accepted-badge.png") });
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
  const merr = [], mnet404 = [];
  m.on("pageerror", (e) => merr.push(String(e)));
  m.on("console", (e) => { if (e.type() === "error" && !/Failed to load resource/i.test(e.text())) merr.push(e.text()); });
  m.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) mnet404.push(r.url()); });
  m.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) mnet404.push(r.url()); });
  // mobile SHARES the localStorage origin ⇒ desktop autosave would boot mobile past the menu (CAS-2291). Clear mithralda.* keys.
  await m.evaluateOnNewDocument(() => { try { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); } catch (e) {} });
  await m.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(m);
  await m.evaluate(() => window.dispatchEvent(new Event("touchstart")));   // input.js:904 {once} flips isTouch
  await sleep(200);
  await toHub(m);
  await m.evaluate((F) => { if (!window.__ORIG_NOW) window.__ORIG_NOW = Date.now; Date.now = () => F; }, NOW_P0);
  const mob = await m.evaluate(async () => {
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const bs = Math.max(56, Math.min(W, H) * 0.115), mm = 14;
    const bxc = mm + bs * 0.5, byc = H - mm - bs * 7.75, r = bs * 0.46;
    const box = (cx) => { const x0 = Math.max(0, Math.round(cx - r - 3)), y0 = Math.max(0, Math.round(byc - r - 3)), w = Math.round(2 * r + 6), h = Math.round(2 * r + 6); return { x0, y0, w, h }; };
    const B = box(bxc), C = box(bxc + bs * 1.9);
    const grab = (bb) => g.getImageData(bb.x0, bb.y0, bb.w, bb.h).data;
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
  ok("8 mobile tb.emissary observable (touch mode): ON+in-zone the disk fills its exact button rect; control rect ~0",
     mob.inZone === true && mob.buttonSignal > 120 && mob.buttonSignal > mob.controlSignal * 4,
     `inZone=${mob.inZone} center=${JSON.stringify(mob.buttonCenter)} buttonSignal=${mob.buttonSignal} controlSignal=${mob.controlSignal}`);
  await m.evaluate(() => { if (window.__ORIG_NOW) Date.now = window.__ORIG_NOW; window.__dev.daynight(null); });
  await m.screenshot({ path: join(OUT, "mobile-emissary-button.png") });
  errors.push(...merr); net404.push(...mnet404);
  await m.close();

  ok("0 no JS errors + no non-favicon 404 during the whole run", errors.length === 0 && net404.length === 0,
     `err=[${errors.slice(0, 3).join(" | ")}] 404=[${net404.slice(0, 3).join(" | ")}]`);

  console.log(`\nLIVE build tested: ${build} (version.json=${verBuild})`);
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
