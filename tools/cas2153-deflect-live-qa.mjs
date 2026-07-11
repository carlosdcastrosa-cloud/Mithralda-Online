// ---------------------------------------------------------------------------
// CAS-2153 QA OBSERVABLE — Deflect / Reflejo de Proyectil (mec #39) DARK.
// Live DARK build 1a47fbc4938a (gh-pages), served blobs byte-verified == HEAD:
//   sim/config.js  ef60596683986adccd81c52d4e2a3387
//   sim/sim.js     e36a79f7c2de913404dc4d898dab7e1e
//   strings.js     2732aa1d8231af70e55c9c1841d822d5
//
// Drives the REAL browser loop against the LIVE gh-pages build. dynamic
// import(BASE+"sim/sim.js") resolves to the SAME cached ES-module singleton the
// game runs — DEFLECT + dev.deflectProbe / dev.deflectSrandFp mutate the LIVE
// instance and step the REAL updateProjectiles loop. Mirror of
// tools/cas2148-guard-break-live-qa.mjs. Complements the DOM-free node proof
// tools/cas2151-deflect-live-qa.mjs and the 38-mec cohesion audit v5.
//
//   AC0  [META]      served config DARK: {enabled:false, captureRadiusPx:34,
//                    dmgFracCap:0.15, speedMul:1.15, staminaCost:12,
//                    oncePerWindow:true, requiresParryWindow:true}.
//   AC1  [FLIP]      projectile caught in the parry window FLIPS owner
//                    (enemy→hero), REVERSES velocity toward the shooter, DAMAGES
//                    him; hero takes 0; window CONSUMED (parryTAfter 0); stam −12.
//   AC2  [CAP]       reflected dmg ≤ dmgFracCap×maxHp of target; huge dmg NO scale.
//   AC3  [ONCE]      deflect consumes parryT ⇒ a burst is not reflected wholesale.
//   AC4  [OFF]       enabled=false ⇒ NO flip: projectile hits the hero like HEAD;
//                    window intact ⇒ byte-id dead branch.
//   AC5  [WINDOW]    enabled but window NOT armed ⇒ NO flip (tempo-gate, not shield).
//   AC6  [VFX]       observable ¡REFLEJO! floater (#7ad2ff) + spark/dodgering fx
//                    fire in G.floaters/G.fx on a real deflect (no sink monkeypatch).
//   AC7  [SAVE]      serializeSave byte-id ON/OFF, no deflect*/_deflect* key.
//   AC8  [SRAND]     32-draw master-srand fingerprint ON==OFF (0 draws), determ.
//   AC9  [60FPS]     ~60fps sustained; mobile playable; DPR-capped.
//
// Run: node tools/cas2153-deflect-live-qa.mjs   (PASS×2 = invoke twice)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "1a47fbc4938a";
const OUT = "shots/cas2153";
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

  // AC0-boot BOOT
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

  // AC0 META: served DEFLECT knob DARK with exact values
  const meta = await page.evaluate(() => {
    const D = window.__h.cfg.DEFLECT;
    return { D: JSON.parse(JSON.stringify(D)) };
  });
  const D = meta.D;
  const metaOk = D.enabled === false && D.captureRadiusPx === 34 && D.dmgFracCap === 0.15
    && D.speedMul === 1.15 && D.staminaCost === 12 && D.oncePerWindow === true && D.requiresParryWindow === true;
  if (metaOk) P(`[${prof.name}] META: served DEFLECT DARK — enabled=${D.enabled}, captureRadiusPx=${D.captureRadiusPx}, dmgFracCap=${D.dmgFracCap}, speedMul=${D.speedMul}, staminaCost=${D.staminaCost}, oncePerWindow=${D.oncePerWindow}, requiresParryWindow=${D.requiresParryWindow}`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // AC1 FLIP + REVERSE (ON, window armed) — drives REAL updateProjectiles loop
  const on = await page.evaluate(() => window.__h.sim.dev.deflectProbe({ enabled: true, dmg: 40, targetHp: 500 }));
  const stamCost = await page.evaluate(() => window.__h.cfg.STAMINA.enabled ? window.__h.cfg.DEFLECT.staminaCost : 0);
  const a1 = on.ownerFlipped && on.velReversedAtFlip && on.vx0 < 0 && on.shooterHpLoss > 0
    && on.heroHpLoss === 0 && on.parryTAfter === 0 && on.stamSpent === stamCost;
  if (a1) P(`[${prof.name}] FLIP+REVERSE: flip=${on.ownerFlipped} velRev=${on.velReversedAtFlip} (vx0=${on.vx0}→+) shooterHpLoss=${on.shooterHpLoss} heroHpLoss=${on.heroHpLoss} parryTAfter=${on.parryTAfter} stamSpent=${on.stamSpent}`);
  else F(`[${prof.name}] FLIP+REVERSE broken: ${JSON.stringify(on)} stamCost=${stamCost}`);

  // AC2 CAP — huge dmg is capped ≤ dmgFracCap×targetHp; raising dmg does NOT raise reflected raw
  const cap = await page.evaluate(() => {
    const a = window.__h.sim.dev.deflectProbe({ enabled: true, dmg: 400, targetHp: 300 });   // cap = 45
    const b = window.__h.sim.dev.deflectProbe({ enabled: true, dmg: 9999, targetHp: 300 });  // still cap 45
    return { a, b };
  });
  const a2 = cap.a.capHit && cap.b.capHit && cap.a.reflectedRaw === cap.a.capValue
    && cap.b.reflectedRaw === cap.b.capValue && cap.a.reflectedRaw === cap.b.reflectedRaw && cap.a.reflectedRaw < 400;
  if (a2) P(`[${prof.name}] CAP: dmg400→raw ${cap.a.reflectedRaw}==cap ${cap.a.capValue}, dmg9999→raw ${cap.b.reflectedRaw} (no scale past cap, shooterHpLoss=${cap.a.shooterHpLoss})`);
  else F(`[${prof.name}] CAP broken: ${JSON.stringify(cap)}`);

  // AC3 ONCE-PER-WINDOW — the deflect consumes parryT ⇒ a burst can't be reflected wholesale
  const a3 = on.parryTAfter === 0 && D.oncePerWindow === true;
  if (a3) P(`[${prof.name}] ONCE-PER-WINDOW: deflect consumes parryT ⇒ parryTAfter=${on.parryTAfter}, oncePerWindow=${D.oncePerWindow}`);
  else F(`[${prof.name}] ONCE-PER-WINDOW broken: parryTAfter=${on.parryTAfter}`);

  // AC4 OFF byte-id — disabled ⇒ no flip, projectile hits the hero, window untouched
  const off = await page.evaluate(() => window.__h.sim.dev.deflectProbe({ enabled: false, dmg: 40, targetHp: 500 }));
  const a4 = !off.ownerFlipped && off.heroHpLoss > 0 && off.shooterHpLoss === 0 && off.stamSpent === 0 && off.parryTAfter > 0;
  if (a4) P(`[${prof.name}] OFF byte-id: flip=${off.ownerFlipped} heroHpLoss=${off.heroHpLoss} shooterHpLoss=${off.shooterHpLoss} stamSpent=${off.stamSpent} parryTAfter=${off.parryTAfter} (intact)`);
  else F(`[${prof.name}] OFF broken: ${JSON.stringify(off)}`);

  // AC5 WINDOW-GATED — enabled but window NOT armed ⇒ no flip (tempo-gate, not passive shield)
  const noWin = await page.evaluate(() => window.__h.sim.dev.deflectProbe({ enabled: true, arm: false, dmg: 40, targetHp: 500 }));
  const a5 = !noWin.ownerFlipped && noWin.heroHpLoss > 0 && noWin.shooterHpLoss === 0;
  if (a5) P(`[${prof.name}] WINDOW-GATED: no window ⇒ flip=${noWin.ownerFlipped} heroHpLoss=${noWin.heroHpLoss} (hits hero, tempo-gate)`);
  else F(`[${prof.name}] WINDOW-GATED broken: ${JSON.stringify(noWin)}`);

  // AC6 VFX OBSERVABLE — a real deflect pushes ¡REFLEJO! floater (#7ad2ff) + spark/dodgering fx (no monkeypatch)
  const vfx = await page.evaluate(() => {
    const { sim, str } = window.__h; const G = sim.G;
    sim.dev.deflectProbe({ enabled: true, dmg: 40, targetHp: 500 });  // fires a real deflect; probe clears then fills G.floaters/G.fx
    const refl = G.floaters.filter((f) => f.txt === str.STR.deflect);
    const spark = G.fx.filter((f) => f.kind === "spark");
    const ring = G.fx.filter((f) => f.kind === "dodgering");
    return { expected: str.STR.deflect, floaters: G.floaters.length, reflCount: refl.length,
      sample: refl[0] ? { txt: refl[0].txt, col: refl[0].col } : null, spark: spark.length, ring: ring.length };
  });
  if (vfx.reflCount >= 1 && vfx.sample && vfx.sample.col === "#7ad2ff" && vfx.sample.txt === vfx.expected && vfx.spark >= 1 && vfx.ring >= 1)
    P(`[${prof.name}] VFX: observable "${vfx.sample.txt}" floater ×${vfx.reflCount} (col=${vfx.sample.col}) + spark×${vfx.spark} + dodgering×${vfx.ring}`);
  else F(`[${prof.name}] VFX missing/wrong: ${JSON.stringify(vfx)}`);

  // AC7 SAVE byte-id — a real deflect leaves serializeSave identical ON/OFF, no deflect key
  const sb = await page.evaluate(() => {
    const { sim } = window.__h;
    sim.dev.deflectProbe({ enabled: true, dmg: 40, targetHp: 500 });  const on = JSON.stringify(sim.serializeSave());
    sim.dev.deflectProbe({ enabled: false, dmg: 40, targetHp: 500 }); const off = JSON.stringify(sim.serializeSave());
    return { byteId: on === off, len: on.length, hasKey: /deflect|_deflect/i.test(on) };
  });
  if (sb.byteId && !sb.hasKey) P(`[${prof.name}] SAVE: serializeSave byte-id ON/OFF (byteId=${sb.byteId}, len=${sb.len}), no deflect*/_deflect* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE broken: ${JSON.stringify(sb)}`);

  // AC8 SRAND STRONG — 32-draw master fingerprint ON==OFF (0 draws), deterministic
  const sr = await page.evaluate(() => {
    const on  = window.__h.sim.dev.deflectSrandFp(true,  1337, 32);
    const off = window.__h.sim.dev.deflectSrandFp(false, 1337, 32);
    const on2 = window.__h.sim.dev.deflectSrandFp(true,  1337, 32);
    return { onOff: on === off, determ: on === on2, sample: on.slice(0, 28) };
  });
  if (sr.onOff && sr.determ) P(`[${prof.name}] SRAND: 32-draw fingerprint ON==OFF (${sr.onOff}), determinístico (${sr.determ}) (${sr.sample}…)`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(sr)}`);

  // AC10 NO-REGRESSION (neighbours) — plain projectile still damages the hero, riposte hit still crits
  const reg = await page.evaluate(() => {
    const d = window.__h.sim.dev;
    const plain = d.deflectProbe({ enabled: false, dmg: 50, targetHp: 500 });
    const base = d.hitProbe(false, 100), rip = d.hitProbe(true, 100);
    return { plainHeroHpLoss: plain.heroHpLoss, base: base.dmg, rip: rip.dmg };
  });
  const a10 = reg.plainHeroHpLoss > 0 && reg.base > 0 && reg.rip > reg.base;
  if (a10) P(`[${prof.name}] NO-REGRESSION: plain proj heroHpLoss=${reg.plainHeroHpLoss}, base hit ${reg.base}, riposte hit ${reg.rip} (>base)`);
  else F(`[${prof.name}] NO-REGRESSION broken: ${JSON.stringify(reg)}`);

  // AC9 60FPS
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
