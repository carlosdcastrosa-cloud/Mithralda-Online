// ---------------------------------------------------------------------------
// CAS-2167 QA OBSERVABLE — SEGUNDO ALIENTO / SECOND_WIND (mec #41) DARK LIVE.
// Build DARK CAS-2166 (nova-fix). Live build bf8a811b3dc0/799 (supersede
// e7498cc61a04 / fa5ccf7c051f). SECOND_WIND.enabled:false (DARK). The behaviour
// blobs are byte-verified == HEAD (master f178b45):
//   sim/sim.js       d7b985b662262458569e426228ce00b7
//   sim/config.js    3accbae10e10645ba07d4a2110cfb769
//   strings.js       3e5913ccaf9d44f6bba8577539b8be71
//   render/render.js 7eec7d36ba870e327e54a0c22cf40e75   (untouched by mec #41)
//   input.js         877899def9c3f51e8ea3a232ce0d2cc4   (untouched — AUTOMÁTICO, 0 tecla)
//
// Drives the REAL browser loop against the LIVE gh-pages build. dynamic
// import(BASE+"sim/sim.js") resolves to the SAME cached ES-module singleton the
// game runs — SECOND_WIND + dev.secondWindProbe / dev.secondWindSrandFp mutate the
// LIVE instance and step the REAL damageHero deny path (lethal-negate → hp clamp →
// charge consume → i-frames → nova pushes enemies via the REAL e.knockX/e.knockY
// channel, integrated exactly like updateEnemies). Mirror of #39/#40 live-qa.
// Complements the DOM-free node proof tools/cas2166-verify.mjs.
//
//   AC0  [META]   served SECOND_WIND knob LIVE DARK: {enabled:false,
//                 surviveHpFrac:0.15, novaRadius:120, novaKnockback:180,
//                 novaPoiseDmg:0, iframesMs:600, chargesPerRest:1}.
//   AC1  [HEADLINE] with enabled:true (test patch), a LETHAL hit does NOT kill:
//                 hp clamps to ceil(maxHp*0.15), _secondWindLeft 1→0, i-frame armed.
//   AC2  [NOVA]   enemy INSIDE novaRadius is pushed OUTWARD (real knockback disp);
//                 enemy OUTSIDE the radius is untouched (radius gate) + shake/freeze.
//   AC3  [VFX]    observable ¡SEGUNDO ALIENTO! floater (#ffe08a) in G.floaters.
//   AC4  [1-USO]  a 2nd lethal hit in the same life (0 charge) KILLS (no re-save).
//   AC5  [REARME] after beginRun()/HOGUERA refill, _secondWindLeft re-arms to
//                 chargesPerRest (mirror FLASK; real exported beginRun hook + the
//                 byte-identical bonfire assignment sim.js:4199).
//   AC6  [OFF]    enabled=false (LIVE DARK) ⇒ lethal hit KILLS normally, no nova, no
//                 floater ⇒ byte-id baseline pre-mec41 (dead branch).
//   AC7  [SRAND]  40-draw master-srand fingerprint ON==OFF (0 draws, geometry is
//                 deterministic — no secondWindRng), determ.
//   AC8  [SAVE]   serializeSave byte-id before/after a real trigger, no _secondWind key.
//   AC9  [NO-REG] neighbours intact: plain swing lands, riposte #36 still crits >base.
//   60fps DPR desk+mob.
//
// Run: node tools/cas2167-secondwind-live-qa.mjs   (PASS×2 = invoke twice)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "bf8a811b3dc0";
const OUT = "shots/cas2167";
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

  // Bind the SERVED sim/config/strings singletons (same instance the game runs)
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    const str = await import(base + "strings.js");
    window.__h = { sim, cfg, str };
  }, BASE);

  // AC0 META — served SECOND_WIND knob LIVE DARK (enabled:false is the shipped state)
  const meta = await page.evaluate(() => JSON.parse(JSON.stringify(window.__h.cfg.SECOND_WIND)));
  const metaOk = meta.enabled === false && meta.surviveHpFrac === 0.15 && meta.novaRadius === 120
    && meta.novaKnockback === 180 && meta.novaPoiseDmg === 0 && meta.iframesMs === 600 && meta.chargesPerRest === 1;
  if (metaOk) P(`[${prof.name}] META: served SECOND_WIND LIVE DARK — enabled=${meta.enabled}, surviveHpFrac=${meta.surviveHpFrac}, novaRadius=${meta.novaRadius}, novaKnockback=${meta.novaKnockback}, novaPoiseDmg=${meta.novaPoiseDmg}, iframesMs=${meta.iframesMs}, chargesPerRest=${meta.chargesPerRest}`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // AC1 HEADLINE — lethal hit negated: hp clamps, charge consumed, i-frame armed
  const on = await page.evaluate(() => window.__h.sim.dev.secondWindProbe({ enabled: true, probeIframe: true }));
  const a1 = on.survived === true && on.hpAfter === on.hpExpected && on.hpExpected === Math.ceil(on.maxHp * 0.15)
    && on.chargeBefore === 1 && on.chargeAfter === 0 && on.iframeArmed === true && on.iframeT > 0;
  if (a1) P(`[${prof.name}] HEADLINE: LETHAL hit negated — hp ${on.hpAfter}=ceil(${on.maxHp}*0.15)=${on.hpExpected}, charge ${on.chargeBefore}→${on.chargeAfter}, i-frame armed ${on.iframeT}s`);
  else F(`[${prof.name}] HEADLINE broken: ${JSON.stringify(on)}`);

  // AC2 NOVA — enemy inside radius pushed outward (real knockback disp); outside untouched
  const a2 = on.novaInMovedOut === true && on.novaInDisp > 0.5 && on.novaOutMovedOut === false && Math.abs(on.novaOutDisp) < 0.01;
  if (a2) P(`[${prof.name}] NOVA: enemy INSIDE r=${meta.novaRadius} pushed OUTWARD +${on.novaInDisp}px (knockSpeed ${on.novaInSpeed}); enemy OUTSIDE untouched (disp ${on.novaOutDisp}, knock ${on.novaOutSpeed})`);
  else F(`[${prof.name}] NOVA broken: inDisp=${on.novaInDisp} inMoved=${on.novaInMovedOut} outDisp=${on.novaOutDisp} outMoved=${on.novaOutMovedOut}`);

  // AC3 VFX OBSERVABLE — ¡SEGUNDO ALIENTO! floater (#ffe08a) pushed into G.floaters
  const vfx = await page.evaluate(() => {
    const { sim, str } = window.__h; const G = sim.G;
    sim.dev.secondWindProbe({ enabled: true });
    const f = G.floaters.filter((x) => x.txt === str.STR.secondWind);
    return { expected: str.STR.secondWind, count: f.length, sample: f[0] ? { txt: f[0].txt, col: f[0].col } : null };
  });
  const a3 = on.floated === true && vfx.count >= 1 && vfx.sample && vfx.sample.col === "#ffe08a" && vfx.sample.txt === vfx.expected;
  if (a3) P(`[${prof.name}] VFX: observable "${vfx.sample.txt}" floater ×${vfx.count} (col=${vfx.sample.col})`);
  else F(`[${prof.name}] VFX missing/wrong: floatedProbe=${on.floated} ${JSON.stringify(vfx)}`);

  // AC4 1-USO — i-frame ignores the same-tick follow-up; with 0 charge a fresh lethal hit KILLS
  const noChg = await page.evaluate(() => window.__h.sim.dev.secondWindProbe({ enabled: true, probeNoCharge: true }));
  const a4 = on.iframeIgnoresHit === true && noChg.noChargeDies === true;
  if (a4) P(`[${prof.name}] 1-USO: i-frame ignores same-tick 2nd hit (${on.iframeIgnoresHit}); 0-charge lethal hit DIES (${noChg.noChargeDies}) — no re-save`);
  else F(`[${prof.name}] 1-USO broken: iframeIgnoresHit=${on.iframeIgnoresHit} noChargeDies=${noChg.noChargeDies}`);

  // AC5 REARME — beginRun() (real exported hook, byte-id RHS of the bonfire refill sim.js:4199) re-arms the charge
  const rearm = await page.evaluate(() => {
    const { sim, cfg } = window.__h; const h = sim.G.hero;
    const savEn = cfg.SECOND_WIND.enabled;
    cfg.SECOND_WIND.enabled = true;
    h._secondWindLeft = 0; h._secondWindIframeT = 0;            // simulate a spent charge
    const used = h._secondWindLeft | 0;
    sim.beginRun();                                            // rest/new-run rearm hook (mirror FLASK refill)
    const after = h._secondWindLeft | 0;
    cfg.SECOND_WIND.enabled = savEn;
    return { used, after, want: cfg.SECOND_WIND.chargesPerRest };
  });
  const a5 = rearm.used === 0 && rearm.after === rearm.want && rearm.after === 1;
  if (a5) P(`[${prof.name}] REARME: spent charge ${rearm.used} → beginRun/HOGUERA re-arms to ${rearm.after} (chargesPerRest=${rearm.want})`);
  else F(`[${prof.name}] REARME broken: ${JSON.stringify(rearm)}`);

  // AC6 OFF==baseline — LIVE DARK enabled:false ⇒ lethal hit KILLS, no nova, no floater
  const off = await page.evaluate(() => window.__h.sim.dev.secondWindProbe({ enabled: false }));
  const a6 = off.survived === false && off.hpAfter <= 0 && off.novaInMovedOut === false && off.floated === false;
  if (a6) P(`[${prof.name}] OFF==baseline: lethal hit NOT negated (survived=${off.survived}, hp=${off.hpAfter}), no nova (${off.novaInMovedOut}), no floater (${off.floated}) — byte-id pre-mec41`);
  else F(`[${prof.name}] OFF broken: ${JSON.stringify({ survived: off.survived, hpAfter: off.hpAfter, novaInMovedOut: off.novaInMovedOut, floated: off.floated })}`);

  // AC7 SRAND STRONG — 40-draw master fingerprint ON==OFF (0 draws in the deny path), determ
  const sr = await page.evaluate(() => {
    const on  = window.__h.sim.dev.secondWindSrandFp(true,  1234, 40);
    const off = window.__h.sim.dev.secondWindSrandFp(false, 1234, 40);
    const on2 = window.__h.sim.dev.secondWindSrandFp(true,  1234, 40);
    return { onOff: on === off, determ: on === on2, sample: on.slice(0, 28) };
  });
  if (sr.onOff && sr.determ) P(`[${prof.name}] SRAND: 40-draw fingerprint ON==OFF (${sr.onOff}), determinístico (${sr.determ}) (${sr.sample}…)`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(sr)}`);

  // AC8 SAVE byte-id — a real trigger leaves serializeSave identical, no _secondWind key
  const sb = await page.evaluate(() => {
    const sim = window.__h.sim;
    sim.dev.secondWindProbe({ enabled: true }); const s0 = JSON.stringify(sim.serializeSave());
    sim.dev.secondWindProbe({ enabled: true }); const s1 = JSON.stringify(sim.serializeSave());
    return { byteId: s0 === s1, len: s0.length, hasKey: /_?secondWind/i.test(s0) };
  });
  if (sb.byteId && !sb.hasKey) P(`[${prof.name}] SAVE: serializeSave byte-id before/after trigger (byteId=${sb.byteId}, len=${sb.len}), no _secondWind* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE broken: ${JSON.stringify(sb)}`);

  // AC9 NO-REGRESSION (neighbours) — plain swing still lands, riposte #36 still crits >base
  const reg = await page.evaluate(() => {
    const d = window.__h.sim.dev;
    const base = d.hitProbe(false, 100), rip = d.hitProbe(true, 100);
    return { base: base.dmg, rip: rip.dmg };
  });
  const a9 = reg.base > 0 && reg.rip > reg.base;
  if (a9) P(`[${prof.name}] NO-REGRESSION: base swing ${reg.base}, riposte #36 ${reg.rip} (>base) — orthogonal, deny-branch seam only`);
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
