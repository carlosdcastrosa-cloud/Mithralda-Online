// CAS-2299 — QA POST-FLIP LIVE OBSERVABLE + full-stack regression for JURAMENTO DEL SANTUARIO / SANCTUARY OATH.
// Runs against the canonical LIVE gh-pages build (SANCTUARY_OATH.enabled:true LIVE via CTO flip CAS-2298/CAS-2296) — the
// real production URL players use (board directive CAS-412). NOT a local server, NOT the retired Higgsfield mirror.
//
// Differentiator vs the DARK observable (CAS-2295, 13/13 PASS build c4a549ae2fa1): the LIVE proof =
//   * served sim/config.js SANCTUARY_OATH.enabled:true (the flip shipped) + build self-consistent vs version.json.
//   * DEFAULT-ON — a FRESH boot with ZERO __dev flip has oath().enabled===true (proof real players get the feature,
//     no injection). Per-hero order is null until the player pledges — that is the design.
//   * full-stack regression — the Sanctuary arc stack (SANCTUARY_EMISSARY / SANCTUARY_REWARDS / SANCTUARY_REP /
//     WORLD_EVENT / BOUNTY_BOARD / RECALL / SAFEZONE / TEMPLE_RESPAWN / RESTED_XP) all still enabled:true, and the 3
//     DARK flags (BOSS_RUSH / SEEDED_CHALLENGE / DOORS_INTERIORS) stay false. 0 regression, fps stable.
// Then the same observable end-to-end evidence as DARK, on 2+ clients (desktop click AND mobile tap):
//   REAL pledge via the EXISTING bountyTap chip (0 new hotkey / 0 new mobile slot, anti-CAS-2273/CAS-2220) exercising
//   ALL 3 Órdenes (Alba safeRegen+25% / Hierro restedCap+30% / Errante recallCd−15%), rank gate, order ⟦tag⟧ nameplate
//   render, passives at the Intendente chokepoints, persist, and the Tablón orders-row.
//
// Board open path (real): __dev.bountyTP() → KeyE (interact ⇒ NPC dialogue) → KeyE… (advanceDialogue ⇒ scene 'bounty').
// Chip coords computed from the exact renderOathRow geometry; VW/VH == window.innerWidth/Height (index.html), so CSS
// coords map 1:1 to onPointerDown's clientX-rect.left. A small ±grid tolerates sub-pixel drift.
//
// Checks:
//   1  boots LIVE; build self-consistent vs version.json (NOT hardcoded — a later flip advances the build); __dev.oath +
//      arc hooks + bountyTP; 0 JS err; 0 non-favicon 404.
//   2  served sim/config.js: SANCTUARY_OATH.enabled:true + Sanctuary arc stack all enabled:true + 3 DARK flags false.
//   3  DEFAULT-ON (the LIVE proof): fresh boot ⇒ oath().enabled===true, order null (no auto-pledge), ZERO __dev flip.
//   4  OFF knob byte-id (transient control): enabled:false ⇒ oathMul*==0 AND recallCdSec==480 AND restedCap==600 (base).
//   5  RANK GATE (REAL tap): neutral rep ⇒ real pointerdown on the dawn chip does NOT pledge (order null, rankOk false).
//   6  REAL DESKTOP PLEDGE Alba: recognized rep ⇒ real pointerdown on the dawn chip ⇒ order 'dawn', tag 'Alba',
//      safeRegen/0.25, oathMulSafeRegen==0.25.
//   7  SWITCH → Hierro (REAL): after 25 kills real tap on the iron chip ⇒ order 'iron', tag 'Hierro', restedCap +30%
//      (oathMulRestedCap==0.30, restedCap==780).
//   8  SWITCH → Errante (REAL): after 25 kills real tap on the wander chip ⇒ order 'wander', tag 'Errante', recallCd −15%
//      (oathMulRecallCd==0.15, recallCdSec==408).
//   9  persist: saveBlob has 'sanctuaryOath'==order + numeric 'sanctuaryOathAt' (affiliation survives reload).
//  10  render nameplate ⟦tag⟧ localized: sworn tag flips the hero band >> ON-held bob baseline; far corner untouched.
//  11  render Tablón orders-row: bounty panel changes (grows +76 + orders row) with ON vs OFF.
//  12  fps NO-regression in a calm safezone: ON ≥ OFF*0.9.
//  13  MOBILE (2nd client): touch mode + in-zone ⇒ real pointerdown on the dawn chip in the board pledges (0 HUD slot).
//   0  no JS errors / no non-favicon 404 across the whole run.
// Run: node tools/cas2299-oath-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2299-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const isFaviconOnly = (u) => /favicon/i.test(u || "");
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const key = (page, code) => page.evaluate((c) => window.dispatchEvent(new KeyboardEvent("keydown", { code: c, key: c, bubbles: true })), code);

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

// Open the Tablón (bounty) scene via the real NPC-interaction path.
async function openBoard(page) {
  await page.evaluate(() => window.__dev.bountyTP && window.__dev.bountyTP());
  await sleep(120);
  await key(page, "KeyE");
  await sleep(100);
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => window.__dev.scene()) === "bounty") break;
    await key(page, "KeyE");
    await sleep(90);
  }
  return await page.evaluate(() => window.__dev.scene());
}

// Dispatch a REAL pointerdown at the computed center of order-chip `idx` (0=dawn,1=iron,2=wander) with a small ±grid.
// Returns the order after the taps. (oath ON ⇒ board panel is +76 tall with the orders row.)
async function tapChip(page, idx) {
  return await page.evaluate(async (idx) => {
    const cv = document.querySelector("canvas"); const r = cv.getBoundingClientRect();
    const VW = window.innerWidth, VH = window.innerHeight;
    const bw = Math.min(VW * 0.9, 500), bh = Math.min(VH * 0.9, 470) + 76;
    const x = (VW - bw) / 2, y = (VH - bh) / 2;
    const oy = y + bh - 30 - 70, cyy = oy + 8, ch = 52;
    const gap = 8, n = 3, cw = (bw - 40 - gap * (n - 1)) / n;
    const cx = x + 20 + idx * (cw + gap) + cw / 2, cy = cyy + ch / 2;
    const raf = () => new Promise(res => requestAnimationFrame(res));
    for (const dx of [0, -18, 18]) for (const dy of [0, -10, 10]) {
      cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + cx + dx, clientY: r.top + cy + dy, pointerId: 1, bubbles: true, cancelable: true, pointerType: "mouse" }));
      cv.dispatchEvent(new PointerEvent("pointerup", { clientX: r.left + cx + dx, clientY: r.top + cy + dy, pointerId: 1, bubbles: true, cancelable: true, pointerType: "mouse" }));
      await raf();
    }
    return window.__dev.oath().order;
  }, idx);
}

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

  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.oath + arc hooks + bountyTP; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: SANCTUARY_OATH.enabled:true + arc stack all true + 3 DARK false
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"),
      REP: en("SANCTUARY_REP"), WORLD_EVENT: en("WORLD_EVENT"), BOUNTY: en("BOUNTY_BOARD"), RECALL: en("RECALL"),
      SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), SEEDED: en("SEEDED_CHALLENGE"), DOORS: en("DOORS_INTERIORS") };
  }, LIVE);
  const arcTrue = ["EMISSARY","REWARDS","REP","WORLD_EVENT","BOUNTY","RECALL","SAFEZONE","TEMPLE","RESTED"].every(k => cfg[k] === "true");
  const darkFalse = cfg.BOSS_RUSH === "false" && cfg.SEEDED === "false" && cfg.DOORS === "false";
  ok("2 served config: SANCTUARY_OATH.enabled:true + arc stack all true + 3 DARK (BOSS_RUSH/SEEDED/DOORS) false",
     cfg.OATH === "true" && arcTrue && darkFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (the LIVE proof): fresh boot ⇒ oath().enabled===true + order null, ZERO __dev flip
  const dOn = await page.evaluate(() => { const d = window.__dev.oath(); return { enabled: d.enabled, order: d.order, hasField: d.hasField }; });
  ok("3 DEFAULT-ON from served config: oath().enabled===true + order null (no auto-pledge), 0 __dev flip",
     dOn.enabled === true && dOn.order === null && dOn.hasField === false,
     `enabled=${dOn.enabled} order=${dOn.order} hasField=${dOn.hasField}`);

  // 4 OFF knob byte-id (transient control): enabled:false ⇒ oathMul*==0 + base knobs, then restore ON
  const offKnob = await page.evaluate(() => {
    window.__dev.oath({ enabled: false });
    const d = window.__dev.oath();
    const r = { r: d.oathMulRecallCd, c: d.oathMulRestedCap, s: d.oathMulSafeRegen, recallCdSec: d.recallCdSec, restedCap: d.restedCap };
    window.__dev.oath({ enabled: true });
    return r;
  });
  ok("4 OFF knob byte-id (transient control): oathMul*==0 AND recallCdSec==480 AND restedCap==600 (base)",
     offKnob.r === 0 && offKnob.c === 0 && offKnob.s === 0 && near(offKnob.recallCdSec, 480) && near(offKnob.restedCap, 600),
     `oathMul={r:${offKnob.r},c:${offKnob.c},s:${offKnob.s}} recallCdSec=${offKnob.recallCdSec} restedCap=${offKnob.restedCap}`);

  // start at NEUTRAL rep to test the gate through the real chip tap
  await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary && window.__dev.sanctuary({ enabled: true }); window.__dev.sanctuary && window.__dev.sanctuary({ setRep: 0 }); });
  const scene1 = await openBoard(page);

  // 5 RANK GATE via REAL tap
  const gateOrder = await tapChip(page, 0);
  const gateState = await page.evaluate(() => { const d = window.__dev.oath(); return { rankOk: d.rankOk, order: d.order, hasField: d.hasField }; });
  ok("5 RANK GATE (real input): neutral rep ⇒ rankOk false ⇒ real pointerdown on dawn chip does NOT pledge (order null)",
     scene1 === "bounty" && gateOrder === null && gateState.rankOk === false && gateState.hasField === false,
     `scene=${scene1} orderAfterTap=${gateOrder} rankOk=${gateState.rankOk} hasField=${gateState.hasField}`);

  // grant rep to open the gate (board stays open)
  await page.evaluate(() => { window.__dev.oath({ grantRep: 100000 }); });
  const rankOpen = await page.evaluate(() => window.__dev.oath().rankOk);

  // 6 REAL DESKTOP PLEDGE Alba (dawn = chip 0)
  const albaOrder = await tapChip(page, 0);
  const alba = await page.evaluate(() => { const d = window.__dev.oath(); return { order: d.order, tag: d.tag, effect: d.effect, hasField: d.hasField, mS: d.oathMulSafeRegen }; });
  ok("6 REAL DESKTOP PLEDGE Alba: recognized ⇒ real pointerdown on dawn chip ⇒ order 'dawn', tag 'Alba', safeRegen/0.25",
     rankOpen === true && albaOrder === "dawn" && alba.order === "dawn" && alba.tag === "Alba" && alba.effect && alba.effect.kind === "safeRegen" && near(alba.effect.value, 0.25) && near(alba.mS, 0.25) && alba.hasField === true,
     `rankOk=${rankOpen} order=${alba.order} tag=${alba.tag} effect=${JSON.stringify(alba.effect)} oathMulSafeRegen=${alba.mS}`);

  // 7 SWITCH → Hierro (iron = chip 1): needs >20 kills since the last pledge
  await page.evaluate(() => window.__dev.oath({ kill: { n: 25 } }));
  const ironOrder = await tapChip(page, 1);
  const iron = await page.evaluate(() => { const d = window.__dev.oath(); return { order: d.order, tag: d.tag, mC: d.oathMulRestedCap, restedCap: d.restedCap }; });
  ok("7 SWITCH → Hierro (real): after 25 kills real tap on iron chip ⇒ order 'iron', tag 'Hierro', restedCap +30% (mC==0.30, restedCap==780)",
     ironOrder === "iron" && iron.order === "iron" && iron.tag === "Hierro" && near(iron.mC, 0.30) && near(iron.restedCap, 780),
     `order=${iron.order} tag=${iron.tag} oathMulRestedCap=${iron.mC} restedCap=${iron.restedCap}`);

  // 8 SWITCH → Errante (wander = chip 2): needs another >20 kills
  await page.evaluate(() => window.__dev.oath({ kill: { n: 25 } }));
  const wanderOrder = await tapChip(page, 2);
  const wander = await page.evaluate(() => { const d = window.__dev.oath(); return { order: d.order, tag: d.tag, mR: d.oathMulRecallCd, recallCdSec: d.recallCdSec }; });
  ok("8 SWITCH → Errante (real): after 25 kills real tap on wander chip ⇒ order 'wander', tag 'Errante', recallCd −15% (mR==0.15, recallCdSec==408)",
     wanderOrder === "wander" && wander.order === "wander" && wander.tag === "Errante" && near(wander.mR, 0.15) && near(wander.recallCdSec, 408),
     `order=${wander.order} tag=${wander.tag} oathMulRecallCd=${wander.mR} recallCdSec=${wander.recallCdSec}`);

  const persist = await page.evaluate(() => { const s = window.__dev.saveBlob(); return { hasKey: "sanctuaryOath" in s, order: s.sanctuaryOath, atNum: typeof s.sanctuaryOathAt === "number" }; });
  ok("9 persist: saveBlob has 'sanctuaryOath'==wander + numeric 'sanctuaryOathAt' (affiliation survives reload)",
     persist.hasKey && persist.order === "wander" && persist.atNum, JSON.stringify(persist));

  // close board for render probes
  await key(page, "KeyE"); await sleep(120);

  // 10 nameplate ⟦tag⟧ localized (calm temple + pinned day/night)
  const tagProbe = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const hero = { x: Math.floor(cv.width * 0.30), y: Math.floor(cv.height * 0.18), w: Math.floor(cv.width * 0.40), h: Math.floor(cv.height * 0.42) };
    const far = { x: 2, y: 2, w: Math.floor(cv.width * 0.20), h: Math.floor(cv.height * 0.20) };
    const grab = (c) => g.getImageData(c.x, c.y, c.w, c.h).data;
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    const CYC = 7;
    const run = async (crop, toggle) => { const NP = crop.w * crop.h; const count = new Uint8Array(NP);
      for (let c = 0; c < CYC; c++) {
        window.__dev.oath({ enabled: toggle ? false : true }); await raf(); const A = grab(crop);
        window.__dev.oath({ enabled: true }); await raf(); const B = grab(crop);
        for (let p = 0; p < NP; p++) { const i = p * 4; if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 50) count[p]++; }
      } let n = 0; for (let p = 0; p < NP; p++) if (count[p] >= 5) n++; return n; };
    const heroTag = await run(hero, true);
    const heroBob = await run(hero, false);
    const farTag = await run(far, true);
    if (window.__dev.daynight) window.__dev.daynight(null);
    return { heroTag, heroBob, farTag };
  });
  ok("10 render nameplate ⟦tag⟧: sworn tag flips the hero band >>ON-held bob baseline + far corner untouched (localized)",
     tagProbe.heroTag >= tagProbe.heroBob * 2 && (tagProbe.heroTag - tagProbe.heroBob) >= 40 && tagProbe.farTag <= Math.max(20, tagProbe.heroTag * 0.15),
     `heroTag=${tagProbe.heroTag} heroBobBaseline=${tagProbe.heroBob} farCorner=${tagProbe.farTag}`);
  await page.screenshot({ path: join(OUT, "desktop-nameplate-tag.png") });

  // 11 Tablón orders-row panel diff
  await openBoard(page);
  const boardProbe = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const grab = () => g.getImageData(0, 0, W, H).data;
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const settle = async () => { for (let i = 0; i < 3; i++) await raf(); };
    window.__dev.oath({ enabled: false }); await settle(); const A = grab();
    window.__dev.oath({ enabled: true }); await settle(); const B = grab();
    let diff = 0; for (let i = 0; i < W * H; i++) { const j = i * 4; if (Math.abs(A[j] - B[j]) + Math.abs(A[j + 1] - B[j + 1]) + Math.abs(A[j + 2] - B[j + 2]) > 40) diff++; }
    return { diff };
  });
  ok("11 render Tablón orders-row: bounty panel changes (grows +76 + orders row) with ON vs OFF", boardProbe.diff > 400, `panelΔpx=${boardProbe.diff}`);
  await page.screenshot({ path: join(OUT, "desktop-orders-row.png") });
  await key(page, "KeyE"); await sleep(100);

  // 12 fps NO-regression in a calm safezone
  const fps = await page.evaluate(async () => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); await new Promise(r => setTimeout(r, 200));
    const meas = () => new Promise((res) => { let f = 0; const t0 = performance.now();
      const loop = () => { f++; if (performance.now() - t0 >= 900) res(f * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    window.__dev.oath({ enabled: false }); const off = await meas();
    window.__dev.oath({ enabled: true }); const on = await meas();
    return { off: Math.round(off), on: Math.round(on) };
  });
  ok("12 fps NO-regression in calm safezone: OATH ON ≥ OFF*0.9 (headless variable ⇒ relative)",
     fps.on >= fps.off * 0.9, `on≈${fps.on} off≈${fps.off}`);
  await page.close();

  // ---------- MOBILE (2nd client) ----------
  const m = await browser.newPage();
  await m.emulate({ viewport: { width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
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
  await m.evaluate(() => window.dispatchEvent(new Event("touchstart")));   // input.js {once} flips isTouch
  await sleep(200);
  await m.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary && window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 100000 }); });
  const mScene = await openBoard(m);
  const mOrder = await tapChip(m, 0);
  await m.screenshot({ path: join(OUT, "mobile-orders-row.png") });
  ok("13 MOBILE (2nd client): touch mode ⇒ real pointerdown on dawn chip in the board pledges (0 dedicated HUD slot)",
     mScene === "bounty" && mOrder === "dawn", `scene=${mScene} order=${mOrder}`);
  errors.push(...merr); net404.push(...mnet404);
  await m.close();

  ok("0 no JS errors + no non-favicon 404 during the whole run", errors.length === 0 && net404.length === 0,
     `err=[${errors.slice(0, 3).join(" | ")}] 404=[${net404.slice(0, 3).join(" | ")}]`);

  console.log(`\nLIVE build tested: ${build} (version.json=${verBuild})`);
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack || e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
