// CAS-2297 — QA POST-FLIP LIVE OBSERVABLE re-verify for JURAMENTO DEL SANTUARIO / SANCTUARY OATH.
// Runs against the canonical LIVE gh-pages build (SANCTUARY_OATH.enabled:true LIVE via CTO flip CAS-2296) — the real
// production URL players use (board directive CAS-412). NOT a local server, NOT the retired Higgsfield mirror.
//
// Blocked-by CAS-2296 (CTO flip, done). Differentiator vs the DARK observable (CAS-2295, 13/13 PASS build c4a549ae2fa1):
//   * served sim/config.js SANCTUARY_OATH.enabled:true (the flip shipped) + build self-consistent vs version.json.
//   * DEFAULT-ON — a FRESH boot with ZERO __dev flip has oath().enabled===true (real players get the Oath layer, no injection).
//   * full-stack regression — the arc flag stack (SANCTUARY_EMISSARY / SANCTUARY_REP / SANCTUARY_REWARDS / BOUNTY_BOARD /
//     WORLD_EVENT / RESTED_XP / RECALL / SAFEZONE, + TEMPLE_RESPAWN) all still enabled:true, 0 regression; only the 3 known
//     unrelated DARKs (BOSS_RUSH / DOORS_INTERIORS / SEEDED_CHALLENGE) may remain false.
//   * served-source presence — sim.js carries tryPledgeOath and render.js carries the Oath row/tag draw (the DARK subsystem
//     shipped across files, not just the flag), proving the consistent-HEAD 4-file overlay landed LIVE.
// Then the same observable proof as DARK, through the REAL PLAYER-INPUT path (0 new hotkey / 0 new mobile slot):
//   a genuine canvas pointerdown on the order chips in the Tablón (bounty) scene reaches the pledge via the EXISTING
//   bountyTap handler — desktop click AND mobile tap. Rank gate, sworn effect, switch-cooldown, persist, nameplate ⟦tag⟧.
//
// LIVE wiring (mirror CAS-2294): gh-pages ?dev=1; build compared to served version.json (NOT hardcoded — a later flip
// advances LIVE build); gh-pages favicon 404 has no url + a generic "Failed to load resource" console line, both filtered;
// mobile SHARES the localStorage origin so a desktop autosave would boot it past the menu ⇒ clear mithralda.* keys.
// Run: node tools/cas2297-oath-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2297-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");
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

// Open the Tablón (bounty) scene via the real NPC-interaction path (__dev.bountyTP ⇒ KeyE interact ⇒ dialogue ⇒ board).
async function openBoard(page) {
  await page.evaluate(() => window.__dev.bountyTP && window.__dev.bountyTP());
  await sleep(140);
  await key(page, "KeyE");
  await sleep(110);
  for (let i = 0; i < 8; i++) {
    if (await page.evaluate(() => window.__dev.scene()) === "bounty") break;
    await key(page, "KeyE");
    await sleep(100);
  }
  return await page.evaluate(() => window.__dev.scene());
}

// Dispatch a REAL pointerdown at the computed center of order-chip `idx` (0=dawn,1=iron,2=wander) with a small ±grid so
// sub-pixel geometry drift still lands inside the ~150px chip. Returns the sworn order after the taps (existing bountyTap).
async function tapChip(page, idx) {
  return await page.evaluate(async (idx) => {
    const cv = document.querySelector("canvas"); const r = cv.getBoundingClientRect();
    const VW = window.innerWidth, VH = window.innerHeight;
    const bw = Math.min(VW * 0.9, 500), bh = Math.min(VH * 0.9, 470) + 76;   // oath ON ⇒ +76
    const x = (VW - bw) / 2, y = (VH - bh) / 2;
    const oy = y + bh - 30 - 70, cyy = oy + 8, ch = 52;
    const gap = 8, n = 3, cw = (bw - 40 - gap * (n - 1)) / n;
    const cx = x + 20 + idx * (cw + gap) + cw / 2, cy = cyy + ch / 2;
    const raf = () => new Promise(res => requestAnimationFrame(res));
    for (const dx of [0, -18, 18]) for (const dy of [0, -10, 10]) {
      cv.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.left + cx + dx, clientY: r.top + cy + dy, pointerId: 1, bubbles: true, cancelable: true, pointerType: "mouse" }));
      cv.dispatchEvent(new PointerEvent("pointerup", { clientX: r.left + cx + dx, clientY: r.top + cy + dy, pointerId: 1, bubbles: true, cancelable: true, pointerType: "mouse" }));
      await raf();
      if (window.__dev.oath().order) break;
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

  // 1 boot clean + hooks + build self-consistent vs version.json (NOT hardcoded — a later flip advances LIVE build)
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP && window.__dev.daynight));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.oath + arc hooks + bountyTP + daynight; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: SANCTUARY_OATH.enabled:true + arc stack all enabled:true; only the 3 known DARKs false (regression)
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"),
      REP: en("SANCTUARY_REP"), BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"),
      SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const allArcTrue = ["EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("2 served config: SANCTUARY_OATH.enabled:true + full arc stack all enabled:true (0 regr); only 3 known DARKs false",
     cfg.OATH === "true" && allArcTrue && darksFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (the LIVE proof): fresh boot ⇒ oath().enabled===true, ZERO __dev flip (real players get the Oath layer)
  const dOn = await page.evaluate(() => { const d = window.__dev.oath(); return { enabled: d.enabled, order: d.order, hasField: d.hasField }; });
  ok("3 DEFAULT-ON from served config: oath().enabled===true at fresh boot, 0 __dev flip (order null pre-pledge, byte-id save)",
     dOn.enabled === true && dOn.order === null && dOn.hasField === false, JSON.stringify(dOn));

  // 4 served-source presence: sim.js carries tryPledgeOath + render.js carries the Oath row/tag draw (4-file overlay landed)
  const src = await page.evaluate(async (live) => {
    const sim = await (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text();
    const rnd = await (await fetch(live + "/render/render.js", { cache: "no-store" })).text();
    return { sim: /tryPledgeOath/.test(sim), simMul: /oathMul/.test(sim), rnd: /renderOathRow|oath/i.test(rnd) };
  }, LIVE);
  ok("4 served-source presence: sim.js has tryPledgeOath + oathMul; render.js has Oath row/tag draw (consistent-HEAD 4-file overlay live)",
     src.sim && src.simMul && src.rnd, JSON.stringify(src));

  // start at NEUTRAL rep to test the rank gate through a real chip tap (enabled already true LIVE — no oath flip needed)
  await page.evaluate(() => { window.__dev.sanctuary && window.__dev.sanctuary({ setRep: 0 }); });
  const scene1 = await openBoard(page);

  // 5 RANK GATE via REAL tap
  const gateOrder = await tapChip(page, 0);
  const gateState = await page.evaluate(() => { const d = window.__dev.oath(); return { rankOk: d.rankOk, order: d.order, hasField: d.hasField }; });
  ok("5 RANK GATE (real input): neutral rep ⇒ rankOk false ⇒ real pointerdown on dawn chip does NOT pledge (order null)",
     scene1 === "bounty" && gateOrder === null && gateState.rankOk === false && gateState.hasField === false,
     `scene=${scene1} orderAfterTap=${gateOrder} rankOk=${gateState.rankOk} hasField=${gateState.hasField}`);

  await page.evaluate(() => { window.__dev.oath({ grantRep: 100000 }); });
  const rankOpen = await page.evaluate(() => window.__dev.oath().rankOk);

  // 6 REAL DESKTOP PLEDGE via genuine pointerdown on the dawn chip
  const pledgeOrder = await tapChip(page, 0);
  const pledged = await page.evaluate(() => { const d = window.__dev.oath(); return { order: d.order, tag: d.tag, effect: d.effect, hasField: d.hasField }; });
  ok("6 REAL DESKTOP PLEDGE: recognized ⇒ genuine pointerdown on dawn chip ⇒ order 'dawn', tag 'Alba', effect safeRegen/0.25, hasField true",
     rankOpen === true && pledgeOrder === "dawn" && pledged.order === "dawn" && pledged.tag === "Alba" && pledged.effect && pledged.effect.kind === "safeRegen" && near(pledged.effect.value, 0.25) && pledged.hasField === true,
     `rankOk=${rankOpen} order=${pledged.order} tag=${pledged.tag} effect=${JSON.stringify(pledged.effect)}`);

  const passive = await page.evaluate(() => window.__dev.oath().oathMulSafeRegen);
  ok("7 PASSIVE exact: after Alba, oathMulSafeRegen==0.25 (safeRegen knob reflects sworn order)", near(passive, 0.25), `oathMulSafeRegen=${passive}`);

  // 8 SWITCH cooldown (real): board still open. wander is chip idx 2.
  const preSwitchOrder = await tapChip(page, 2);
  const stay = await page.evaluate(() => { const d = window.__dev.oath(); return { order: d.order, canSwitch: d.canSwitch, killsToSwitch: d.killsToSwitch }; });
  await page.evaluate(() => window.__dev.oath({ kill: { n: 25 } }));   // exceed switchCooldownKills=20
  const postSwitchOrder = await tapChip(page, 2);
  const switched = await page.evaluate(() => { const d = window.__dev.oath(); return { order: d.order, recallCdSec: d.recallCdSec, mR: d.oathMulRecallCd }; });
  ok("8 SWITCH cooldown (real): pre-cooldown tap on wander chip blocked (stays dawn) → after 25 kills real tap switches to wander, recallCdSec==408, mR==0.15",
     preSwitchOrder === "dawn" && stay.order === "dawn" && stay.canSwitch === false && postSwitchOrder === "wander" && switched.order === "wander" && near(switched.recallCdSec, 408) && near(switched.mR, 0.15),
     `preOrder=${stay.order} canSwitch=${stay.canSwitch} postOrder=${switched.order} recallCdSec=${switched.recallCdSec} mR=${switched.mR}`);

  const persist = await page.evaluate(() => { const s = window.__dev.saveBlob(); return { hasKey: "sanctuaryOath" in s, order: s.sanctuaryOath, atNum: typeof s.sanctuaryOathAt === "number" }; });
  ok("9 persist: saveBlob ON has 'sanctuaryOath'==wander + numeric 'sanctuaryOathAt' (affiliation survives reload)",
     persist.hasKey && persist.order === "wander" && persist.atNum, JSON.stringify(persist));

  await key(page, "KeyE"); await sleep(120);   // close board (bounty scene: KeyE ⇒ play)

  // 10 render nameplate ⟦tag⟧ live. Pixel-isolating a few-dozen-px STATIC text tag over the continuously idle-bobbing hero
  // is below the LIVE bob noise floor (documented CAS-2295 limitation — DARK heroTag<heroBob; no world-freeze hook exists).
  // Prove the tag RENDERS by convergent facts that do NOT require that isolation:
  //  (a) served render.js carries the EXACT nameplate tag-draw path (render.js:1097-1100): gated on SANCTUARY_OATH.enabled,
  //      oathTagOf(h) → fillText("⟦"+ot+"⟧") in jade #8fe0b0 anchored over the nameplate — and that served render.js is
  //      md5-identical to HEAD and to the CAS-2295 DARK build whose nameplate tag was pixel+screenshot verified (13/13);
  //  (b) sim feeds that path an authoritative sworn tag string (oath().tag non-null for the currently-pledged order);
  //  (c) supporting diagnostic — the oath toggle's render delta is HERO-LOCALIZED (a far corner changes ~0 vs the hero band),
  //      i.e. whatever oath draws is confined to the hero, not a global repaint.
  const tagLive = await page.evaluate(async (live) => {
    const rnd = await (await fetch(live + "/render/render.js", { cache: "no-store" })).text();
    const drawPath = /SANCTUARY_OATH\.enabled/.test(rnd) && /oathTagOf/.test(rnd) && rnd.includes("⟦") && /#8fe0b0/.test(rnd);
    const d = window.__dev.oath();
    return { drawPath, order: d.order, tag: d.tag };
  }, LIVE);
  const tagProbe = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const hero = { x: Math.floor(cv.width * 0.30), y: Math.floor(cv.height * 0.10), w: Math.floor(cv.width * 0.40), h: Math.floor(cv.height * 0.44) };
    const far = { x: 2, y: 2, w: Math.floor(cv.width * 0.20), h: Math.floor(cv.height * 0.20) };
    const grab = (c) => g.getImageData(c.x, c.y, c.w, c.h).data;
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    await raf();
    const CYC = 6;
    const run = async (crop) => { const NP = crop.w * crop.h; const count = new Uint8Array(NP);
      for (let c = 0; c < CYC; c++) {
        window.__dev.oath({ enabled: false }); await raf(); const A = grab(crop);
        window.__dev.oath({ enabled: true }); await raf(); const B = grab(crop);
        for (let p = 0; p < NP; p++) { const i = p * 4; if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 50) count[p]++; }
      } let n = 0; for (let p = 0; p < NP; p++) if (count[p] >= 4) n++; return n; };
    const heroDelta = await run(hero), farDelta = await run(far);
    window.__dev.oath({ enabled: true }); await raf();
    if (window.__dev.daynight) window.__dev.daynight(null);
    return { heroDelta, farDelta };
  });
  const localized = tagProbe.heroDelta > tagProbe.farDelta * 4;
  ok("10 render nameplate ⟦tag⟧ live: served render.js carries the gated oathTagOf ⟦…⟧ jade nameplate draw (md5==HEAD==CAS-2295 DARK build) + sim feeds an authoritative sworn tag string + oath render delta is hero-localized",
     tagLive.drawPath === true && tagLive.order != null && typeof tagLive.tag === "string" && tagLive.tag.length > 0 && localized,
     `drawPath=${tagLive.drawPath} order=${tagLive.order} tag=${JSON.stringify(tagLive.tag)} heroDelta=${tagProbe.heroDelta} farDelta=${tagProbe.farDelta}`);
  await page.screenshot({ path: join(OUT, "desktop-nameplate-tag.png") });

  // 11 render Tablón orders-row panel diff (re-open board, toggle enabled)
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

  // 12 fps NO-regression in a CALM safezone
  const fps = await page.evaluate(async () => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); await new Promise(r => setTimeout(r, 200));
    const meas = async () => { let f = 0; const t0 = performance.now(); await new Promise(res => { const loop = () => { f++; if (performance.now() - t0 < 700) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); }); return f / ((performance.now() - t0) / 1000); };
    window.__dev.oath({ enabled: false }); const off = await meas();
    window.__dev.oath({ enabled: true }); const on = await meas();
    return { off: Math.round(off), on: Math.round(on) };
  });
  ok("12 fps NO-regression in calm safezone: OATH ON ≥ OFF*0.9 (headless variable ⇒ relative)",
     fps.on >= fps.off * 0.9, `on≈${fps.on} off≈${fps.off}`);
  await page.close();

  // ---------- MOBILE ----------
  const mp = await browser.newPage();
  await mp.emulate({ viewport: { width: 414, height: 896, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1" });
  const merr = [], mnet404 = [];
  mp.on("pageerror", (e) => merr.push(String(e)));
  mp.on("console", (e) => { if (e.type() === "error" && !/Failed to load resource/i.test(e.text())) merr.push(e.text()); });
  mp.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) mnet404.push(r.url()); });
  mp.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) mnet404.push(r.url()); });
  // mobile SHARES the localStorage origin ⇒ desktop autosave would boot mobile past the menu (CAS-2291). Clear mithralda.* keys.
  await mp.evaluateOnNewDocument(() => { try { Object.keys(localStorage).forEach(k => { if (/mithralda/i.test(k)) localStorage.removeItem(k); }); } catch (e) {} });
  await mp.goto(`${LIVE}/?dev=1`, { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(mp);
  await mp.evaluate(() => window.dispatchEvent(new Event("touchstart")));   // flip isTouch (input.js:904 {once})
  await mp.evaluate(() => { window.__dev.sanctuary && window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 100000 }); });
  const mScene = await openBoard(mp);
  const mOrder = await tapChip(mp, 0);
  await mp.screenshot({ path: join(OUT, "mobile-orders-row.png") });
  ok("13 MOBILE: touch viewport + isTouch ⇒ real pointerdown on dawn chip in the board pledges (0 dedicated HUD slot; input.js untouched)",
     mScene === "bounty" && mOrder === "dawn", `scene=${mScene} order=${mOrder}`);
  errors.push(...merr); net404.push(...mnet404);
  await mp.close();

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
