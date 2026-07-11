// ---------------------------------------------------------------------------
// CAS-2110 (QA OBSERVABLE DARK, umbrella / mec #34 CONTRAATAQUE DE ESQUIVA / Perfect Dodge Counter).
// Live build 37521ab19b4c (gh-pages), served sim/config.js md5 d133cd83 / sim/sim.js md5 2524c04f == HEAD.
//
// Drives the REAL browser loop against the LIVE gh-pages build. game.js imports "./sim/sim.js", so a
// dynamic import(BASE+"sim/sim.js") in-page resolves to the SAME cached ES-module singleton the game is
// running — G, dev.dodgeCounter*, DODGE_COUNTER all mutate the LIVE instance. Mirror of
// tools/cas2108-guard-counter-live-qa.mjs (OBSERVABLE DARK QA pattern). Complements the DOM-free node
// proof (tools/cas2110-dodge-counter.mjs, all AC vs HEAD bytes == served bytes).
//
// The feature ships DARK (DODGE_COUNTER.enabled:false live). render/render.js is UNCHANGED (837161ce —
// no art added) ⇒ there is NO render-observable AC (the VFX flash only spawns when dcOn, dead-code OFF).
// This harness proves the DARK invariants AND that the machine is genuinely OBSERVABLE when the Gate CEO
// flips it, by driving the REAL seams (damageHero→perfectDodge / applyHeroMelee / hitEnemy poise) on the
// LIVE served sim:
//
//   AC0  [BOOT]     boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1  [META]     served config knob DARK: {enabled:false, windowS:0.5, dmgMul:1.5, poiseMul:2.0, staminaCost:6, perfectWindowMs:160, requiresShield:false}.
//   AC2  [WINDOW]   a PERFECT dodge (roll i-frames deny a real hit, rollAge≤perfectWindowMs) ARMS the window;
//                   a STALE roll / MERCY i-frame (no rolling) do NOT arm; UNIVERSAL: arms on a ranged/no-shield class (mage).
//   AC3  [DMG+POISE] a LIGHT swing inside the window = counter: dmg ×dmgMul(1.5), poise ×poiseMul(2.0), consumes window, spends staminaCost(6).
//   AC4  [COMPOSE]  with GUARD_COUNTER: same event ⇒ only dodge arms (block never runs); same swing ⇒ only guard-mul (dc gated !gc).
//   AC5  [OFF]      enabled:false ⇒ dodge never arms + forcing dodgeCounterT>0 is INERT (dmg == HEAD ref).
//   AC6  [SAVE]     h.dodgeCounterT/_rollAge transient ⇒ save.v1 byte-id ON/OFF, no dodgeCounter*/rollAge* key.
//   AC7  [SRAND]    master-srand fingerprint byte-identical ON vs OFF (0 dodgeCounterRng), the ON probe non-vacuously fires; deterministic.
//   AC8  [60FPS]    ~60fps sustained while playing; mobile playable.
//
// Run: node tools/cas2110-dodge-counter-live-qa.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "37521ab19b4c";
const OUT = "shots/cas2110";
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "EVADE"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

// verify the live build id before driving (fail loud if stale CDN)
{
  const v = await (await fetch(`${BASE}version.json?cb=${Date.now()}`, { cache: "no-store" })).json();
  if (v.build === EXPECT_BUILD) P(`[live] version.json build == ${EXPECT_BUILD} (files=${v.files})`);
  else F(`[live] version.json build=${v.build} != expected ${EXPECT_BUILD}`);
}

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, http404 } = watch(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1"); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await toPlay(page);
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  // Bind the SERVED sim/config singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    window.__h = { sim, cfg };
  }, BASE);

  // ---- AC1 META: served config is DARK (enabled:false) with the exact knob values ----
  const meta = await page.evaluate(() => {
    const m = window.__h.sim.dev.dodgeCounterMeta();
    const G = window.__h.cfg.DODGE_COUNTER;
    return { m, cfgEnabled: G.enabled };
  });
  const m = meta.m;
  const valsOk = m.enabled === false && m.windowS === 0.5 && m.dmgMul === 1.5 && m.poiseMul === 2.0 && m.staminaCost === 6 && m.perfectWindowMs === 160 && m.requiresShield === false;
  if (valsOk && meta.cfgEnabled === false)
    P(`[${prof.name}] META: served DODGE_COUNTER DARK — enabled=false, windowS=${m.windowS}, dmgMul=${m.dmgMul}, poiseMul=${m.poiseMul}, staminaCost=${m.staminaCost}, perfectWindowMs=${m.perfectWindowMs}, requiresShield=${m.requiresShield} (exact ticket AC1)`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // ---- AC2 WINDOW: perfect dodge ARMS; stale roll / mercy i-frame do NOT; UNIVERSAL ranged arms ----
  const wp = await page.evaluate(() => window.__h.sim.dev.dodgeCounterWindowProbe());
  if (wp.ok && Math.abs(wp.openT - 0.5) < 1e-9 && wp.opened && wp.staleNoOpen && wp.mercyNoOpen && wp.rangedOpen)
    P(`[${prof.name}] WINDOW: PERFECT dodge ARMS dodgeCounterT=${wp.openT}(==windowS 0.5); STALE roll no-arm=${wp.staleNoOpen}; MERCY i-frame no-arm=${wp.mercyNoOpen}; UNIVERSAL ranged/mage ARMS=${wp.rangedOpen}`);
  else F(`[${prof.name}] WINDOW broken: ${JSON.stringify(wp)}`);

  // ---- AC3 DMG+POISE: LIGHT swing in window = ×dmgMul + consume + stamCost; poise ×poiseMul ----
  const dm = await page.evaluate(() => window.__h.sim.dev.dodgeCounterDmgProbe());
  if (dm.ok && Math.abs(dm.ratio - 1.5) < 1e-6 && dm.consumed && dm.stSpent === 6)
    P(`[${prof.name}] DMG: LIGHT swing no-window=${dm.dOff} vs in-window=${dm.dOn} ⇒ ratio=${dm.ratio}==dmgMul(1.5); consumes window=${dm.consumed}; spends stam=${dm.stSpent}==staminaCost(6)`);
  else F(`[${prof.name}] DMG broken: ${JSON.stringify(dm)}`);
  const pp = await page.evaluate(() => window.__h.sim.dev.dodgeCounterPoiseProbe());
  if (pp.ok && Math.abs(pp.pOn / pp.pOff - 2.0) < 1e-6)
    P(`[${prof.name}] POISE: counter poise ${pp.pOn}(=light ${pp.pOff}·poiseMul 2.0=${pp.expect}) ⇒ breaks stance faster (stagger axis)`);
  else F(`[${prof.name}] POISE broken: ${JSON.stringify(pp)}`);

  // ---- AC4 COMPOSE: dodge + guard never collide (same event / same swing) ----
  const cp = await page.evaluate(() => window.__h.sim.dev.dodgeCounterComposeProbe());
  if (cp.ok && cp.dodgeOpened && cp.guardStayedClosed && cp.onlyGuard && cp.dodgeNotConsumed && cp.guardConsumed)
    P(`[${prof.name}] COMPOSE: same-event only dodge arms (dodgeOpened=${cp.dodgeOpened}, guardStayedClosed=${cp.guardStayedClosed}); same-swing ratio=${cp.ratioBoth}==guardMul only (${cp.onlyGuard}), dodge NOT consumed=${cp.dodgeNotConsumed}`);
  else F(`[${prof.name}] COMPOSE broken: ${JSON.stringify(cp)}`);

  // ---- AC5 OFF: enabled=false ⇒ dodge never arms + forcing dodgeCounterT>0 is INERT (dmg == HEAD) ----
  const off = await page.evaluate(() => window.__h.sim.dev.dodgeCounterOffProbe());
  if (off.ok && off.noOpen && off.dForced === off.dRef)
    P(`[${prof.name}] OFF: enabled=false ⇒ dodge NO-arm(${off.noOpen}) + forcing dodgeCounterT>0 INERT — dmg identical (${off.dForced}==${off.dRef}) ⇒ attack branch byte-id to HEAD`);
  else F(`[${prof.name}] OFF not inert: ${JSON.stringify(off)}`);

  // ---- AC6 SAVE: transient window ⇒ save.v1 byte-id ON/OFF, no dodgeCounter*/rollAge* key ----
  const sb = await page.evaluate(() => window.__h.sim.dev.dodgeCounterSaveByteId());
  if (sb.ok && sb.byteId && !sb.hasKey)
    P(`[${prof.name}] SAVE: h.dodgeCounterT/_rollAge transient ⇒ serializeSave() BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), no dodgeCounter*/rollAge* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE byte-id broken: ${JSON.stringify({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---- AC7 SRAND: master-srand byte-id ON vs OFF (0 dodgeCounterRng), ON fires the counter, deterministic ----
  const srand = await page.evaluate(() => {
    const { dev } = window.__h.sim;
    const on = dev.dodgeCounterSrandProbe(true, 42, 48);
    const off = dev.dodgeCounterSrandProbe(false, 42, 48);
    const on2 = dev.dodgeCounterSrandProbe(true, 42, 48);
    return {
      same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint),
      determ: JSON.stringify(on.fingerprint) === JSON.stringify(on2.fingerprint),
      len: on.fingerprint.length, fired: on.counterFired,
    };
  });
  if (srand.same && srand.fired && srand.determ && srand.len === 96)
    P(`[${prof.name}] SRAND: master-srand fingerprint (${srand.len} draws=2×48) BYTE-IDENTICAL ON==OFF (0 dodgeCounterRng); ON non-vacuously fired the counter=${srand.fired}; deterministic across repeats`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(srand)}`);

  // ---- AC8 60FPS: measure fps over a ~2s play window ----
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
console.log(anyFail ? "\nFAIL — CAS-2110 dodge-counter LIVE QA" : "\nPASS — CAS-2110 dodge-counter LIVE QA (DARK observable, all AC, desktop+mobile)");
process.exit(anyFail ? 1 : 0);
