// ---------------------------------------------------------------------------
// CAS-2131 (QA OBSERVABLE, umbrella CAS-2127 / mec #36 RIPOSTE / EJECUCIÓN CRÍTICA POR ATURDIMIENTO).
// Live DARK build cdf6e8bdcbea (gh-pages), served sim/config.js md5 0ff80511 / sim/sim.js md5 d93c7e61 /
// strings.js md5 f325cb28 == HEAD (byte-verified out-of-band via curl?cb + git show).
//
// Drives the REAL browser loop against the LIVE gh-pages build. game.js imports "./sim/sim.js", so a
// dynamic import(BASE+"sim/sim.js") in-page resolves to the SAME cached ES-module singleton the game is
// running — G, dev.riposte*, RIPOSTE all mutate the LIVE instance. Mirror of tools/cas2121-rally-live-qa.mjs
// (OBSERVABLE DARK QA pattern). Complements the DOM-free node proof (tools/cas2127-riposte-live-qa.mjs).
//
// The feature ships DARK (RIPOSTE.enabled:false live). This harness proves the DARK invariants AND that the
// machine is genuinely OBSERVABLE when the Gate CEO flips it, by driving the REAL seams on the LIVE served
// sim (hitEnemy poise-break → arm e._ripArm; hitEnemy sink → execute ×dmgMul + cap + consume; applyHeroMelee):
//
//   AC0  [BOOT]     boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC1  [META]     served config knob DARK: {enabled:false, dmgMul:2.2, poiseMul:1.5, essenceBonus:2, ripCapFracMaxHp:0.25, requiresMelee:true}.
//   AC2  [HEADLINE] broken+armed ⇒ 1st melee = Riposte (ratio dRip/dNormal == dmgMul), consumes; 2nd melee same window = NORMAL.
//   AC3  [SEAM-A]   poise-break by NON-melee arms _ripArm + leaves it armed (requiresMelee); next MELEE executes+consumes.
//   AC4  [CAP]      vs boss/elite Riposte ≤ ripCapFracMaxHp*maxHp (cap bites, no one-shot); trash uncapped > cap.
//   AC5  [ESSENCE]  one execution grants essenceBonus to meta; a NORMAL hit grants 0; OFF grants 0.
//   AC6  [VFX]      an OBSERVABLE ¡CRÍTICO! floater (#ff9a3a execution tint) fires on the execution swing (G.floaters).
//   AC7  [OFF]      enabled=false ⇒ break NEVER arms + forcing e._ripArm=true is INERT (dmg HEAD byte-id).
//   AC8  [SAVE]     e._ripArm transient enemy flag ⇒ save.v1 byte-id ON/OFF, no ripArm* key.
//   AC9  [SRAND]    fingerprint byte-identical ON vs OFF (0 draws, no riposteRng), deterministic.
//   AC10 [60FPS]    ~60fps sustained while playing; mobile playable; DPR-capped.
//
// Run: node tools/cas2131-riposte-live-qa.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const EXPECT_BUILD = "272d22870026"; // CAS-2134: post CAS-2132 Gate flip RIPOSTE.enabled→true. Live config md5 6bfa3bb9c4d49a41371c935cb57f4da7 (enabled:true).
const OUT = "shots/cas2131";
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
  await page.evaluate(() => { document.getElementById("nameInput").value = "RIPOSTE"; document.getElementById("nameInput").blur(); window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

  // AC0 BOOT: no game-JS errors reaching play
  if (errors.length === 0) P(`[${prof.name}] BOOT: reached play scene with 0 game-JS errors`);
  else F(`[${prof.name}] BOOT errors: ${JSON.stringify(errors.slice(0, 4))}`);
  const badHttp = http404.filter((u) => !/favicon/i.test(u));
  if (badHttp.length === 0) P(`[${prof.name}] BOOT: 0 non-cosmetic 404s`);
  else F(`[${prof.name}] non-cosmetic 404s: ${JSON.stringify(badHttp.slice(0, 4))}`);

  // Bind the SERVED sim/config singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    window.__h = { sim, cfg };
  }, BASE);

  // ---- AC1 META: served config LIVE (post CAS-2132 Gate flip) with exact knob values ----
  const meta = await page.evaluate(() => {
    const m = window.__h.sim.dev.riposteMeta();
    return { m, cfgEnabled: window.__h.cfg.RIPOSTE.enabled };
  });
  const m = meta.m;
  const valsOk = m.enabled === true && m.dmgMul === 2.2 && m.poiseMul === 1.5 && m.essenceBonus === 2 && m.ripCapFracMaxHp === 0.25 && m.requiresMelee === true;
  if (valsOk && meta.cfgEnabled === true)
    P(`[${prof.name}] META: served RIPOSTE LIVE — enabled=true (CAS-2132 Gate flip), dmgMul=${m.dmgMul}, poiseMul=${m.poiseMul}, essenceBonus=${m.essenceBonus}, ripCapFracMaxHp=${m.ripCapFracMaxHp}, requiresMelee=${m.requiresMelee} (exact ticket AC1)`);
  else F(`[${prof.name}] META unexpected: ${JSON.stringify(meta)}`);

  // ---- AC2 HEADLINE: broken+armed 1st melee ×dmgMul, consume, 2nd normal ----
  const hp = await page.evaluate(() => window.__h.sim.dev.riposteHeadlineProbe());
  if (hp.ok && hp.ratioOk && hp.consumed && hp.secondNormal)
    P(`[${prof.name}] HEADLINE: dNormal=${hp.dNormal} vs dRip=${hp.dRip} ⇒ ratio=${hp.ratio}==dmgMul(${hp.expect}); consumed=${hp.consumed}; 2nd=${hp.dSecond}==normal ⇒ ONE crit per break`);
  else F(`[${prof.name}] HEADLINE broken: ${JSON.stringify(hp)}`);

  // ---- AC3 SEAM-A: non-melee break arms + leaves armed; next melee executes+consumes ----
  const ap = await page.evaluate(() => window.__h.sim.dev.riposteArmProbe());
  if (ap.ok) P(`[${prof.name}] SEAM-A: non-melee break arms _ripArm=${ap.armedByBreak}+broken=${ap.staggeredNow}, requiresMelee ⇒ not executed yet=${ap.notExecutedYet}; next MELEE consumes=${ap.consumedByMelee}`);
  else F(`[${prof.name}] SEAM-A broken: ${JSON.stringify(ap)}`);

  // ---- AC4 CAP: boss/elite capped at ripCapFracMaxHp*maxHp; trash uncapped ----
  const cp = await page.evaluate(() => window.__h.sim.dev.riposteCapProbe());
  if (cp.ok) P(`[${prof.name}] CAP: cap=${cp.cap}; boss Riposte=${cp.dBoss}≤cap (bossCapped=${cp.bossCapped}); trash=${cp.dTrash}>cap (uncapped=${cp.trashUncapped}) ⇒ anti one-shot`);
  else F(`[${prof.name}] CAP broken: ${JSON.stringify(cp)}`);

  // ---- AC5 ESSENCE: execution +bonus; normal +0; OFF +0 ----
  const ep = await page.evaluate(() => window.__h.sim.dev.riposteEssenceProbe());
  if (ep.ok) P(`[${prof.name}] ESSENCE: execution +${ep.dExec}==bonus(${ep.bonus}); normal +${ep.dNorm}; OFF +${ep.dOff}`);
  else F(`[${prof.name}] ESSENCE broken: ${JSON.stringify(ep)}`);

  // ---- AC6 VFX OBSERVABLE: the execution swing pushes a ¡CRÍTICO! #ff9a3a floater to G.floaters ----
  const vfx = await page.evaluate(() => {
    const { sim } = window.__h; const G = sim.G;
    G.floaters.length = 0;                       // clear so we only see the banner from THIS execution
    sim.dev.riposteHeadlineProbe();              // fires a REAL execution swing (arms→executes)
    const exec = G.floaters.filter((f) => f.txt === "¡CRÍTICO!" && String(f.col).toLowerCase() === "#ff9a3a");
    return { total: G.floaters.length, execCount: exec.length, sample: exec[0] ? { txt: exec[0].txt, col: exec[0].col, crit: !!exec[0].crit } : null };
  });
  if (vfx.execCount >= 1 && vfx.sample && vfx.sample.crit)
    P(`[${prof.name}] VFX: observable execution banner ×${vfx.execCount} — txt="${vfx.sample.txt}" col=${vfx.sample.col} crit=${vfx.sample.crit} (of ${vfx.total} floaters)`);
  else F(`[${prof.name}] VFX banner missing: ${JSON.stringify(vfx)}`);

  // ---- AC7 OFF: break never arms + forcing e._ripArm inert (dmg HEAD byte-id) ----
  const off = await page.evaluate(() => window.__h.sim.dev.riposteOffProbe());
  if (off.ok) P(`[${prof.name}] OFF: break no-arm=${off.noArm}; forced _ripArm INERT dForced=${off.dForced}==dRef=${off.dRef} ⇒ HEAD byte-id`);
  else F(`[${prof.name}] OFF broken: ${JSON.stringify(off)}`);

  // ---- AC8 SAVE: e._ripArm transient ⇒ save byte-id ON/OFF, no ripArm* key ----
  const sb = await page.evaluate(() => window.__h.sim.dev.riposteSaveByteId());
  if (sb.ok) P(`[${prof.name}] SAVE: serializeSave byte-id ON/OFF (byteId=${sb.byteId}), no ripArm* key (hasKey=${sb.hasKey})`);
  else F(`[${prof.name}] SAVE broken: ${JSON.stringify(sb)}`);

  // ---- AC9 SRAND: fingerprint byte-identical ON vs OFF, deterministic ----
  const SEED = 0x2127c0de, N = 24;
  const sr = await page.evaluate((seed, n) => {
    const on = window.__h.sim.dev.riposteSrandProbe(true, seed, n);
    const off = window.__h.sim.dev.riposteSrandProbe(false, seed, n);
    const on2 = window.__h.sim.dev.riposteSrandProbe(true, seed, n);
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return { onOff: eq(on.fingerprint, off.fingerprint), determ: eq(on.fingerprint, on2.fingerprint), fired: on.riposteFired, len: on.fingerprint.length };
  }, SEED, N);
  if (sr.onOff && sr.determ && sr.fired)
    P(`[${prof.name}] SRAND: ${sr.len}-draw fingerprint ON==OFF (${sr.onOff}), deterministic (${sr.determ}); ON path really fired execution (${sr.fired})`);
  else F(`[${prof.name}] SRAND broken: ${JSON.stringify(sr)}`);

  // ---- AC10 60FPS: sustained real rAF loop while playing ----
  const fps = await page.evaluate(() => new Promise((res) => {
    let frames = 0; const t0 = performance.now();
    function tick() { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else res(frames / ((performance.now() - t0) / 1000)); }
    requestAnimationFrame(tick);
  }));
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  if (fps >= 55) P(`[${prof.name}] 60FPS: ${fps.toFixed(1)}fps sustained (DPR=${dpr})`);
  else F(`[${prof.name}] FPS low: ${fps.toFixed(1)}fps (DPR=${dpr})`);

  await page.close();
}

await browser.close();
if (anyFail) { console.error("\n✖ CAS-2134 riposte OBSERVABLE: FAIL"); process.exit(1); }
console.log("\n✅ CAS-2134 riposte (Ejecución Crítica por Aturdimiento, mec #36 LIVE post CAS-2132 flip) OBSERVABLE: ALL PASS (desktop+mobile)");
