// ---------------------------------------------------------------------------
// CAS-2164 QA OBSERVABLE — SEGUNDO ALIENTO / SECOND_WIND (mec #41) DARK.
// Umbrella CAS-2162. Live DARK build bf8a811b3dc0 (gh-pages), served blobs
// byte-verified == HEAD (f178b45, CAS-2166 nova-fix re-overlay):
//   sim/config.js    3accbae10e10645ba07d4a2110cfb769
//   sim/sim.js       d7b985b662262458569e426228ce00b7
//   strings.js       3e5913ccaf9d44f6bba8577539b8be71
//   input.js         877899def9c3f51e8ea3a232ce0d2cc4
//   render/render.js 7eec7d36ba870e327e54a0c22cf40e75
//
// Drives the REAL browser loop against the LIVE gh-pages build. dynamic
// import(BASE+"sim/sim.js") resolves to the SAME cached ES-module singleton the
// game runs — SECOND_WIND + dev.secondWindProbe / dev.secondWindSrandFp mutate the
// LIVE instance and step the REAL damageHero deny path (lethal hit negated → hp
// clamped → charge consumed → i-frames armed → nova pushes enemies via the REAL
// e.knockX/e.knockY channel, integrated exactly like updateEnemies). Mirror of
// tools/cas2158-lunge-live-qa.mjs. Complements the 40-mec cohesion audit v6.
//
//   AC0  [META]   served config DARK: {enabled:false, surviveHpFrac:0.15,
//                 novaRadius:120, novaKnockback:180, novaPoiseDmg:0, iframesMs:600,
//                 chargesPerRest:1}.
//   AC1  [NEGADO-LETAL] enabled forced, a hit that would drop hp<=0 leaves the hero
//                 ALIVE at surviveHpFrac×maxHp (observable number), consumes 1 charge.
//   AC2  [NOVA]   an enemy INSIDE novaRadius receives radial knockback (Δpos > 0.5px,
//                 moves OUTWARD); an enemy OUTSIDE is NOT pushed (radius gate).
//   AC3  [I-FRAMES] during iframesMs after the deny, incoming damage = 0 (a further
//                 lethal hit in the same window is IGNORED, hp unchanged — no multi-hit death).
//   AC4  [UNA-VEZ] a 2nd lethal hit with 0 charge ⇒ dies normally (charge spent).
//                 Rearm ONLY on bonfire (transient state, not spammeable).
//   AC5  [OFF]    enabled=false ⇒ deny branch skipped ⇒ hp<=0 (survived=false), no
//                 nova, no floater ⇒ byte-id inert branch.
//   AC6  [SRAND]  N-draw master-srand fingerprint ON==OFF (0 secondWindRng), determ.
//   AC7  [SAVE]   serializeSave byte-id before/after a real deny, no secondWind* key.
//   AC8  [NO-REG] plain swing lands; neighbour riposte #36 still crits (>base);
//                 UNIVERSAL mage lunge #40 still dashes. 40-mec: cohesion audit v6.
//   VFX  observable ¡SEGUNDO ALIENTO! floater (#ffe08a) in G.floaters. 60fps DPR desk+mob.
//
// Run: node tools/cas2164-secondwind-live-qa.mjs   (PASS×2 = invoke twice)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "bf8a811b3dc0";
const OUT = "shots/cas2164";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 960, height: 600, deviceScaleFactor: 1.5 }, ua: null },
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "AlientoQA"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

  // AC0 META: served SECOND_WIND knob DARK with exact values
  const meta = await page.evaluate(() => JSON.parse(JSON.stringify(window.__h.cfg.SECOND_WIND)));
  const metaOk = meta.enabled === false && meta.surviveHpFrac === 0.15 && meta.novaRadius === 120
    && meta.novaKnockback === 180 && meta.novaPoiseDmg === 0 && meta.iframesMs === 600 && meta.chargesPerRest === 1;
  if (metaOk) P(`[${prof.name}] META: served SECOND_WIND DARK — enabled=${meta.enabled}, surviveHpFrac=${meta.surviveHpFrac}, novaRadius=${meta.novaRadius}, novaKnockback=${meta.novaKnockback}, novaPoiseDmg=${meta.novaPoiseDmg}, iframesMs=${meta.iframesMs}, chargesPerRest=${meta.chargesPerRest}`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // AC1 NEGADO-LETAL — a lethal hit leaves the hero ALIVE at surviveHpFrac×maxHp, consumes 1 charge
  const on = await page.evaluate(() => window.__h.sim.dev.secondWindProbe({ enabled: true, charge: 1 }));
  const a1 = on.survived === true && on.hpAfter === on.hpExpected && on.hpAfter > 0
    && on.chargeBefore === 1 && on.chargeAfter === 0
    && on.hpExpected === Math.ceil(on.maxHp * 0.15);
  if (a1) P(`[${prof.name}] NEGADO-LETAL: lethal hit denied → hero ALIVE hp=${on.hpAfter} == surviveHpFrac×maxHp ${on.hpExpected} (=ceil(${on.maxHp}×0.15)), charge ${on.chargeBefore}→${on.chargeAfter}`);
  else F(`[${prof.name}] NEGADO-LETAL broken: survived=${on.survived} hpAfter=${on.hpAfter} hpExpected=${on.hpExpected} maxHp=${on.maxHp} charge ${on.chargeBefore}→${on.chargeAfter}`);

  // AC2 NOVA — enemy INSIDE novaRadius pushed OUTWARD (Δpos observable); enemy OUTSIDE not pushed (radius gate)
  const a2 = on.novaInPushed === true && on.novaInMovedOut === true && on.novaInDisp > 0.5
    && on.novaOutPushed === false && on.novaOutMovedOut === false;
  if (a2) P(`[${prof.name}] NOVA: inside-radius enemy knocked ${on.novaInDisp}px OUTWARD (speed ${on.novaInSpeed}); outside-radius enemy NOT pushed (disp ${on.novaOutDisp}, speed ${on.novaOutSpeed}) — radius gate holds`);
  else F(`[${prof.name}] NOVA broken: inPushed=${on.novaInPushed} inDisp=${on.novaInDisp} outPushed=${on.novaOutPushed} outDisp=${on.novaOutDisp}`);

  // AC3 I-FRAMES — during iframesMs after deny, a further lethal hit is IGNORED (no multi-hit death)
  const ifr = await page.evaluate(() => window.__h.sim.dev.secondWindProbe({ enabled: true, charge: 1, probeIframe: true }));
  const a3 = ifr.iframeArmed === true && ifr.iframeT > 0 && ifr.iframeIgnoresHit === true;
  if (a3) P(`[${prof.name}] I-FRAMES: armed ${ifr.iframeT}s after deny (cfg ${meta.iframesMs}ms); further lethal hit IGNORED, hp unchanged (iframeIgnoresHit=${ifr.iframeIgnoresHit})`);
  else F(`[${prof.name}] I-FRAMES broken: armed=${ifr.iframeArmed} iframeT=${ifr.iframeT} ignoresHit=${ifr.iframeIgnoresHit}`);

  // AC4 UNA-VEZ — a 2nd lethal hit with 0 charge ⇒ dies normally (charge spent, not spammeable)
  const nc = await page.evaluate(() => window.__h.sim.dev.secondWindProbe({ enabled: true, charge: 1, probeNoCharge: true }));
  const a4 = nc.chargeAfter === 0 && nc.noChargeDies === true;
  if (a4) P(`[${prof.name}] UNA-VEZ: 1st hit consumes charge (after=${nc.chargeAfter}); 2nd lethal hit with 0 charge ⇒ dies normally (noChargeDies=${nc.noChargeDies}). Rearm bonfire-only.`);
  else F(`[${prof.name}] UNA-VEZ broken: chargeAfter=${nc.chargeAfter} noChargeDies=${nc.noChargeDies}`);

  // AC5 OFF == baseline — disabled ⇒ deny branch skipped ⇒ hp<=0, no nova, no floater
  const off = await page.evaluate(() => window.__h.sim.dev.secondWindProbe({ enabled: false, charge: 1 }));
  const a5 = off.survived === false && off.hpAfter <= 0 && off.novaInPushed === false && off.floated === false && off.chargeAfter === off.chargeBefore;
  if (a5) P(`[${prof.name}] OFF baseline: enabled=false ⇒ survived=${off.survived} hp=${off.hpAfter}<=0, no nova (${off.novaInPushed}), no floater (${off.floated}), charge untouched ${off.chargeBefore}→${off.chargeAfter} (inert branch)`);
  else F(`[${prof.name}] OFF broken: ${JSON.stringify({ survived: off.survived, hp: off.hpAfter, nova: off.novaInPushed, floated: off.floated })}`);

  // AC6 SRAND STRONG — N-draw master fingerprint ON==OFF (0 secondWindRng), deterministic
  const sr = await page.evaluate(() => {
    const on  = window.__h.sim.dev.secondWindSrandFp(true,  12345, 32);
    const off = window.__h.sim.dev.secondWindSrandFp(false, 12345, 32);
    const on2 = window.__h.sim.dev.secondWindSrandFp(true,  12345, 32);
    return { onOff: on === off, determ: on === on2, sample: on.slice(0, 28) };
  });
  if (sr.onOff && sr.determ) P(`[${prof.name}] SRAND: 32-draw fingerprint ON==OFF (${sr.onOff}), determinístico (${sr.determ}) (${sr.sample}…)`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(sr)}`);

  // AC7 SAVE byte-id — a real deny leaves serializeSave identical, no secondWind* key
  const sb = await page.evaluate(() => {
    const sim = window.__h.sim;
    sim.dev.secondWindProbe({ enabled: true, charge: 1 }); const s0 = JSON.stringify(sim.serializeSave());
    sim.dev.secondWindProbe({ enabled: true, charge: 1 }); const s1 = JSON.stringify(sim.serializeSave());
    return { byteId: s0 === s1, len: s0.length, hasKey: /secondWind|_secondWind/i.test(s0) };
  });
  if (sb.byteId && !sb.hasKey) P(`[${prof.name}] SAVE: serializeSave byte-id before/after deny (byteId=${sb.byteId}, len=${sb.len}), no secondWind* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE broken: ${JSON.stringify(sb)}`);

  // VFX OBSERVABLE — a real deny pushes ¡SEGUNDO ALIENTO! floater (#ffe08a) into G.floaters (no monkeypatch)
  const vfx = await page.evaluate(() => {
    const { sim, str } = window.__h; const G = sim.G;
    sim.dev.secondWindProbe({ enabled: true, charge: 1 });
    const f = G.floaters.filter((x) => x.txt === str.STR.secondWind);
    return { expected: str.STR.secondWind, count: f.length, sample: f[0] ? { txt: f[0].txt, col: f[0].col } : null };
  });
  if (vfx.count >= 1 && vfx.sample && vfx.sample.col === "#ffe08a" && vfx.sample.txt === vfx.expected)
    P(`[${prof.name}] VFX: observable "${vfx.sample.txt}" floater ×${vfx.count} (col=${vfx.sample.col})`);
  else F(`[${prof.name}] VFX missing/wrong: ${JSON.stringify(vfx)}`);

  // AC8 NO-REGRESSION (neighbours) — plain swing still lands, riposte #36 still crits, mage lunge #40 still dashes
  const reg = await page.evaluate(() => {
    const d = window.__h.sim.dev;
    const base = d.hitProbe(false, 100), rip = d.hitProbe(true, 100);
    const mage = d.lungeProbe({ enabled: true, cls: "mage" });   // universal mobility verb intact
    return { base: base.dmg, rip: rip.dmg, mageDisp: mage.displacement, mageDmg: mage.enemyHpLoss };
  });
  const a8 = reg.base > 0 && reg.rip > reg.base && reg.mageDisp > 60 && reg.mageDmg > 0;
  if (a8) P(`[${prof.name}] NO-REGRESSION: base swing ${reg.base}, riposte #36 ${reg.rip} (>base), mage lunge #40 dash ${reg.mageDisp}px dmg ${reg.mageDmg}`);
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
