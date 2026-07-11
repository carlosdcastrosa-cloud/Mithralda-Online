// ---------------------------------------------------------------------------
// CAS-2118 (QA OBSERVABLE DARK, umbrella CAS-2114 / mec #35 RECUPERACIÓN / RALLY / REGAIN).
// Live build f2305f6b890d (gh-pages); served sim/config.js 39cffe4d / sim/sim.js 336ee228 /
// render/render.js ef21e533 == HEAD (all 3 behavior blobs).
//
// Drives the REAL browser loop against the LIVE gh-pages build. game.js imports "./sim/sim.js",
// so a dynamic import(BASE+"sim/sim.js") in-page resolves to the SAME cached ES-module singleton
// the game is running — G, dev.rally*, RALLY all mutate the LIVE instance. Mirror of
// tools/cas2110-dodge-counter-live-qa.mjs (OBSERVABLE DARK QA pattern). Complements the DOM-free
// node proof (tools/cas2114-rally-live-qa.mjs).
//
// Ships DARK (RALLY.enabled:false live). Unlike dodge-counter, RALLY DOES add a render seam:
// render/render.js renderVitalsShoulders draws a translucent GREEN ghost-HP segment (#8fff9a,
// alpha 0.5) over the HP bar when RALLY.enabled && rallyPool>0. It is dead-code OFF (byte-id to
// HEAD), so there is a genuine RENDER-observable AC proving the machine paints when the Gate flips.
//
//   AC0 [BOOT]     boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1 [META]     served config DARK: {enabled:false, recoverFrac:0.35, windowS:3.0, healPerHitFrac:0.5, decayPerSec:0.15, capFracMaxHp:0.4, requiresMelee:true}.
//   AC2 [ARM]      recibir daño REAL arma pool = real×recoverFrac (capeado) y rallyT=windowS.
//   AC3 [HEAL]     un swing melee que conecta cura pool×healPerHitFrac, lo resta del pool, AoE cura UNA vez.
//   AC4 [CAP]      un golpe enorme capea el pool a capFracMaxHp×HPmax (anti-abuse jefes).
//   AC5 [DECAY]    tickRally decae el pool decayPerSec×HPmax/s y lo fuerza a 0 al expirar la ventana.
//   AC6 [OFF]      enabled:false ⇒ recibir daño NO arma + forzar rallyPool>0 INERTE en el swing (hp == HEAD).
//   AC7 [SAVE]     h.rallyPool/h.rallyT transitorios ⇒ save.v1 byte-id ON/OFF, sin clave rally*.
//   AC8 [SRAND]    master-srand fingerprint byte-id ON vs OFF (0 rallyRng); ON no-vacuo; determinista.
//   AC9 [RENDER]   HEADLINE observable (desktop): arma el pool en el héroe VIVO ⇒ ghost-HP GREEN fillRect
//                  (#8fff9a) pinta sobre la barra HP; un swing que cura hace surgir el floater "¡RECUPERA!".
//                  Mobile: isTouch ⇒ el overlay NO dibuja (HUD táctil propio) — se verifica su ausencia.
//   AC10 [60FPS]   ~60fps sostenido jugando; mobile jugable.
//
// Run: node tools/cas2118-rally-live-observable.mjs   (PASS×2 = invocar dos veces; determinista)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
// FLIP-TOLERANT: mec #35 shipped DARK on f2305f6b890d, then Gate CEO CAS-2115 flipped RALLY.enabled
// false→true mid-QA (redeploy ebb3fb871cd1). This harness forces RALLY on for the probes, so it proves
// the machine on EITHER build. We report the live build + the served enabled flag rather than hard-pin.
const OUT = "shots/cas2118";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

let anyFail = false;
const P = (m) => console.log("✔ " + m);
const F = (m) => { anyFail = true; console.error("✖ " + m); };

function watch(page) {
  const errors = [], http404 = [];
  page.on("response", (r) => { if (r.status() === 404) http404.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error" && !/favicon\.ico/i.test(m.text()) && !/status of 404/i.test(m.text())) errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("requestfailed", (r) => { const u = r.url(); if (!/favicon\.ico/i.test(u)) errors.push("requestfailed: " + u); });
  return { errors, http404 };
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { document.getElementById("nameInput").value = "REGAIN"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  if (await page.evaluate(() => window.__dev.scene()) === "customize") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction("['abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  }
  if (await page.evaluate(() => window.__dev.scene()) === "abilitysel") {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

// Install canvas capture: record fillText strings AND green (#8fff9a) fillRect calls over a window.
async function installCap(page) {
  await page.evaluate(() => {
    if (window.__cap) return;
    window.__cap = { on: false, texts: [], greenRects: 0 };
    const proto = CanvasRenderingContext2D.prototype;
    const oT = proto.fillText;
    proto.fillText = function (t, ...a) { if (window.__cap.on && typeof t === "string") window.__cap.texts.push(t); return oT.call(this, t, ...a); };
    const oR = proto.fillRect;
    proto.fillRect = function (...a) {
      if (window.__cap.on) { const fs = ("" + this.fillStyle).toLowerCase(); if (fs === "#8fff9a") window.__cap.greenRects++; }
      return oR.apply(this, a);
    };
  });
}
async function sampleFrames(page, n = 10) {
  return await page.evaluate((n) => new Promise((res) => {
    window.__cap.texts = []; window.__cap.greenRects = 0; window.__cap.on = true; let i = 0;
    function tick() { i++; if (i >= n) { window.__cap.on = false; res({ texts: window.__cap.texts.slice(), green: window.__cap.greenRects }); } else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }), n);
}

// report the live build (flip-tolerant — pin is on served==HEAD byte-fidelity, verified separately)
let LIVE_BUILD = "?";
{
  const v = await (await fetch(`${BASE}version.json?cb=${Date.now()}`, { cache: "no-store" })).json();
  LIVE_BUILD = v.build;
  if (v.files === 799) P(`[live] version.json build=${v.build} files=${v.files} (DARK f2305f6b890d → post-flip CAS-2115 LIVE)`);
  else F(`[live] version.json files=${v.files} != 799`);
}

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, http404 } = watch(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1"); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await toPlay(page);
  await installCap(page); // after navigation — window/prototype are the live document's
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  // Bind the SERVED sim/config singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    window.__h = { sim, cfg };
  }, BASE);

  // ---- AC1 META: served config DARK (enabled:false) with exact knob values ----
  const meta = await page.evaluate(() => {
    const m = window.__h.sim.dev.rallyMeta();
    return { m, cfgEnabled: window.__h.cfg.RALLY.enabled };
  });
  const m = meta.m;
  // knob VALUES are the invariant (byte-fidelity); enabled flag reported (DARK false OR post-flip LIVE true).
  const valsOk = m.recoverFrac === 0.35 && m.windowS === 3.0 && m.healPerHitFrac === 0.5 && m.decayPerSec === 0.15 && m.capFracMaxHp === 0.4 && m.requiresMelee === true && m.enabled === meta.cfgEnabled;
  if (valsOk)
    P(`[${prof.name}] META: served RALLY knob — enabled=${m.enabled} (${m.enabled ? "post-flip LIVE CAS-2115" : "DARK"}), recoverFrac=${m.recoverFrac}, windowS=${m.windowS}, healPerHitFrac=${m.healPerHitFrac}, decayPerSec=${m.decayPerSec}, capFracMaxHp=${m.capFracMaxHp}, requiresMelee=${m.requiresMelee} (exact ticket AC1 values)`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // ---- AC2 ARM ----
  const ap = await page.evaluate(() => window.__h.sim.dev.rallyArmProbe());
  if (ap && ap.ok) P(`[${prof.name}] ARM: daño real=${ap.real} ⇒ pool=${ap.pool}(==real·recoverFrac ${ap.expectPool}, poolOk=${ap.poolOk}); rallyT=${ap.rallyT}(==windowS ${m.windowS}, windowOk=${ap.windowOk})`);
  else F(`[${prof.name}] ARM broke: ${JSON.stringify(ap)}`);

  // ---- AC3 HEAL ----
  const hp = await page.evaluate(() => window.__h.sim.dev.rallyHealProbe());
  if (hp && hp.ok) P(`[${prof.name}] HEAL: swing cura ${hp.healed}(==pool·healPerHitFrac ${hp.expectHeal}, healOk=${hp.healOk}); pool restante=${hp.poolAfter}(poolOk=${hp.poolOk}); AoE 2-mobs cura ${hp.healedAoE} UNA vez (onceOk=${hp.onceOk})`);
  else F(`[${prof.name}] HEAL broke: ${JSON.stringify(hp)}`);

  // ---- AC4 CAP ----
  const cp = await page.evaluate(() => window.__h.sim.dev.rallyCapProbe());
  if (cp && cp.ok) P(`[${prof.name}] CAP: golpe enorme ⇒ pool=${cp.pool} capeado a cap=${cp.cap}(==capFracMaxHp·HPmax) anti-abuse jefes (capOk=${cp.capOk})`);
  else F(`[${prof.name}] CAP broke: ${JSON.stringify(cp)}`);

  // ---- AC5 DECAY ----
  const dp = await page.evaluate(() => window.__h.sim.dev.rallyDecayProbe());
  if (dp && dp.ok) P(`[${prof.name}] DECAY: pool ${dp.p0}→${dp.p1} en 0.5s (drop=${dp.expectDrop}=decayPerSec·HPmax·dt, decayOk=${dp.decayOk}); ventana expira ⇒ pool forzado a 0 (expiredZero=${dp.expiredZero})`);
  else F(`[${prof.name}] DECAY broke: ${JSON.stringify(dp)}`);

  // ---- AC6 OFF (OFF==baseline byte-id) ----
  const off = await page.evaluate(() => window.__h.sim.dev.rallyOffProbe());
  if (off && off.ok) P(`[${prof.name}] OFF: enabled=false ⇒ recibir daño NO arma pool (noArm=${off.noArm}) + forzar rallyPool>0 INERTE — swing NO cura (healA=${off.healA}==healB=${off.healB}==0) ⇒ ruta melee byte-id a HEAD`);
  else F(`[${prof.name}] OFF not inert: ${JSON.stringify(off)}`);

  // ---- AC7 SAVE ----
  const sb = await page.evaluate(() => window.__h.sim.dev.rallySaveByteId());
  if (sb.ok && sb.byteId && !sb.hasKey) P(`[${prof.name}] SAVE: h.rallyPool/h.rallyT transitorios ⇒ serializeSave() BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), sin clave rally* (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE byte-id broke: ${JSON.stringify({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---- AC8 SRAND: master-srand byte-id ON==OFF (0 rallyRng), ON non-vacuous, deterministic ----
  const srand = await page.evaluate(() => {
    const { dev } = window.__h.sim;
    const on = dev.rallySrandProbe(true, 0x2114c0de, 24);
    const o = dev.rallySrandProbe(false, 0x2114c0de, 24);
    const on2 = dev.rallySrandProbe(true, 0x2114c0de, 24);
    return { same: JSON.stringify(on.fingerprint) === JSON.stringify(o.fingerprint), determ: JSON.stringify(on.fingerprint) === JSON.stringify(on2.fingerprint), len: on.fingerprint.length };
  });
  if (srand.same && srand.determ && srand.len === 48)
    P(`[${prof.name}] SRAND: master-srand fingerprint (${srand.len} draws=2×24) BYTE-IDENTICAL ON==OFF (0 rallyRng) aun con el ciclo rally disparando; determinista`);
  else F(`[${prof.name}] SRAND broke: ${JSON.stringify(srand)}`);

  // ---- AC9 RENDER (headline observable) ----
  if (prof.name === "desktop") {
    // Arm the LIVE play hero's pool and force RALLY on, then capture the GREEN ghost-HP fillRect.
    const armInfo = await page.evaluate(() => {
      const { dev } = window.__h.sim;
      dev.rallyEnable(true);
      const h = dev._dcArm("warrior"); if (!h) return null;
      const st = dev.rallyState();
      h.hp = st.hpMax * 0.5; h.rallyPool = st.hpMax * 0.35; h.rallyT = 10;
      return { hpMax: st.hpMax, pool: +h.rallyPool.toFixed(2) };
    });
    // hold hp BELOW max + pool up each frame so the ghost segment (poolFrac>hpFrac) has room to paint.
    // (dev._dcArm resets hp to full via _gcArm, so it must be re-set inside the sample loop.)
    const cap1 = await page.evaluate(() => new Promise((res) => {
      const { dev } = window.__h.sim; const h = dev._dcArm("warrior");
      window.__cap.texts = []; window.__cap.greenRects = 0; window.__cap.on = true; let i = 0;
      function tick() {
        const st = dev.rallyState(); h.hp = st.hpMax * 0.5; h.rallyPool = st.hpMax * 0.35; h.rallyT = 10; // hp<max ⇒ ghost segment has room
        i++; if (i >= 12) { window.__cap.on = false; res({ green: window.__cap.greenRects }); } else requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }));
    if (armInfo && cap1.green > 0) P(`[${prof.name}] RENDER: pool armado=${armInfo.pool} en el héroe VIVO ⇒ ghost-HP GREEN #8fff9a fillRect pintó ${cap1.green} veces sobre la barra HP (pool VISIBLE)`);
    else F(`[${prof.name}] RENDER ghost-HP not painted: ${JSON.stringify({ armInfo, cap1 })}`);
    await page.screenshot({ path: `${OUT}/${prof.name}-ghosthp.png` });

    // HEAL floater: drive real applyHeroMelee via rallyHealProbe → spawns "¡RECUPERA!" floater on live hero → render captures it.
    const capF = await page.evaluate(() => new Promise((res) => {
      const { dev } = window.__h.sim;
      dev.rallyEnable(true); dev.rallyHealProbe(); // spawns the RECUPERA floater into G.floaters on the live hero
      window.__cap.texts = []; window.__cap.on = true; let i = 0;
      function tick() { i++; if (i >= 14) { window.__cap.on = false; res({ texts: window.__cap.texts.slice() }); } else requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
    }));
    const gotFloater = capF.texts.some((t) => /RECUPERA/.test(t));
    if (gotFloater) P(`[${prof.name}] RENDER: swing melee CURA ⇒ floater "¡RECUPERA!" surge y se renderiza (fillText observado)`);
    else F(`[${prof.name}] RENDER floater "RECUPERA" not observed: sample=${JSON.stringify(capF.texts.slice(0, 8))}`);
    await page.evaluate(() => { window.__h.sim.dev.rallyEnable(false); const h = window.__h.sim.dev._dcArm("warrior"); if (h) { h.rallyPool = 0; h.rallyT = 0; } });
  } else {
    // Mobile: isTouch ⇒ renderVitalsShoulders returns early ⇒ overlay never draws (touch HUD owns vitals).
    const mob = await page.evaluate(() => new Promise((res) => {
      const { dev } = window.__h.sim; dev.rallyEnable(true); const h = dev._dcArm("warrior");
      window.__cap.greenRects = 0; window.__cap.on = true; let i = 0;
      function tick() { const st = dev.rallyState(); if (h) { h.rallyPool = st.hpMax * 0.35; h.rallyT = 10; } i++; if (i >= 12) { window.__cap.on = false; dev.rallyEnable(false); if (h) { h.rallyPool = 0; h.rallyT = 0; } res({ green: window.__cap.greenRects }); } else requestAnimationFrame(tick); }
      requestAnimationFrame(tick);
    }));
    if (mob.green === 0) P(`[${prof.name}] RENDER: isTouch ⇒ ghost-HP shoulder overlay NO dibuja (green fillRect=0) — el HUD táctil posee las vitals (comportamiento correcto)`);
    else F(`[${prof.name}] RENDER mobile drew shoulder overlay unexpectedly: green=${mob.green}`);
  }

  // ---- AC10 60FPS ----
  const fps = await page.evaluate(async () => {
    let frames = 0; const t0 = performance.now(); const dur = 2000;
    while (performance.now() - t0 < dur) { await new Promise((rr) => requestAnimationFrame(rr)); frames++; }
    return { fps: +(frames / ((performance.now() - t0) / 1000)).toFixed(1) };
  });
  if (fps.fps >= 55) P(`[${prof.name}] 60FPS: ${fps.fps} fps sustained during play`);
  else F(`[${prof.name}] 60FPS low: ${fps.fps} fps`);

  await page.screenshot({ path: `${OUT}/${prof.name}-final.png` });

  // ---- AC0 BOOT: no game-JS errors / non-cosmetic 404s over the whole session ----
  const bad404 = http404.filter((u) => !/favicon\.ico/i.test(u));
  if (errors.length === 0 && bad404.length === 0) P(`[${prof.name}] BOOT: 0 game-JS errors, 0 non-cosmetic 404s`);
  else F(`[${prof.name}] BOOT errors=${JSON.stringify(errors.slice(0, 4))} 404s=${JSON.stringify(bad404.slice(0, 4))}`);

  await page.close();
}

await browser.close();
console.log(anyFail ? "\nFAIL — CAS-2118 rally/regain LIVE OBSERVABLE" : "\nPASS — CAS-2118 rally/regain LIVE OBSERVABLE (DARK, all AC, desktop+mobile)");
process.exit(anyFail ? 1 : 0);
