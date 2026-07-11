// ---------------------------------------------------------------------------
// CAS-2121 (QA OBSERVABLE recovery, umbrella / mec #35 RECUPERACIÓN / RALLY / REGAIN).
// Live DARK build f2305f6b890d (gh-pages), served sim/config.js md5 39cffe4d / sim/sim.js md5 336ee228 /
// render/render.js md5 ef21e533 == HEAD (byte-verified out-of-band).
//
// Drives the REAL browser loop against the LIVE gh-pages build. game.js imports "./sim/sim.js", so a
// dynamic import(BASE+"sim/sim.js") in-page resolves to the SAME cached ES-module singleton the game is
// running — G, dev.rally*, RALLY all mutate the LIVE instance. Mirror of
// tools/cas2110-dodge-counter-live-qa.mjs (OBSERVABLE DARK QA pattern). Complements the DOM-free node
// proof (tools/cas2114-rally-live-qa.mjs).
//
// The feature ships DARK (RALLY.enabled:false live). This harness proves the DARK invariants AND that the
// machine is genuinely OBSERVABLE when the Gate CEO flips it, by driving the REAL seams (damageHero →
// rallyPool arm / tickRally decay / applyHeroMelee heal) on the LIVE served sim:
//
//   AC0  [BOOT]     boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1  [META]     served config knob DARK: {enabled:false, recoverFrac:0.35, windowS:3.0, healPerHitFrac:0.5, decayPerSec:0.15, capFracMaxHp:0.4, requiresMelee:true}.
//   AC2  [ARM]      real damage arms h.rallyPool=real*recoverFrac, rallyT=windowS (capped at capFracMaxHp*hpMax).
//   AC3  [HEAL]     a connecting melee swing heals min(pool*healPerHitFrac,pool), subtracts from pool, once per swing (AoE=1×).
//   AC4  [CAP]      a huge hit caps the pool at capFracMaxHp*hpMax (anti-abuse jefes).
//   AC5  [DECAY]    tickRally decays decayPerSec*hpMax/s; window expiry forces pool→0 (never over-heal).
//   AC6  [OFF]      enabled=false ⇒ damage NEVER arms + forcing rallyPool>0 is INERT in the swing (heal==0, HEAD byte-id).
//   AC7  [SAVE]     h.rallyPool/h.rallyT transient ⇒ save.v1 byte-id ON/OFF, no rally* key.
//   AC8  [SRAND]    master-srand fingerprint byte-identical ON vs OFF (0 rallyRng), deterministic.
//   AC9  [60FPS]    ~60fps sustained while playing; mobile playable.
//
// Run: node tools/cas2121-rally-live-qa.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "f2305f6b890d";
const OUT = "shots/cas2121";
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

  // ---- AC1 META: served config is DARK (enabled:false) with exact knob values ----
  const meta = await page.evaluate(() => {
    const m = window.__h.sim.dev.rallyMeta();
    const G = window.__h.cfg.RALLY;
    return { m, cfgEnabled: G.enabled };
  });
  const m = meta.m;
  const valsOk = m.enabled === false && m.recoverFrac === 0.35 && m.windowS === 3.0 && m.healPerHitFrac === 0.5 && m.decayPerSec === 0.15 && m.capFracMaxHp === 0.4 && m.requiresMelee === true;
  if (valsOk && meta.cfgEnabled === false)
    P(`[${prof.name}] META: served RALLY DARK — enabled=false, recoverFrac=${m.recoverFrac}, windowS=${m.windowS}, healPerHitFrac=${m.healPerHitFrac}, decayPerSec=${m.decayPerSec}, capFracMaxHp=${m.capFracMaxHp}, requiresMelee=${m.requiresMelee} (exact ticket AC1)`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // ---- AC2 ARM: real damage arms pool=real*recoverFrac, rallyT=windowS ----
  const ap = await page.evaluate(() => window.__h.sim.dev.rallyArmProbe());
  if (ap.ok && ap.poolOk && ap.windowOk)
    P(`[${prof.name}] ARM: real damage=${ap.real} ⇒ pool=${ap.pool}(==real·recoverFrac ${ap.expectPool}); rallyT=${ap.rallyT}(==windowS ${m.windowS})`);
  else F(`[${prof.name}] ARM broken: ${JSON.stringify(ap)}`);

  // ---- AC3 HEAL: connecting melee swing heals pool*healPerHitFrac, subtracts, once per swing (AoE=1×) ----
  const hp = await page.evaluate(() => window.__h.sim.dev.rallyHealProbe());
  if (hp.ok && hp.healOk && hp.poolOk && hp.onceOk)
    P(`[${prof.name}] HEAL: swing heals ${hp.healed}(==pool·healPerHitFrac ${hp.expectHeal}); pool left=${hp.poolAfter}; AoE 2-mobs heals ${hp.healedAoE} ONCE (onceOk=${hp.onceOk})`);
  else F(`[${prof.name}] HEAL broken: ${JSON.stringify(hp)}`);

  // ---- AC4 CAP: huge hit caps pool at capFracMaxHp*hpMax ----
  const cp = await page.evaluate(() => window.__h.sim.dev.rallyCapProbe());
  if (cp.ok && cp.capOk)
    P(`[${prof.name}] CAP: huge hit ⇒ pool=${cp.pool} capped at cap=${cp.cap}(==capFracMaxHp·hpMax) ⇒ anti-abuse jefes`);
  else F(`[${prof.name}] CAP broken: ${JSON.stringify(cp)}`);

  // ---- AC5 DECAY: tickRally decays + forces 0 on expiry ----
  const dp = await page.evaluate(() => window.__h.sim.dev.rallyDecayProbe());
  if (dp.ok && dp.decayOk && dp.expiredZero)
    P(`[${prof.name}] DECAY: pool ${dp.p0}→${dp.p1} in 0.5s (drop=${dp.expectDrop}=decayPerSec·hpMax·dt); window expiry ⇒ pool forced 0 (expiredZero=${dp.expiredZero})`);
  else F(`[${prof.name}] DECAY broken: ${JSON.stringify(dp)}`);

  // ---- AC6 OFF: enabled=false ⇒ no arm + forcing rallyPool>0 INERT (heal==0, HEAD byte-id) ----
  const off = await page.evaluate(() => window.__h.sim.dev.rallyOffProbe());
  if (off.ok && off.noArm && off.healA === 0 && off.healB === 0)
    P(`[${prof.name}] OFF: enabled=false ⇒ damage NO-arm(${off.noArm}) + forcing rallyPool>0 INERT — swing NO heal (healA=${off.healA}==healB=${off.healB}==0) ⇒ melee branch byte-id to HEAD`);
  else F(`[${prof.name}] OFF not inert: ${JSON.stringify(off)}`);

  // ---- AC7 SAVE: transient state ⇒ save.v1 byte-id ON/OFF, no rally* key ----
  const sb = await page.evaluate(() => window.__h.sim.dev.rallySaveByteId());
  if (sb.ok && sb.byteId && !sb.hasKey)
    P(`[${prof.name}] SAVE: h.rallyPool/h.rallyT transient ⇒ serializeSave() BYTE-IDENTICAL ON/OFF (byteId=${sb.byteId}), no rally* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE byte-id broken: ${JSON.stringify({ byteId: sb.byteId, hasKey: sb.hasKey, onLen: sb.onLen, offLen: sb.offLen })}`);

  // ---- AC8 SRAND: master-srand byte-id ON vs OFF (0 rallyRng), deterministic ----
  const srand = await page.evaluate(() => {
    const { dev } = window.__h.sim;
    const on = dev.rallySrandProbe(true, 0x2114c0de, 24);
    const off = dev.rallySrandProbe(false, 0x2114c0de, 24);
    const on2 = dev.rallySrandProbe(true, 0x2114c0de, 24);
    return {
      same: JSON.stringify(on.fingerprint) === JSON.stringify(off.fingerprint),
      determ: JSON.stringify(on.fingerprint) === JSON.stringify(on2.fingerprint),
      len: on.fingerprint.length,
    };
  });
  if (srand.same && srand.determ && srand.len === 48)
    P(`[${prof.name}] SRAND: master-srand fingerprint (${srand.len} draws=2×24) BYTE-IDENTICAL ON==OFF (0 rallyRng); deterministic across repeats`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(srand)}`);

  // ---- AC9 60FPS: measure fps over a ~2s play window ----
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
console.log(anyFail ? "\nFAIL — CAS-2121 rally/regain LIVE QA" : "\nPASS — CAS-2121 rally/regain LIVE QA (DARK observable, all AC, desktop+mobile)");
process.exit(anyFail ? 1 : 0);
