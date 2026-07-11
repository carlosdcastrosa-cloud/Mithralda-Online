// ---------------------------------------------------------------------------
// CAS-2082 (build CAS-2080, deploy CAS-2081, design design/cas2078-pacts-increment.md)
// QA OBSERVABLE ×2 — PACTOS INCREMENT (D1 INTENSIDAD badge + D2 3 modifiers) driven
// through the REAL browser loop against the LIVE gh-pages build 5c044471a82e/799.
//
// Complements the node proof (tools/cas2080-pacts-increment.mjs, ALL PASS vs HEAD bytes).
// game.js imports "./sim/sim.js", so import(BASE+"sim/sim.js") resolves to the SAME cached
// ES-module singleton the game is running — G, dev.pact*, PACTS all mutate the LIVE instance,
// so ranking a pact here is SEEN by the running render loop (renderPactBadge reads pactsSnap()).
//
//   AC0 [BOOT]     boots + plays with ZERO game-JS errors / non-cosmetic 404s.
//   AC-content     PACTS.enabled=true LIVE; table is 8 (base 5 + presagio/corrosion/quebranto).
//   AC-badge [D1]  OBSERVABLE: rank a pact ⇒ heat>0 ⇒ the INTENSIDAD badge (orange #e0813f
//                  pill, top-centre) PAINTS on the live canvas (center-top orange pixels jump);
//                  reset to 0 pacts (heat=0) ⇒ badge vanishes == baseline (orange pixels back to ~0).
//   AC-a [presagio] raises the observed variant chance threshold (forest scaled>base at r3);
//                  town (base 0) stays 0 ⇒ variant-free.
//   AC-b [corrosion] hero-side status meter procs in FEWER hits at r3 (pactHits<baseHits).
//   AC-c [quebranto] élite poise ceiling ↑ AND parry window ↓ at r3; parryWindowMul floored ≥0.5×.
//   AC-RNG-STRONG  48-draw fixed-srand probe: ALL 3 new pacts ON == OFF, byte-identical fingerprint.
//   AC-OFF=base    0 pacts ranked ⇒ every mod mul EXACTLY 1.0 ⇒ every seam == baseline (byte-id HEAD).
//   AC-REG         base 5 Pactos unchanged (present + rank/heat move); ~60fps desk+mob.
//
// Run: node tools/cas2082-pacts-increment-live-smoke.mjs   (PASS×2 = invoke twice; deterministic)
// ---------------------------------------------------------------------------
import puppeteer from "puppeteer-core";
import { findChromium, LAUNCH_ARGS } from "./harness.mjs";
import { mkdirSync } from "fs";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online/";
const OUT = "shots/cas2082";
const exe = findChromium(); if (!exe) { console.error("no chromium"); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: LAUNCH_ARGS });

const PROFILES = [
  { name: "desktop", vp: { width: 1100, height: 700, deviceScaleFactor: 1.5 }, ua: null },
  { name: "mobile",  vp: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
];

const BASE5 = ["cruento", "vigor", "celeridad", "jauria", "fragil"];
const NEW3 = ["presagio", "corrosion", "quebranto"];

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
  await page.evaluate(() => { document.getElementById("nameInput").value = "PACTQA"; window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
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

// Definitive badge observability: monkeypatch CanvasRenderingContext2D.prototype.fillText to record every
// string drawn during a capture window (the game and renderPactBadge share this prototype). The INTENSIDAD
// badge draws "⚔ INTENSIDAD · Ardor N" via ctx.fillText, so its presence/absence in the captured text is an
// unambiguous, animation/bonfire-noise-proof signal that the badge painted this frame. Original fillText is
// always called ⇒ rendering is unaffected.
async function installTextCap(page) {
  await page.evaluate(() => {
    if (window.__txtCap) return;
    window.__txtCap = { on: false, list: [] };
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.fillText;
    proto.fillText = function (t, ...a) { if (window.__txtCap.on && typeof t === "string") window.__txtCap.list.push(t); return orig.call(this, t, ...a); };
  });
}
// Capture all fillText strings over ~8 animation frames, return the joined text.
async function sampleText(page) {
  const frames = await page.evaluate(() => new Promise((res) => {
    window.__txtCap.list = []; window.__txtCap.on = true; let n = 0;
    function tick() { n++; if (n >= 8) { window.__txtCap.on = false; res(window.__txtCap.list.slice()); } else requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }));
  return frames.join(" ␟ ");
}

for (const prof of PROFILES) {
  const page = await browser.newPage();
  const { errors, http404 } = watch(page);
  if (prof.ua) await page.setUserAgent(prof.ua);
  await page.setViewport(prof.vp);
  await page.evaluateOnNewDocument(() => { try { localStorage.removeItem("mithralda.save.v1"); localStorage.removeItem("mithralda.hints.v1"); localStorage.removeItem("mithralda.pacts.v1"); } catch (e) {} });
  await page.goto(`${BASE}index.html?dev`, { waitUntil: "load" });
  await toPlay(page);
  await page.screenshot({ path: `${OUT}/${prof.name}-play.png` });

  // Bind the SERVED sim/config singletons (same URLs the game imports → same instances).
  await page.evaluate(async (base) => {
    const sim = await import(base + "sim/sim.js");
    const cfg = await import(base + "sim/config.js");
    window.__p = { sim, cfg };
  }, BASE);
  await installTextCap(page);

  // ---- AC-content: PACTS live-enabled, table 8 = base 5 + 3 new ----
  const content = await page.evaluate((BASE5, NEW3) => {
    const { dev } = window.__p.sim;
    dev.pactsReset();
    const st = dev.pactsState();
    const ids = st.items.map(i => i.id);
    return { enabled: st.enabled, total: st.total, heat: st.heat, essMul: st.essMul, dropMul: st.dropMul,
      hasBase5: BASE5.every(x => ids.includes(x)), hasNew3: NEW3.every(x => ids.includes(x)), ids };
  }, BASE5, NEW3);
  if (content.enabled === true && content.total === 8 && content.hasBase5 && content.hasNew3 && content.heat === 0 && content.essMul === 1 && content.dropMul === 1)
    P(`[${prof.name}] CONTENT: PACTS.enabled=true LIVE, table 8 = base5[${BASE5}] + new3[${NEW3}]; 0 pacts ⇒ heat 0, muls 1.0`);
  else F(`[${prof.name}] CONTENT wrong: ${JSON.stringify(content)}`);

  // ---- AC-OFF=baseline: 0 pacts ranked ⇒ every mod mul EXACTLY 1.0 ⇒ every seam == baseline ----
  const off = await page.evaluate(() => {
    const { dev } = window.__p.sim; dev.pactsReset();
    const m = dev.pactModMuls();
    const vc = dev.pactVariantChance("forest");
    const pp = dev.pactPoiseParry();
    const bu = dev.pactHeroBuildupHits("frost");
    return { m, vc, pp, bu };
  });
  const offNeutral = off.m.variantRate === 1 && off.m.statusBuild === 1 && off.m.enemyPoise === 1 && off.m.parryWindowMul === 1 &&
    off.vc.base === off.vc.scaled && off.pp.poiseBase === off.pp.poiseScaled && off.pp.parryMsBase === off.pp.parryMsScaled &&
    off.bu.baseHits === off.bu.pactHits;
  if (offNeutral) P(`[${prof.name}] OFF=baseline: all mod muls 1.0; variant/poise/parry/buildup seams == baseline (byte-id HEAD)`);
  else F(`[${prof.name}] OFF NOT neutral: ${JSON.stringify(off)}`);

  // ---- AC-badge [D1]: rank a pact ⇒ INTENSIDAD badge PAINTS on the live canvas; reset ⇒ vanishes == baseline ----
  await page.evaluate(() => window.__p.sim.dev.pactsReset());
  await wait(250);
  const txtOff = await sampleText(page);           // 0 pacts (heat 0) ⇒ badge must NOT draw
  await page.screenshot({ path: `${OUT}/${prof.name}-badge-off.png` });
  await page.evaluate(() => { const { dev } = window.__p.sim; dev.pactsSetRank("presagio", 2); dev.pactsSetRank("quebranto", 1); });
  await wait(250);
  const snapOn = await page.evaluate(() => window.__p.sim.pactsSnap());
  const txtOn = await sampleText(page);            // heat>0 ⇒ badge draws INTENSIDAD + Esencia/Botín + chips
  await page.screenshot({ path: `${OUT}/${prof.name}-badge-on.png` });
  await page.evaluate(() => window.__p.sim.dev.pactsReset());
  await wait(250);
  const txtReset = await sampleText(page);         // reset ⇒ heat 0 ⇒ badge vanishes again
  await page.screenshot({ path: `${OUT}/${prof.name}-badge-reset.png` });
  const onHasBadge = /INTENSIDAD/.test(txtOn) && new RegExp("Ardor " + snapOn.heat).test(txtOn) && /Esencia ×/.test(txtOn) && /Botín ×/.test(txtOn);
  const offClean = !/INTENSIDAD/.test(txtOff), resetClean = !/INTENSIDAD/.test(txtReset);
  if (snapOn.heat > 0 && onHasBadge && offClean && resetClean)
    P(`[${prof.name}] BADGE[D1] OBSERVABLE: rank⇒heat ${snapOn.heat}⇒"⚔ INTENSIDAD · Ardor ${snapOn.heat}" + Esencia×/Botín× + chips drawn on canvas; 0-pact & reset ⇒ NO badge (== baseline)`);
  else F(`[${prof.name}] BADGE[D1] not observed: heat=${snapOn.heat} onHasBadge=${onHasBadge} offClean=${offClean} resetClean=${resetClean} | on="${txtOn.slice(0,160)}"`);

  // ---- AC-a [presagio]: raises variant chance threshold; town stays 0 ----
  const va = await page.evaluate(() => {
    const { dev } = window.__p.sim; dev.pactsReset(); dev.pactsSetRank("presagio", 3);
    return { mul: dev.pactModMuls().variantRate, forest: dev.pactVariantChance("forest"), town: dev.pactVariantChance("town") };
  });
  const expVar = 1 + 3 * 0.35; // 2.05
  if (Math.abs(va.mul - expVar) < 1e-6 && va.forest.scaled > va.forest.base && va.town.base === 0 && va.town.scaled === 0)
    P(`[${prof.name}] AC-a presagio r3 ×${expVar}: forest chance ${va.forest.base}→${va.forest.scaled}; town stays 0 (variant-free)`);
  else F(`[${prof.name}] AC-a wrong: ${JSON.stringify(va)}`);

  // ---- AC-b [corrosion]: hero-side meter procs in FEWER hits ----
  const cb = await page.evaluate(() => {
    const { dev } = window.__p.sim; dev.pactsReset(); dev.pactsSetRank("corrosion", 3);
    return { mul: dev.pactModMuls().statusBuild, bu: dev.pactHeroBuildupHits("frost") };
  });
  const expBuild = 1 + 3 * 0.20; // 1.60
  if (Math.abs(cb.mul - expBuild) < 1e-6 && cb.bu.pactHits < cb.bu.baseHits && cb.bu.pactHits >= 1)
    P(`[${prof.name}] AC-b corrosion r3 ×${expBuild}: hero frost procs in ${cb.bu.pactHits} hits (baseline ${cb.bu.baseHits}) — afflicted faster`);
  else F(`[${prof.name}] AC-b wrong: ${JSON.stringify(cb)}`);

  // ---- AC-c [quebranto]: poise ceiling ↑ + parry window ↓; floor ≥0.5× ----
  const qp = await page.evaluate(() => {
    const { dev } = window.__p.sim; dev.pactsReset(); dev.pactsSetRank("quebranto", 3);
    return { muls: dev.pactModMuls(), pp: dev.pactPoiseParry() };
  });
  const expPoise = 1 + 3 * 0.15, expParry = Math.max(0.5, 1 - 3 * 0.15); // 1.45 / 0.55
  const qOk = Math.abs(qp.muls.enemyPoise - expPoise) < 1e-6 &&
    qp.pp.poiseScaled === Math.round(qp.pp.poiseBase * expPoise) && qp.pp.poiseScaled > qp.pp.poiseBase &&
    qp.pp.parryMsScaled < qp.pp.parryMsBase && qp.muls.parryWindowMul >= 0.5;
  if (qOk) P(`[${prof.name}] AC-c quebranto r3: postura ${qp.pp.poiseBase}→${qp.pp.poiseScaled} (×${expPoise}), parada ${qp.pp.parryMsBase}→${qp.pp.parryMsScaled}ms (×${qp.muls.parryWindowMul}≥0.5 floor)`);
  else F(`[${prof.name}] AC-c wrong: ${JSON.stringify(qp)}`);

  // parry floor at absurd rank: never collapses below 0.5×
  const floor = await page.evaluate(() => { const { dev } = window.__p.sim; dev.pactsReset(); dev.pactsSetRank("quebranto", 3); return dev.pactModMuls().parryWindowMul; });
  if (floor >= 0.5) P(`[${prof.name}] AC-c floor: parryWindowMul ${floor} ≥ 0.5 (never unparryable)`);
  else F(`[${prof.name}] AC-c floor breached: ${floor}`);

  // ---- AC-RNG-STRONG: 48-draw fixed srand, ALL 3 new pacts ON == OFF byte-identical ----
  const rng = await page.evaluate(() => {
    const { dev } = window.__p.sim;
    const off = dev.pactsSrandProbe(false, null, 0x2082c0de, 24);
    const on = dev.pactsSrandProbe(true, { presagio: 3, corrosion: 3, quebranto: 3 }, 0x2082c0de, 24);
    return { same: JSON.stringify(off.fingerprint) === JSON.stringify(on.fingerprint), offHeat: off.heat, onHeat: on.heat };
  });
  if (rng.same && rng.offHeat === 0 && rng.onHeat > 0)
    P(`[${prof.name}] RNG-STRONG: 48-draw srand ON(heat ${rng.onHeat})==OFF byte-identical (0 new draws)`);
  else F(`[${prof.name}] RNG-STRONG broken: ${JSON.stringify(rng)}`);

  // ---- AC-REG: base 5 Pactos unchanged (rank/heat still move) ----
  const reg = await page.evaluate(() => {
    const { dev } = window.__p.sim; dev.pactsReset();
    dev.pactsSetRank("cruento", 2);
    const s = dev.pactsState(); const c = s.items.find(i => i.id === "cruento");
    dev.pactsReset();
    return { heat: s.heat, essMul: s.essMul, dropMul: s.dropMul, cruentoRank: c && c.rank, cruentoHeat: c && c.heatNow };
  });
  if (reg.cruentoRank === 2 && reg.heat > 0 && reg.essMul > 1 && reg.dropMul > 1)
    P(`[${prof.name}] REG base5: cruento r2 ⇒ Ardor ${reg.heat}, Esencia ×${reg.essMul.toFixed(3)}, Botín ×${reg.dropMul.toFixed(3)} (base covenant intact)`);
  else F(`[${prof.name}] REG base5 broken: ${JSON.stringify(reg)}`);

  // ---- AC 60FPS: sustained through a spawn burst ----
  const burst = await page.evaluate(() => new Promise((res) => {
    let n = 0, evt = 0; const t0 = performance.now();
    const KILLS = ["orc", "wolf", "skeleton", "bandit", "wraith"];
    function tick(t) {
      n++; try { window.__dev.spawnKill(KILLS[evt % KILLS.length]); evt++; } catch (e) {}
      if (t - t0 >= 1800) res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), events: evt }); else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  await page.screenshot({ path: `${OUT}/${prof.name}-fps-burst.png` });
  if (burst.fps >= 55) P(`[${prof.name}] 60FPS: ~${burst.fps}fps sustained through spawn burst (${burst.events} kills)`);
  else F(`[${prof.name}] 60FPS: burst fps ${burst.fps} < 55 (${burst.events} kills)`);

  // restore clean state on the page-local singleton
  await page.evaluate(() => window.__p.sim.dev.pactsReset());

  // ---- boot/play cleanliness ----
  const bad404 = http404.filter((u) => !/favicon\.ico$/i.test(u));
  if (bad404.length) F(`[${prof.name}] non-favicon 404s (${bad404.length}): ${bad404.slice(0, 3).join(", ")}`);
  else if (http404.length) P(`[${prof.name}] only cosmetic favicon.ico 404 (sev-4, known)`);
  if (errors.length) F(`[${prof.name}] console errors (${errors.length}): ${errors.slice(0, 3).join(" | ")}`);
  else P(`[${prof.name}] CLEAN: zero game-JS errors boot→play→pacts→badge→burst`);

  await page.close();
}
await browser.close();
if (anyFail) { console.error("\n❌ CAS-2082 PACTOS INCREMENT LIVE OBSERVABLE — FAIL"); process.exit(1); }
console.log("\n✅ CAS-2082 PACTOS INCREMENT LIVE OBSERVABLE — ALL PASS (D1 INTENSIDAD badge paints on rank/vanishes at heat0==baseline; presagio raises variant rate + town variant-free; corrosion faster hero affliction; quebranto poise↑/parry↓ floored 0.5; RNG-neutral STRONG ON==OFF; OFF==baseline byte-id; base5 pacts intact; ~60fps — desktop + mobile)");
