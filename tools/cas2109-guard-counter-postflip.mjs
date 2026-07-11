// ---------------------------------------------------------------------------
// CAS-2109 (QA POST-FLIP for CAS-2105 / mec #33 Guard Counter) — verifies the LIVE ENABLED build after the
// CEO Gate flip GUARD_COUNTER.enabled false→true (build f38c34bb1655). Config-only 1-line flip: sim/sim.js
// (bbae04a2a8fe1b895f006c612b60ee62) + render/render.js (837161ce9280533ed88a51ac11fee30b) are BYTE-IDENTICAL
// to the DARK build 868a3cb231ac QA'd in CAS-2108; only sim/config.js changed (md5 fbc94a734cf4d7378eea7e95d774ee7a,
// enabled:true). This asserts served enabled=TRUE + all guard-counter seams observable live + boot clean + 60fps.
// (Below banner kept from the CAS-2108 DARK harness this is derived from.)
//
// CAS-2108 (QA OBSERVABLE DARK for CAS-2105 / mec #33 CONTRAGOLPE DE GUARDIA / Guard Counter)
// Build CAS-2106, umbrella CAS-27. Live build 868a3cb231ac.
//
// Drives the REAL browser loop against the LIVE gh-pages build. game.js imports "./sim/sim.js", so a
// dynamic import(BASE+"sim/sim.js") in-page resolves to the SAME cached ES-module singleton the game is
// running — G, dev.guardCounter*, GUARD_COUNTER all mutate the LIVE instance. Mirror of
// tools/cas2094-arena-hazards-live-qa.mjs (OBSERVABLE DARK QA pattern). Complements the DOM-free node
// proof (tools/cas2107-guard-counter.mjs, all AC vs HEAD bytes == served bytes).
//
// The feature ships DARK (GUARD_COUNTER.enabled:false live). render/render.js is UNCHANGED (837161ce —
// no art added) ⇒ there is NO render-observable AC (the VFX flash only spawns when gcOn, dead-code OFF).
// This harness proves the DARK invariants AND that the machine is genuinely OBSERVABLE when the Gate CEO
// flips it, by driving the REAL seams (damageHero BLOQUEO-OK / applyHeroMelee / hitEnemy poise) on the
// LIVE served sim:
//
//   AC0  [BOOT]     boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1  [META]     served config knob: {enabled:false, windowS:0.6, dmgMul:1.8, poiseMul:2.5, staminaCost:10}.
//   AC2  [WINDOW]   a non-break block ARMS the window (guardCounterT==windowS); guard-break / ranged (src=null)
//                   / two-hand (shield sheathed) do NOT arm — no reward without a clean shield block.
//   AC3  [DMG+POISE] a LIGHT swing inside the window = counter: dmg ×dmgMul(1.8), poise ×poiseMul(2.5),
//                   consumes the window, spends staminaCost(10).
//   AC4  [OFF]      enabled:false ⇒ block never arms + forcing guardCounterT>0 is INERT (dmg == HEAD ref).
//   AC5  [SAVE]     h.guardCounterT transient (outside serializeSave allowlist) ⇒ save.v1 byte-id ON/OFF, no key.
//   AC6  [SRAND]    master-srand fingerprint byte-identical ON vs OFF (0 guardCounterRng), the ON probe
//                   NON-vacuously fires the counter; deterministic across repeats.
//   AC7  [60FPS]    ~60fps sustained while playing; mobile playable.
//
// Run: node tools/cas2108-guard-counter-live-qa.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2109";
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "BRACE"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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
    const m = window.__h.sim.dev.guardCounterMeta();
    const G = window.__h.cfg.GUARD_COUNTER;
    return { m, cfgEnabled: G.enabled };
  });
  const m = meta.m;
  const valsOk = m.enabled === true && m.windowS === 0.6 && m.dmgMul === 1.8 && m.poiseMul === 2.5 && m.staminaCost === 10;
  if (valsOk && meta.cfgEnabled === true)
    P(`[${prof.name}] META: served GUARD_COUNTER LIVE (post-flip) — enabled=TRUE, windowS=${m.windowS}, dmgMul=${m.dmgMul}, poiseMul=${m.poiseMul}, staminaCost=${m.staminaCost}`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // ---- AC2 WINDOW: non-break block ARMS; break / ranged / two-hand do NOT arm ----
  const wp = await page.evaluate(() => window.__h.sim.dev.guardCounterWindowProbe());
  if (wp.ok && Math.abs(wp.openT - 0.6) < 1e-9 && wp.opened && wp.noBreak && wp.brokeNoOpen && wp.rangedNoOpen && wp.twoHandNoOpen)
    P(`[${prof.name}] WINDOW: clean block ARMS guardCounterT=${wp.openT}(==windowS 0.6, noBreak=${wp.noBreak}); guard-BREAK no-arm=${wp.brokeNoOpen}; RANGED(src=null) no-arm=${wp.rangedNoOpen}; TWO-HAND(shield sheathed) no-arm=${wp.twoHandNoOpen}`);
  else F(`[${prof.name}] WINDOW broken: ${JSON.stringify(wp)}`);

  // ---- AC3 DMG+POISE: LIGHT swing in window = ×dmgMul + consume + stamCost; poise ×poiseMul ----
  const dm = await page.evaluate(() => window.__h.sim.dev.guardCounterDmgProbe());
  if (dm.ok && Math.abs(dm.ratio - 1.8) < 1e-6 && dm.consumed && dm.stSpent === 10)
    P(`[${prof.name}] DMG: LIGHT swing sin-ventana=${dm.dOff} vs en-ventana=${dm.dOn} ⇒ ratio=${dm.ratio}==dmgMul(1.8); consumes window=${dm.consumed}; spends stam=${dm.stSpent}==staminaCost(10)`);
  else F(`[${prof.name}] DMG broken: ${JSON.stringify(dm)}`);
  const pp = await page.evaluate(() => window.__h.sim.dev.guardCounterPoiseProbe());
  if (pp.ok && Math.abs(pp.pOn / pp.pOff - 2.5) < 1e-6)
    P(`[${prof.name}] POISE: counter poise ${pp.pOn}(=light ${pp.pOff}·poiseMul 2.5=${pp.expect}) ⇒ breaks stance faster (stagger axis)`);
  else F(`[${prof.name}] POISE broken: ${JSON.stringify(pp)}`);

  // ---- AC4 OFF: enabled=false ⇒ block never arms + forcing guardCounterT>0 is INERT (dmg == HEAD) ----
  const off = await page.evaluate(() => window.__h.sim.dev.guardCounterOffProbe());
  if (off.ok && off.noOpen && off.dForced === off.dRef)
    P(`[${prof.name}] REVERSIBLE: forcing enabled=false ⇒ block NO-arm(${off.noOpen}) + guardCounterT>0 INERT — dmg identical (${off.dForced}==${off.dRef}) ⇒ flip-back-to-false is byte-id to baseline (reversible)`);
  else F(`[${prof.name}] REVERSIBLE not inert: ${JSON.stringify(off)}`);

  // ---- AC5 SAVE: transient window ⇒ save.v1 byte-id ON/OFF, no guardCounter* key ----
  const sb = await page.evaluate(() => window.__h.sim.dev.guardCounterSaveByteId());
  if (sb.ok && sb.byteId && !sb.hasKey)
    P(`[${prof.name}] SAVE: h.guardCounterT transient ⇒ serializeSave() BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), no guardCounter* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE byte-id broken: ${JSON.stringify({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---- AC6 SRAND: master-srand byte-id ON vs OFF (0 guardCounterRng), ON fires the counter, deterministic ----
  const srand = await page.evaluate(() => {
    const { dev } = window.__h.sim;
    const on = dev.guardCounterSrandProbe(true, 42, 48);
    const off = dev.guardCounterSrandProbe(false, 42, 48);
    const on2 = dev.guardCounterSrandProbe(true, 42, 48);
    return {
      same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint),
      determ: JSON.stringify(on.fingerprint) === JSON.stringify(on2.fingerprint),
      len: on.fingerprint.length, fired: on.counterFired,
    };
  });
  if (srand.same && srand.fired && srand.determ && srand.len === 96)
    P(`[${prof.name}] SRAND: master-srand fingerprint (${srand.len} draws=2×48) BYTE-IDENTICAL ON==OFF (0 guardCounterRng); ON non-vacuously fired the counter=${srand.fired}; deterministic across repeats`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(srand)}`);

  // ---- AC7 60FPS: measure fps over a ~2s play window ----
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
console.log(anyFail ? "\nFAIL — CAS-2109 guard-counter POST-FLIP QA" : "\nPASS — CAS-2109 guard-counter POST-FLIP QA (LIVE enabled:true observable + reversible, desktop+mobile)");
process.exit(anyFail ? 1 : 0);
