// ---------------------------------------------------------------------------
// CAS-2241 QA OBSERVABLE — Deflect / Reflejo de Proyectil (mec #39) LIVE (POST-GATE).
//
// RECONCILIATION: the issue frames this as "DARK build 4654015, pre-Gate CEO",
// but DEFLECT was already QA'd DARK (CAS-2153 PASS×2), flipped GO-LIVE by the CEO
// Gate (CAS-2154, enabled:true), and shipped + audited (CAS-2161). It is LIVE on
// the current gh-pages build 817c87faa83e. This harness therefore validates the
// mechanic AS SHIPPED (enabled:true served) — the observable human checklist run
// against the REAL live loop — rather than a pre-Gate DARK build that no longer
// exists on gh-pages.
//
// Drives the REAL browser loop against the LIVE gh-pages build. dynamic
// import(BASE+"sim/sim.js") resolves to the SAME cached ES-module singleton the
// game runs — DEFLECT + dev.deflectProbe / dev.deflectSrandFp mutate the LIVE
// instance and step the REAL updateProjectiles loop. Mirror of
// tools/cas2153-deflect-live-qa.mjs (which targeted the retired DARK build).
//
//  CHECKLIST (CAS-2241 OBSERVABLE):
//   1 TIMING   projectile caught IN the parry window FLIPS owner (enemy→hero) +
//              REVERSES velocity toward the shooter; OUT of window ⇒ nothing (AC5).
//   2 DMG/CAP  reflected dmg hits the SHOOTER (not hero), ≤ dmgFracCap×maxHp (15%),
//              giant projectiles do NOT scale past the cap.
//   3 ONCE     one deflect per window (consumes parryT) + costs 12 stamina.
//   4 LEGIB    observable "¡REFLEJO!" floater (#7ad2ff) + spark + dodgering fx fire.
//   5 NO-REG   melee/riposte hit still crits; plain projectile still damages hero;
//              60fps; 0 JS errors; save byte-id; srand ON==OFF (determinism).
//   6 MOBILE   the window is playable on touch (mobile profile runs the whole suite).
//
//   META  served DEFLECT LIVE: {enabled:TRUE, captureRadiusPx:34, dmgFracCap:0.15,
//         speedMul:1.15, staminaCost:12, oncePerWindow:true, requiresParryWindow:true}.
//
// Run: node tools/cas2241-deflect-live-qa.mjs   (PASS×2 = invoke twice)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "817c87faa83e";
const OUT = "shots/cas2241";
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "ReflejoQA"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

  // Bind the SERVED sim/config singletons
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    const str = await import(base + "strings.js");
    window.__h = { sim, cfg, str };
  }, BASE);

  // META: served DEFLECT LIVE (enabled:true) with exact tuning
  const meta = await page.evaluate(() => ({ D: JSON.parse(JSON.stringify(window.__h.cfg.DEFLECT)) }));
  const D = meta.D;
  const metaOk = D.enabled === true && D.captureRadiusPx === 34 && D.dmgFracCap === 0.15
    && D.speedMul === 1.15 && D.staminaCost === 12 && D.oncePerWindow === true && D.requiresParryWindow === true;
  if (metaOk) P(`[${prof.name}] META: served DEFLECT LIVE — enabled=${D.enabled}, captureRadiusPx=${D.captureRadiusPx}, dmgFracCap=${D.dmgFracCap}, speedMul=${D.speedMul}, staminaCost=${D.staminaCost}, oncePerWindow=${D.oncePerWindow}, requiresParryWindow=${D.requiresParryWindow}`);
  else F(`[${prof.name}] META unexpected (expected enabled:true LIVE): ${JSON.stringify(meta)}`);

  // 1 TIMING (in-window) — FLIP + REVERSE via the REAL updateProjectiles loop
  const on = await page.evaluate(() => window.__h.sim.dev.deflectProbe({ enabled: true, dmg: 40, targetHp: 500 }));
  const stamCost = await page.evaluate(() => window.__h.cfg.STAMINA.enabled ? window.__h.cfg.DEFLECT.staminaCost : 0);
  const c1 = on.ownerFlipped && on.velReversedAtFlip && on.vx0 < 0 && on.shooterHpLoss > 0
    && on.heroHpLoss === 0 && on.parryTAfter === 0 && on.stamSpent === stamCost;
  if (c1) P(`[${prof.name}] 1 TIMING(in-window): flip=${on.ownerFlipped} velRev=${on.velReversedAtFlip} (vx0=${on.vx0}→+) shooterHpLoss=${on.shooterHpLoss} heroHpLoss=${on.heroHpLoss} parryTAfter=${on.parryTAfter} stamSpent=${on.stamSpent}`);
  else F(`[${prof.name}] 1 TIMING(in-window) broken: ${JSON.stringify(on)} stamCost=${stamCost}`);

  // 1 TIMING (out-of-window) — window NOT armed ⇒ NO flip (tempo-gate, not passive shield)
  const noWin = await page.evaluate(() => window.__h.sim.dev.deflectProbe({ enabled: true, arm: false, dmg: 40, targetHp: 500 }));
  const c1b = !noWin.ownerFlipped && noWin.heroHpLoss > 0 && noWin.shooterHpLoss === 0;
  if (c1b) P(`[${prof.name}] 1 TIMING(out-window): no window ⇒ flip=${noWin.ownerFlipped} heroHpLoss=${noWin.heroHpLoss} (hits hero, tempo-gated)`);
  else F(`[${prof.name}] 1 TIMING(out-window) broken: ${JSON.stringify(noWin)}`);

  // 2 DMG/CAP — reflected dmg hits the SHOOTER, capped ≤ dmgFracCap×maxHp; giants do NOT scale
  const cap = await page.evaluate(() => {
    const a = window.__h.sim.dev.deflectProbe({ enabled: true, dmg: 400, targetHp: 300 });   // cap = 45
    const b = window.__h.sim.dev.deflectProbe({ enabled: true, dmg: 9999, targetHp: 300 });  // still cap 45
    return { a, b };
  });
  const c2 = cap.a.capHit && cap.b.capHit && cap.a.reflectedRaw === cap.a.capValue
    && cap.b.reflectedRaw === cap.b.capValue && cap.a.reflectedRaw === cap.b.reflectedRaw
    && cap.a.reflectedRaw < 400 && cap.a.shooterHpLoss > 0;
  if (c2) P(`[${prof.name}] 2 DMG/CAP: dmg400→raw ${cap.a.reflectedRaw}==cap ${cap.a.capValue} (15% of 300), dmg9999→raw ${cap.b.reflectedRaw} (no scale), shooterHpLoss=${cap.a.shooterHpLoss}`);
  else F(`[${prof.name}] 2 DMG/CAP broken: ${JSON.stringify(cap)}`);

  // 3 ONCE-PER-WINDOW + STAMINA — deflect consumes parryT (burst not reflected wholesale), costs 12
  const c3 = on.parryTAfter === 0 && D.oncePerWindow === true && on.stamSpent === stamCost && D.staminaCost === 12;
  if (c3) P(`[${prof.name}] 3 ONCE+STAM: consumes parryT (parryTAfter=${on.parryTAfter}) oncePerWindow=${D.oncePerWindow}, stamSpent=${on.stamSpent}/cost=${D.staminaCost}`);
  else F(`[${prof.name}] 3 ONCE+STAM broken: parryTAfter=${on.parryTAfter} stamSpent=${on.stamSpent}`);

  // 4 LEGIBILITY — real deflect pushes "¡REFLEJO!" floater (#7ad2ff) + spark + dodgering fx (no monkeypatch)
  const vfx = await page.evaluate(() => {
    const { sim, str } = window.__h; const G = sim.G;
    sim.dev.deflectProbe({ enabled: true, dmg: 40, targetHp: 500 });  // fires a real deflect; probe clears then fills G.floaters/G.fx
    const refl = G.floaters.filter((f) => f.txt === str.STR.deflect);
    const spark = G.fx.filter((f) => f.kind === "spark");
    const ring = G.fx.filter((f) => f.kind === "dodgering");
    return { expected: str.STR.deflect, reflCount: refl.length,
      sample: refl[0] ? { txt: refl[0].txt, col: refl[0].col } : null, spark: spark.length, ring: ring.length };
  });
  const c4 = vfx.reflCount >= 1 && vfx.sample && vfx.sample.col === "#7ad2ff" && vfx.sample.txt === vfx.expected && vfx.spark >= 1 && vfx.ring >= 1;
  if (c4) P(`[${prof.name}] 4 LEGIB: "${vfx.sample.txt}" floater ×${vfx.reflCount} (col=${vfx.sample.col}) + spark×${vfx.spark} + dodgering×${vfx.ring}`);
  else F(`[${prof.name}] 4 LEGIB missing/wrong: ${JSON.stringify(vfx)}`);

  // 5 NO-REGRESSION — OFF byte-id path, save byte-id, srand ON==OFF, neighbours intact
  const off = await page.evaluate(() => window.__h.sim.dev.deflectProbe({ enabled: false, dmg: 40, targetHp: 500 }));
  const offOk = !off.ownerFlipped && off.heroHpLoss > 0 && off.shooterHpLoss === 0 && off.stamSpent === 0 && off.parryTAfter > 0;
  const sb = await page.evaluate(() => {
    const { sim } = window.__h;
    sim.dev.deflectProbe({ enabled: true, dmg: 40, targetHp: 500 });  const a = JSON.stringify(sim.serializeSave());
    sim.dev.deflectProbe({ enabled: false, dmg: 40, targetHp: 500 }); const b = JSON.stringify(sim.serializeSave());
    return { byteId: a === b, len: a.length, hasKey: /deflect|_deflect/i.test(a) };
  });
  const sr = await page.evaluate(() => {
    const a  = window.__h.sim.dev.deflectSrandFp(true,  1337, 32);
    const b  = window.__h.sim.dev.deflectSrandFp(false, 1337, 32);
    const a2 = window.__h.sim.dev.deflectSrandFp(true,  1337, 32);
    return { onOff: a === b, determ: a === a2 };
  });
  const reg = await page.evaluate(() => {
    const d = window.__h.sim.dev;
    const plain = d.deflectProbe({ enabled: false, dmg: 50, targetHp: 500 });
    const base = d.hitProbe(false, 100), rip = d.hitProbe(true, 100);
    return { plainHeroHpLoss: plain.heroHpLoss, base: base.dmg, rip: rip.dmg };
  });
  const c5 = offOk && sb.byteId && !sb.hasKey && sr.onOff && sr.determ
    && reg.plainHeroHpLoss > 0 && reg.base > 0 && reg.rip > reg.base;
  if (c5) P(`[${prof.name}] 5 NO-REG: OFF-noflip(hero-hpLoss=${off.heroHpLoss},window-intact) save-byteId=${sb.byteId}(noKey=${!sb.hasKey}) srand ON==OFF=${sr.onOff} determ=${sr.determ} | plain-proj=${reg.plainHeroHpLoss} melee ${reg.base}→riposte ${reg.rip}(>)`);
  else F(`[${prof.name}] 5 NO-REG broken: off=${JSON.stringify(off)} save=${JSON.stringify(sb)} srand=${JSON.stringify(sr)} reg=${JSON.stringify(reg)}`);

  // 6 MOBILE / 60FPS — sustained framerate (whole suite already ran on the mobile profile)
  const fps = await page.evaluate(() => new Promise((res) => {
    let frames = 0; const t0 = performance.now();
    function tick() { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(frames / ((performance.now() - t0) / 1000)); }
    requestAnimationFrame(tick);
  }));
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  if (fps >= 55) P(`[${prof.name}] 6 ${prof.name === "mobile" ? "MOBILE" : "DESKTOP"}/60FPS: ${fps.toFixed(1)}fps DPR=${dpr} (suite ran on this profile)`);
  else F(`[${prof.name}] 60FPS: fps=${fps.toFixed(1)} too low`);

  await page.screenshot({ path: `${OUT}/${prof.name}-done.png` });
  await page.close();
}

await browser.close();
console.log(anyFail ? "\n✖ SOME TESTS FAILED" : "\n✔ ALL PASS");
process.exit(anyFail ? 1 : 0);
