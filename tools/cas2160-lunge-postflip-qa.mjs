// ---------------------------------------------------------------------------
// CAS-2160 QA OBSERVABLE POST-FLIP — LUNGE / Estocada de Avance (mec #40) LIVE.
// Gate CEO CAS-2159 flipped LUNGE.enabled false→true (config-only, master ba96f94,
// gh-pages 2ca3a9b). Live build fa5ccf7c051f (supersede DARK 6e32a8af63e0). The 4
// behaviour blobs (sim/input/strings/render) are BYTE-ID to the QA-proven DARK set
// (CAS-2158 PASS×2) ⇒ live == QA-observable; only sim/config.js changed (the flip).
// Served blobs byte-verified == HEAD (master):
//   sim/config.js  6fd877756596cc90717c66656e1dd104  (LUNGE.enabled:true)
//   sim/sim.js     2b6ea7fbd5f14bda638e28cf74e3051b
//   input.js       877899def9c3f51e8ea3a232ce0d2cc4
//   strings.js     54db1b523d361d98ed1046a643bc32b0
//   render/render.js 7eec7d36ba870e327e54a0c22cf40e75
//
// Drives the REAL browser loop against the LIVE gh-pages build. dynamic
// import(BASE+"sim/sim.js") resolves to the SAME cached ES-module singleton the
// game runs — LUNGE + dev.lungeProbe / dev.lungeSrandFp mutate the LIVE instance
// and step the REAL lunge seams (lungeStrike → applyHeroMelee sweep + moveEnt
// dash + recovery). Mirror of tools/cas2153-deflect-live-qa.mjs. Complements the
// DOM-free node proof tools/cas2156-lunge-build-verify.mjs and the 39-mec
// cohesion audit v5.
//
//   AC0  [META]   served config LIVE post-flip: {enabled:TRUE, distance:118,
//                 dashMs:150, range:60, arcDeg:70, dmgMul:1.3, staminaCost:16,
//                 recoverMs:520, key:"Backslash"}.
//   AC1  [DASH]   hero TRANSLATES ~118px toward facing (displacement observable).
//   AC2  [STRIKE] the strike connects for ×dmgMul (≈1.3× a non-lunge swing —
//                 empirically: dmgMul temporarily 1.0 vs 1.3 on the SAME probe).
//   AC3  [NO-IFRAMES] the dash does NOT arm h.iframe ⇒ vulnerable (distinguishes
//                 from the roll; commit / whiff-punishable). 🔑 headline contrast.
//   AC4  [OFF]    enabled=false ⇒ key inert: no fire, no displacement, no dmg, no
//                 floater ⇒ byte-id dead branch (force enabled:true for the rest).
//   AC5  [COST]   stamina −16; _lungeCd blocks re-lunge; no vigor ⇒ deny; not
//                 rolling during the dash (anti-cancel).
//   AC6  [SAVE]   serializeSave byte-id before/after a real lunge, no lunge* key.
//   AC7  [SRAND]  32-draw master-srand fingerprint ON==OFF (0 draws), determ.
//   AC8  [NO-REG] plain swing still damages; neighbour riposte #36 still crits
//                 (>base). Full 39-mec regression: DOM-free build-verify + cohesion.
//   VFX  observable ¡ESTOCADA! floater (#9fe8ff) in G.floaters. 60fps DPR desk+mob.
//
// Run: node tools/cas2160-lunge-postflip-qa.mjs   (PASS×2 = invoke twice)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "fa5ccf7c051f";
const OUT = "shots/cas2160";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 414, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "EstocadaQA"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

  // BOOT
  if (errors.length === 0) P(`[${prof.name}] BOOT: reached play scene with 0 game-JS errors`);
  else F(`[${prof.name}] BOOT errors: ${JSON.stringify(errors.slice(0, 4))}`);
  const badHttp = http404.filter((u) => !/favicon/i.test(u));
  if (badHttp.length === 0) P(`[${prof.name}] BOOT: 0 non-cosmetic 404s`);
  else F(`[${prof.name}] non-cosmetic 404s: ${JSON.stringify(badHttp.slice(0, 4))}`);

  // Bind the SERVED sim/config/strings singletons
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    const str = await import(base + "strings.js");
    window.__h = { sim, cfg, str };
  }, BASE);

  // AC0 META: served LUNGE knob LIVE post-flip — enabled:TRUE, values unchanged from DARK
  const meta = await page.evaluate(() => JSON.parse(JSON.stringify(window.__h.cfg.LUNGE)));
  const metaOk = meta.enabled === true && meta.distance === 118 && meta.dashMs === 150 && meta.range === 60
    && meta.arcDeg === 70 && meta.dmgMul === 1.3 && meta.staminaCost === 16 && meta.recoverMs === 520 && meta.key === "Backslash";
  if (metaOk) P(`[${prof.name}] META: served LUNGE LIVE post-flip — enabled=${meta.enabled}, distance=${meta.distance}, dashMs=${meta.dashMs}, range=${meta.range}, arcDeg=${meta.arcDeg}, dmgMul=${meta.dmgMul}, staminaCost=${meta.staminaCost}, recoverMs=${meta.recoverMs}, key=${meta.key}`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // AC1 DASH — hero translates ~distance toward facing (drives real lungeStrike + moveEnt dash)
  const on = await page.evaluate(() => window.__h.sim.dev.lungeProbe({ enabled: true, probeRecovery: true }));
  const stamCost = await page.evaluate(() => window.__h.cfg.STAMINA.enabled ? window.__h.cfg.LUNGE.staminaCost : 0);
  const a1 = on.fired && on.displacement > meta.distance * 0.6 && on.displacement <= meta.distance * 1.25;
  if (a1) P(`[${prof.name}] DASH: hero displaced ${on.displacement}px toward facing (cfg distance=${meta.distance}, ~${(on.displacement / meta.distance).toFixed(2)}×)`);
  else F(`[${prof.name}] DASH broken: fired=${on.fired} disp=${on.displacement} (cfg ${meta.distance})`);

  // AC2 STRIKE ×dmgMul — empirically compare dmgMul 1.0 vs served 1.3 on the SAME lunge swing
  const strike = await page.evaluate(() => {
    const cfg = window.__h.cfg, sim = window.__h.sim;
    const sav = cfg.LUNGE.dmgMul;
    cfg.LUNGE.dmgMul = 1.0; const base = sim.dev.lungeProbe({ enabled: true, targetHp: 500000 }).enemyHpLoss;
    cfg.LUNGE.dmgMul = 1.3; const boost = sim.dev.lungeProbe({ enabled: true, targetHp: 500000 }).enemyHpLoss;
    cfg.LUNGE.dmgMul = sav;
    return { base, boost, ratio: base ? +(boost / base).toFixed(3) : 0, restored: cfg.LUNGE.dmgMul };
  });
  const a2 = strike.base > 0 && strike.boost > strike.base && Math.abs(strike.ratio - 1.3) < 0.06 && strike.restored === 1.3;
  if (a2) P(`[${prof.name}] STRIKE: dmgMul1.0 ${strike.base} → dmgMul1.3 ${strike.boost} (ratio ${strike.ratio} ≈ 1.3), cfg restored=${strike.restored}`);
  else F(`[${prof.name}] STRIKE broken: ${JSON.stringify(strike)}`);

  // AC3 NO-IFRAMES 🔑 — the dash does NOT grant i-frames (unlike the roll) ⇒ vulnerable/commit
  const a3 = on.iframeGranted === false && on.iframeMax === 0 && on.rolling === false;
  if (a3) P(`[${prof.name}] NO-IFRAMES: iframeGranted=${on.iframeGranted} iframeMax=${on.iframeMax} rolling=${on.rolling} (vulnerable dash, whiff-punishable)`);
  else F(`[${prof.name}] NO-IFRAMES broken: iframeMax=${on.iframeMax} granted=${on.iframeGranted} rolling=${on.rolling}`);

  // AC4 OFF byte-id — disabled ⇒ key inert: no fire, no displacement, no dmg, no floater
  const off = await page.evaluate(() => window.__h.sim.dev.lungeProbe({ enabled: false }));
  const a4 = off.fired === false && off.displacement < 1 && off.enemyHpLoss === 0 && off.floated === false && off.stamSpent === 0;
  if (a4) P(`[${prof.name}] OFF byte-id: fired=${off.fired} disp=${off.displacement} dmg=${off.enemyHpLoss} floater=${off.floated} stam=${off.stamSpent} (dead branch)`);
  else F(`[${prof.name}] OFF broken: ${JSON.stringify(off)}`);

  // AC5 COST + RECOVERY — stamina 16, _lungeCd blocks re-lunge, no-vigor deny, not rolling
  const denyStam = await page.evaluate(() => window.__h.sim.dev.lungeProbe({ enabled: true, noStam: true }));
  const a5 = on.stamSpent === stamCost && on.lungeCdAfterFire > 0 && on.reLungeFired === false && on.reLungeStamSpent === 0
    && denyStam.fired === false && denyStam.displacement < 1 && on.rolling === false;
  if (a5) P(`[${prof.name}] COST+RECOVERY: stam −${on.stamSpent} (cfg ${stamCost}), _lungeCd=${on.lungeCdAfterFire}s blocks re-lunge (reFired=${on.reLungeFired} reStam=${on.reLungeStamSpent}), no-vigor deny (fired=${denyStam.fired}), notRolling=${!on.rolling}`);
  else F(`[${prof.name}] COST+RECOVERY broken: stamSpent=${on.stamSpent}/${stamCost} cd=${on.lungeCdAfterFire} reFired=${on.reLungeFired} deny=${JSON.stringify(denyStam)}`);

  // AC6 SAVE byte-id — a real lunge leaves serializeSave identical, no lunge key
  const sb = await page.evaluate(() => {
    const sim = window.__h.sim;
    sim.dev.lungeProbe({ enabled: true, cls: "warrior" }); const s0 = JSON.stringify(sim.serializeSave());
    sim.dev.lungeProbe({ enabled: true, cls: "warrior" }); const s1 = JSON.stringify(sim.serializeSave());
    return { byteId: s0 === s1, len: s0.length, hasKey: /lunge/i.test(s0) };
  });
  if (sb.byteId && !sb.hasKey) P(`[${prof.name}] SAVE: serializeSave byte-id before/after lunge (byteId=${sb.byteId}, len=${sb.len}), no lunge* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE broken: ${JSON.stringify(sb)}`);

  // AC7 SRAND STRONG — 32-draw master fingerprint ON==OFF (0 draws), deterministic
  const sr = await page.evaluate(() => {
    const on  = window.__h.sim.dev.lungeSrandFp(true,  12345, 32);
    const off = window.__h.sim.dev.lungeSrandFp(false, 12345, 32);
    const on2 = window.__h.sim.dev.lungeSrandFp(true,  12345, 32);
    return { onOff: on === off, determ: on === on2, sample: on.slice(0, 28) };
  });
  if (sr.onOff && sr.determ) P(`[${prof.name}] SRAND: 32-draw fingerprint ON==OFF (${sr.onOff}), determinístico (${sr.determ}) (${sr.sample}…)`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(sr)}`);

  // VFX OBSERVABLE — a real lunge pushes ¡ESTOCADA! floater (#9fe8ff) into G.floaters (no monkeypatch)
  const vfx = await page.evaluate(() => {
    const { sim, str } = window.__h; const G = sim.G;
    sim.dev.lungeProbe({ enabled: true });
    const f = G.floaters.filter((x) => x.txt === str.STR.lunge);
    return { expected: str.STR.lunge, count: f.length, sample: f[0] ? { txt: f[0].txt, col: f[0].col } : null };
  });
  if (vfx.count >= 1 && vfx.sample && vfx.sample.col === "#9fe8ff" && vfx.sample.txt === vfx.expected)
    P(`[${prof.name}] VFX: observable "${vfx.sample.txt}" floater ×${vfx.count} (col=${vfx.sample.col})`);
  else F(`[${prof.name}] VFX missing/wrong: ${JSON.stringify(vfx)}`);

  // AC8 NO-REGRESSION (neighbours) — plain swing still lands, riposte #36 still crits >base
  const reg = await page.evaluate(() => {
    const d = window.__h.sim.dev;
    const base = d.hitProbe(false, 100), rip = d.hitProbe(true, 100);
    const mage = d.lungeProbe({ enabled: true, cls: "mage" });   // universal: ranged class still closes distance
    return { base: base.dmg, rip: rip.dmg, mageDisp: mage.displacement, mageDmg: mage.enemyHpLoss };
  });
  const a8 = reg.base > 0 && reg.rip > reg.base && reg.mageDisp > meta.distance * 0.6 && reg.mageDmg > 0;
  if (a8) P(`[${prof.name}] NO-REGRESSION: base swing ${reg.base}, riposte #36 ${reg.rip} (>base), UNIVERSAL mage dash ${reg.mageDisp}px dmg ${reg.mageDmg}`);
  else F(`[${prof.name}] NO-REGRESSION broken: ${JSON.stringify(reg)}`);

  // 60FPS
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
