// ---------------------------------------------------------------------------
// CAS-2148 QA OBSERVABLE — Empujón / Patada Rompe-Guardia (mec #38) DARK.
// Live DARK build 9f219a9bb567 (gh-pages), served blobs byte-verified == HEAD:
//   sim/config.js     2dbbc104f6f81459f1931671ec2dc737
//   sim/sim.js        cf86cde7cc272256986565cf4b416bd5
//   input.js          52865407457ac394236847555f89e615
//   render/render.js  e0f2480882aeb1976d6b112726bdf4bc
//   strings.js        9656829dd528d808b3bcde7363828295
//
// Drives the REAL browser loop against the LIVE gh-pages build.
// dynamic import(BASE+"sim/sim.js") resolves to the SAME cached ES-module
// singleton the game runs — GUARD_BREAK + dev.guardBreak* mutate LIVE instance.
// Mirror of tools/cas2137-charged-live-qa.mjs (OBSERVABLE DARK QA pattern).
// Complements DOM-free node proof (tools/cas2146-guard-break-live-qa.mjs).
//
//   AC0  [BOOT]      boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1  [META]      served config DARK: {enabled:false, key:"Period", range:52,
//                    arcDeg:130, dmg:5, poiseMul:3.2, staminaCost:20,
//                    recoverMs:600, knock:1.7, cracksShield:true, requiresMelee:false}.
//   AC2  [POISE]     kick poise ×poiseMul==3.2 vs a normal light swing.
//   AC3  [HEADLINE]  repeated kicks BREAK the guard ⇒ _ripArm ARMED by kick
//                    (not self-consumed) ⇒ a NORMAL follow-up melee EXECUTES it
//                    (reuses Riposte #36 window).
//   AC4  [ANTI-TURTLE] kick on a SHIELDED (carapace) enemy CRACKS shield + shoves;
//                    a normal melee does NOT crack.
//   AC5  [COST]      stam spend==20 EXACT + _gbCd armed + direct dmg << swing +
//                    2nd kick in-window DENIED (not spammable).
//   AC6  [VFX]       observable ¡EMPUJÓN! floater fires in G.floaters (col #ffd27a).
//   AC7  [OFF]       enabled=false ⇒ kick no-op: no cost/poise/crack/cd (HEAD byte-id).
//   AC8  [SAVE]      _gbCd transient ⇒ save byte-id ON/OFF, no _gb*/guardBreak* key.
//   AC9  [SRAND]     16-draw fingerprint byte-identical ON vs OFF (0 draws), determ.
//   AC10 [60FPS]     ~60fps sustained; mobile playable; DPR-capped.
//
// Run: node tools/cas2148-guard-break-live-qa.mjs   (PASS×2 = invoke twice)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "9f219a9bb567";
const OUT = "shots/cas2148";
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "ShoveQA"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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
    const m = window.__h.sim.dev.guardBreakMeta();
    return { m, cfgEnabled: window.__h.cfg.GUARD_BREAK.enabled };
  });
  const m = meta.m;
  const metaOk = m.enabled === false && m.key === "Period" && m.range === 52 && m.arcDeg === 130
    && m.dmg === 5 && m.poiseMul === 3.2 && m.staminaCost === 20 && m.recoverMs === 600
    && m.knock === 1.7 && m.cracksShield === true && m.requiresMelee === false;
  if (metaOk && meta.cfgEnabled === false)
    P(`[${prof.name}] META: served GUARD_BREAK DARK — enabled=false, key=${m.key}, range=${m.range}, poiseMul=${m.poiseMul}, dmg=${m.dmg}, stam=${m.staminaCost}, recoverMs=${m.recoverMs}, knock=${m.knock}, cracksShield=${m.cracksShield}, requiresMelee=${m.requiresMelee}`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // AC2 POISE: kick poise ×poiseMul vs normal light swing
  const pp = await page.evaluate(() => window.__h.sim.dev.guardBreakPoiseProbe());
  if (pp.ok)
    P(`[${prof.name}] POISE: swing normal poise=${pp.pRef} vs patada poise=${pp.pKick} ⇒ ratio=${pp.ratio}==poiseMul(${pp.expect})`);
  else F(`[${prof.name}] POISE broken: ${JSON.stringify(pp)}`);

  // AC3 HEADLINE: kicks break guard ⇒ _ripArm ARMED (not self-consumed) ⇒ follow-up executes
  const bp = await page.evaluate(() => window.__h.sim.dev.guardBreakBreakProbe());
  if (bp.ok)
    P(`[${prof.name}] HEADLINE: ${bp.kicks} patadas ROMPEN la guardia (staggerT=${bp.staggerT}) ⇒ _ripArm ARMADO por patada=${bp.armedByKick} (NO auto-consumido); follow-up melee NORMAL EJECUTA=${bp.followupExecuted}`);
  else F(`[${prof.name}] HEADLINE broken: ${JSON.stringify(bp)}`);

  // AC4 ANTI-TURTLE: kick on shielded cracks + shoves; normal melee does NOT crack
  const sp = await page.evaluate(() => window.__h.sim.dev.guardBreakShieldProbe());
  if (sp.ok)
    P(`[${prof.name}] ANTI-TURTLE: melee normal sobre escudado NO casca=${sp.normalNoCrack}; patada CASCA shieldBroken=${sp.cracked} + empuja=${sp.shoved}`);
  else F(`[${prof.name}] ANTI-TURTLE broken: ${JSON.stringify(sp)}`);

  // AC5 COST + RECOVER + low dmg + deny-in-window
  const cp = await page.evaluate(() => window.__h.sim.dev.guardBreakCostProbe());
  if (cp.ok)
    P(`[${prof.name}] COST: estamina gastada=${cp.stSpent}==${cp.expectCost} (costOk=${cp.costOk}), _gbCd armado=${cp.cdArmed}, daño directo=${cp.dmgDealt}<<swing=${cp.dRef} (dmgLow=${cp.dmgLow}), 2ª patada in-window DENEGADA=${cp.denyInCd}`);
  else F(`[${prof.name}] COST broken: ${JSON.stringify(cp)}`);

  // AC6 VFX OBSERVABLE: ¡EMPUJÓN! floater fires in G.floaters (real kick firing)
  const vfx = await page.evaluate(() => {
    const { sim } = window.__h; const G = sim.G;
    G.floaters.length = 0;
    sim.dev.guardBreakBreakProbe();  // fires real kicks → each pushes STR.shove floater
    const shove = G.floaters.filter((f) => f.txt === "¡EMPUJÓN!");
    return { total: G.floaters.length, shoveCount: shove.length, sample: shove[0] ? { txt: shove[0].txt, col: shove[0].col } : null };
  });
  if (vfx.shoveCount >= 1 && vfx.sample && vfx.sample.col === "#ffd27a")
    P(`[${prof.name}] VFX: observable ¡EMPUJÓN! floater ×${vfx.shoveCount} of ${vfx.total} (col=${vfx.sample.col})`);
  else F(`[${prof.name}] VFX ¡EMPUJÓN! missing/wrong: ${JSON.stringify(vfx)}`);

  // AC7 OFF: enabled=false ⇒ kick no-op (byte-id HEAD)
  const off = await page.evaluate(() => window.__h.sim.dev.guardBreakOffProbe());
  if (off.ok)
    P(`[${prof.name}] OFF: enabled=false ⇒ INERTE noCost=${off.noCost} noPoise=${off.noPoise} noCrack=${off.noCrack} noCd=${off.noCd} ⇒ HEAD byte-id`);
  else F(`[${prof.name}] OFF broken: ${JSON.stringify(off)}`);

  // AC8 SAVE: _gbCd transient ⇒ save byte-id ON/OFF, no _gb*/guardBreak* key
  const sb = await page.evaluate(() => window.__h.sim.dev.guardBreakSaveByteId());
  if (sb.ok)
    P(`[${prof.name}] SAVE: serializeSave byte-id ON/OFF (byteId=${sb.byteId}, len=${sb.onLen}), no _gb*/guardBreak* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE broken: ${JSON.stringify(sb)}`);

  // AC9 SRAND: 16-draw fingerprint ON==OFF (0 draws), deterministic
  const SEED = 0x2146cafe, N = 16;
  const sr = await page.evaluate((seed, n) => {
    const on  = window.__h.sim.dev.guardBreakSrandProbe(true,  seed, n);
    const off = window.__h.sim.dev.guardBreakSrandProbe(false, seed, n);
    const on2 = window.__h.sim.dev.guardBreakSrandProbe(true,  seed, n);
    const eq  = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return { onOff: eq(on.fingerprint, off.fingerprint), determ: eq(on.fingerprint, on2.fingerprint), len: on.fingerprint.length, firedOn: on.fired };
  }, SEED, N);
  if (sr.onOff && sr.determ && sr.firedOn)
    P(`[${prof.name}] SRAND: ${sr.len}-draw fingerprint ON==OFF (${sr.onOff}), determinístico (${sr.determ}), fired ON=${sr.firedOn}`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(sr)}`);

  // AC10 60FPS
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
