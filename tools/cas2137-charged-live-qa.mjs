// ---------------------------------------------------------------------------
// CAS-2137 QA OBSERVABLE — Ataque Cargado con Híper-Armadura (mec #37) DARK.
// Live DARK build ec1bf030edd5 (gh-pages), served blobs byte-verified:
//   sim/config.js  983463557434b79d81c51acd908c250f
//   input.js       6a817f99487bc750fede2f151e8d44f5
//   sim/sim.js     a656411ba45eebec8dc9271925efb5d2
//   strings.js     e9958295b2ff46c4cbe63ebbf05045f7
//   render/render.js 72dc6bfde4f838c54932c11cedc1f9c5
//
// Drives the REAL browser loop against the LIVE gh-pages build.
// dynamic import(BASE+"sim/sim.js") resolves to the SAME cached ES-module
// singleton the game runs — CHARGED_ATTACK + dev.charge* mutate LIVE instance.
// Mirror of tools/cas2131-riposte-live-qa.mjs (OBSERVABLE DARK QA pattern).
// Complements DOM-free node proof (tools/cas2133-charged-live-qa.mjs).
//
//   AC0  [BOOT]    boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1  [META]    served config DARK: {enabled:false, chargeThresholdMs:350,
//                  maxChargeMs:900, dmgMul:1.7, poiseMul:2.5, staminaCost:12,
//                  hyperArmorGrant:999, incomingDmgCapFracMaxHp:0.18,
//                  releaseCapFracMaxHp:0.22, requiresMelee:true}.
//   AC2  [HEADLINE] charged release ×dmgMul==1.7; light unaffected.
//   AC3  [POISE]   charged poise ×poiseMul==2.5; light unaffected.
//   AC4  [HYPER]   charging absorbs stun infl; not-charging: stun lands.
//   AC5  [CAP-IN]  incoming dmg while charging ≤ incomingDmgCapFracMaxHp×maxHp.
//   AC6  [CAP-OUT] release vs boss ≤ releaseCapFracMaxHp×maxHp; trash uncapped.
//   AC7  [VFX]     observable ¡CARGADO! floater fires on charged release.
//   AC8  [OFF]     enabled=false ⇒ chargeT=0 INERT (dmg HEAD byte-id).
//   AC9  [SAVE]    chargeT/charging/_charged transient ⇒ save byte-id ON/OFF.
//   AC10 [SRAND]   fingerprint byte-identical ON vs OFF (0 draws), deterministic.
//   AC11 [60FPS]   ~60fps sustained; mobile playable; DPR-capped.
//
// Run: node tools/cas2137-charged-live-qa.mjs   (PASS×2 = invoke twice)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "ec1bf030edd5";
const OUT = "shots/cas2137";
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "ChargedQA"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

// verify live build id before driving
{
  const page = await browser.newPage();
  const v = await page.evaluate(async (base) => {
    const r = await fetch(base + "version.json?cb=" + Date.now(), { cache: "no-store" });
    return r.json();
  }, BASE).catch(() => ({}));
  await page.close();
  if (v && v.build === EXPECT_BUILD) P(`[live] version.json build == ${EXPECT_BUILD} (files=${v.files})`);
  else F(`[live] version.json build=${v && v.build} != expected ${EXPECT_BUILD}`);
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

  // AC0 BOOT
  if (errors.length === 0) P(`[${prof.name}] BOOT: reached play scene with 0 game-JS errors`);
  else F(`[${prof.name}] BOOT errors: ${JSON.stringify(errors.slice(0, 4))}`);
  const badHttp = http404.filter((u) => !/favicon/i.test(u));
  if (badHttp.length === 0) P(`[${prof.name}] BOOT: 0 non-cosmetic 404s`);
  else F(`[${prof.name}] non-cosmetic 404s: ${JSON.stringify(badHttp.slice(0, 4))}`);

  // Bind the SERVED sim/config singletons
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    window.__h = { sim, cfg };
  }, BASE);

  // AC1 META: served config DARK with exact knob values
  const meta = await page.evaluate(() => {
    const m = window.__h.sim.dev.chargeMeta();
    return { m, cfgEnabled: window.__h.cfg.CHARGED_ATTACK.enabled };
  });
  const m = meta.m;
  const metaOk = m.enabled === false && m.chargeThresholdMs === 350 && m.maxChargeMs === 900
    && m.dmgMul === 1.7 && m.poiseMul === 2.5 && m.staminaCost === 12
    && m.hyperArmorGrant === 999 && m.incomingDmgCapFracMaxHp === 0.18
    && m.releaseCapFracMaxHp === 0.22 && m.requiresMelee === true;
  if (metaOk && meta.cfgEnabled === false)
    P(`[${prof.name}] META: served CHARGED_ATTACK DARK — enabled=false, chargeThresholdMs=${m.chargeThresholdMs}, dmgMul=${m.dmgMul}, poiseMul=${m.poiseMul}, hyper=${m.hyperArmorGrant}, capIn=${m.incomingDmgCapFracMaxHp}, capOut=${m.releaseCapFracMaxHp}`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // AC2 HEADLINE: charged release ×dmgMul (uses chargeThresholdProbe)
  const hp = await page.evaluate(() => window.__h.sim.dev.chargeThresholdProbe());
  if (hp.ok)
    P(`[${prof.name}] HEADLINE: sub-umbral normal=${hp.dSub} (_charged=${hp.subCharged}) vs supra (${hp.chargeTAtRelease}ms≥350) CARGADO=${hp.dSup} (_charged=${hp.supCharged}) ⇒ ratio=${hp.ratio}==dmgMul(${hp.expect}) ratioOk=${hp.ratioOk}; estamina EXTRA=${hp.extraStam}==staminaCost (${hp.stamOk})`);
  else F(`[${prof.name}] HEADLINE broken: ${JSON.stringify(hp)}`);

  // AC3 POISE: charged poise ×poiseMul
  const pp = await page.evaluate(() => window.__h.sim.dev.chargePoiseProbe());
  if (pp.ok)
    P(`[${prof.name}] POISE: pesado normal poise=${pp.pNorm} vs cargado poise=${pp.pChg} ⇒ ratio=${pp.ratio}==poiseMul(${pp.expect})`);
  else F(`[${prof.name}] POISE broken: ${JSON.stringify(pp)}`);

  // AC4 HYPER-ARMOR: charging absorbs stun
  const hyp = await page.evaluate(() => window.__h.sim.dev.chargeHyperArmorProbe());
  if (hyp.ok)
    P(`[${prof.name}] HYPER-ARMOR: stunNoCharge=${hyp.stunNoCharge}, stunDuringCharge=${hyp.stunDuringCharge}, hyperArmorAbsorbs=${hyp.hyperArmorAbsorbs}`);
  else F(`[${prof.name}] HYPER-ARMOR broken: ${JSON.stringify(hyp)}`);

  // AC5 CAP-IN: incoming damage capped while charging
  const cin = await page.evaluate(() => window.__h.sim.dev.chargeIncomingCapProbe());
  if (cin.ok)
    P(`[${prof.name}] CAP-IN: cap=${cin.cap}, dUncapped=${cin.dUncapped}>cap, dCapped=${cin.dCapped}≤cap (capOk=${cin.capOk})`);
  else F(`[${prof.name}] CAP-IN broken: ${JSON.stringify(cin)}`);

  // AC6 CAP-OUT: release vs boss capped at releaseCapFracMaxHp×maxHp
  const cout = await page.evaluate(() => window.__h.sim.dev.chargeOutgoingCapProbe());
  if (cout.ok)
    P(`[${prof.name}] CAP-OUT: cap=${cout.cap}, bossDmg=${cout.bossDmg}≤cap, trashDmg=${cout.trashDmg}>cap`);
  else F(`[${prof.name}] CAP-OUT broken: ${JSON.stringify(cout)}`);

  // AC7 VFX OBSERVABLE: ¡CARGADO! floater on charged release
  const vfx = await page.evaluate(() => {
    const { sim } = window.__h; const G = sim.G;
    G.floaters.length = 0;
    sim.dev.chargeThresholdProbe();  // fires real charged swing → should push ¡CARGADO! floater
    const charged = G.floaters.filter((f) => f.txt === "¡CARGADO!");
    return { total: G.floaters.length, chargedCount: charged.length, sample: charged[0] ? { txt: charged[0].txt, col: charged[0].col } : null };
  });
  if (vfx.chargedCount >= 1)
    P(`[${prof.name}] VFX: observable ¡CARGADO! floater ×${vfx.chargedCount} of ${vfx.total} (col=${vfx.sample && vfx.sample.col})`);
  else F(`[${prof.name}] VFX ¡CARGADO! missing: ${JSON.stringify(vfx)}`);

  // AC8 OFF: enabled=false INERT (chargeT never accumulates, byte-id)
  const off = await page.evaluate(() => window.__h.sim.dev.chargeOffProbe());
  if (off.ok)
    P(`[${prof.name}] OFF: enabled=false ⇒ INERT dForced=${off.dForced}==dRef=${off.dRef} HEAD byte-id`);
  else F(`[${prof.name}] OFF broken: ${JSON.stringify(off)}`);

  // AC9 SAVE: transient fields ⇒ save byte-id ON/OFF, no chargeT*/charging* key
  const sb = await page.evaluate(() => window.__h.sim.dev.chargeSaveByteId());
  if (sb.ok)
    P(`[${prof.name}] SAVE: serializeSave byte-id ON/OFF (byteId=${sb.byteId}), no chargeT*/charging key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE broken: ${JSON.stringify(sb)}`);

  // AC10 SRAND: 0 draws, fingerprint ON==OFF
  const SEED = 0x2133cafe, N = 30;
  const sr = await page.evaluate((seed, n) => {
    const on  = window.__h.sim.dev.chargeSrandProbe(true,  seed, n);
    const off = window.__h.sim.dev.chargeSrandProbe(false, seed, n);
    const on2 = window.__h.sim.dev.chargeSrandProbe(true,  seed, n);
    const eq  = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return { onOff: eq(on.fingerprint, off.fingerprint), determ: eq(on.fingerprint, on2.fingerprint), len: on.fingerprint.length };
  }, SEED, N);
  if (sr.onOff && sr.determ)
    P(`[${prof.name}] SRAND: ${sr.len}-draw fingerprint ON==OFF (${sr.onOff}), deterministic (${sr.determ})`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(sr)}`);

  // AC11 60FPS
  const fps = await page.evaluate(() => new Promise((res) => {
    let frames = 0; const t0 = performance.now();
    function tick() { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(frames / ((performance.now() - t0) / 1000)); }
    requestAnimationFrame(tick);
  }));
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  if (fps >= 55) P(`[${prof.name}] 60FPS: ${fps.toFixed(1)}fps DPR=${dpr}`);
  else F(`[${prof.name}] 60FPS: fps=${fps.toFixed(1)} too low`);

  await page.screenshot({ path: `${OUT}/${prof.name}-done.png` });
  await page.close();
}

await browser.close();
console.log(anyFail ? "\n✖ SOME TESTS FAILED" : "\n✔ ALL PASS");
process.exit(anyFail ? 1 : 0);
