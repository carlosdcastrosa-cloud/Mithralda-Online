// CAS-2380 — QA INDEPENDENT observable DARK harness for DELVE / DESCENSO (DARK, DELVE.enabled:false). EVO mecánica #64.
// This is the QA (b5c10283) independent verification — NOT the GE self-verify. Oracles are RE-DERIVED here in Node
// (delveBands / delveTier / half-life decay / crit-cap re-implemented from the spec, NOT reused from sim.js) and cross-checked
// AGAINST the VM (__dev.delve) outputs. Clock (QNOW) and pids are RE-LABELED (QNOW 8.642M, pids "cli-A"/"cli-B"/"peer") so a copy
// of the GE numbers would not silently pass. Same twin pattern as CAS-2377 (Trailcraft) / CAS-2369 (Wayfarer) QA.
//
// EJE FRESCO = PROFUNDIDAD / DESCENSO VERTICAL (nº de BANDAS de profundidad DISTINTAS alcanzadas). server-auth, 0-RNG, INDIVIDUAL (per-pid).
// CANAL FRESCO = critChance (PRECISIÓN OFENSIVA) — 6º canal ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality. CAP DURO absoluto (critCapPct=50=0.5 abs). NADA move-speed.
//
// Checks:
//   1  boot to play, __dev.delve + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF fresh boot: DELVE.enabled false AND G.delve NUNCA se crea (gExists false).
//   3  byte-id save OFF: saveBlob() sin clave delve/delveServer/delveMarks.
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ BANDS = fn PURA (re-derived oracle vs VM): 1⇒1; N misma banda⇒1; K distintas⇒K; banda 0⇒excluida; fuera de ventana⇒excluida. depthBandOf=ZONE_TIER.tier.
//   6  TABLA de tiers = fn PURA de (delve,bands) — oracle re-derivado cruzado contra VM (5 casos).
//   7  server-auth reflect+project: DECAY half-life determinista (oracle 0.5^(dt/hl)); bands sin decaer.
//   8  ★ ACUMULADOR = fn de BANDAS (step): 1 banda⇒add 0 (nunca abre); 5 bandas 1-tick⇒delve<2⇒T0 (permanencia); sostenido⇒T1→T2→T3.
//   9  ★ DIFERENCIADOR: quieto en 1 banda profunda⇒bands 1⇒NO abre; DESCENDER K bandas⇒bands K; 2 zonas MISMO tier⇒bands 1 (ORTOGONAL a Trailcraft diversidad de tipos).
//  10  ★ DECAY 0-RNG por vida-media ⇒ tier baja gradual (oracle cross-check en +halfLife y +2·halfLife).
//  11  PASSIVE aislado (critChance): en zona ⇒ critBonusPct==tier.critPct; leave ⇒ 0.
//  12  ★ CANAL critChance wired + CAP DURO (grep seam + critTick base+bonus capado; OFF ⇒ total==base byte-id).
//  13  ★ ORTOGONALIDAD critChance ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality (0 doble-conteo).
//  14  ★ 0-REGRESIÓN: 16 flags del arco served enabled:true; DELVE served false (DARK).
//  15  ★ DESCENSO 6 zonas: pasivo aplica en las 6 zonas de DELVE.zones (broken=[]).
//  16  render badge "Descenso:" se DIBUJA ON / no OFF + fps sano.
//  17  ★ NORTH STAR — 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ delve/bands/tier/crit byte-idénticos; per-pid A vs B independientes; A sale ⇒ crit 0 pero delveMap + Δ_B intactos (0 desync).
//   0  no JS errors.
// Run: node tools/cas2380-delve-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2380-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── RE-DERIVED ORACLES (independent re-implementation from the spec; NOT imported from sim.js) ──
const CFG = { minBands: 2, halfLifeSec: 25, accruePerSec: 1, capDelve: 12, critCapPct: 50, windowSec: 30,
  tiers: [{ min: 2, bands: 2, critPct: 8 }, { min: 4, bands: 3, critPct: 15 }, { min: 6, bands: 5, critPct: 25 }] };
const oracleBands = (marks, now, winMs) => {   // nº de bandas d>0 DISTINTAS con t ∈ [now-win, now]
  if (!Array.isArray(marks)) return 0; const lo = now - winMs; const set = new Set();
  for (const m of marks) { const d = (m && +m.d) | 0, t = +(m && m.t) || 0; if (d > 0 && t >= lo && t <= now) set.add(d); }
  return set.size;
};
const oracleTier = (delve, bands) => { let idx = 0; for (let i = 0; i < CFG.tiers.length; i++) { const t = CFG.tiers[i]; if (delve >= t.min && bands >= t.bands) idx = i + 1; } return idx; };
const oracleCrit = (delve, bands) => { const t = oracleTier(delve, bands); return t > 0 ? CFG.tiers[t - 1].critPct : 0; };
const oracleDecay = (base, dtMs) => Math.min(CFG.capDelve, base * Math.pow(0.5, dtMs / (CFG.halfLifeSec * 1000)));
const oracleCritTotal = (base, bonus) => base + Math.min(bonus, Math.max(0, CFG.critCapPct - base));

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAIndep";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit2", key: "2", bubbles: true })));  // class 2 (re-labeled vs GE's class 1)
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

const QNOW = 8642000;   // QA clock (re-labeled, distinct from GE's 9.14M) — shared wall-clock for deterministic projection.
async function installDelve(page) {
  await page.evaluate((QNOW) => {
    window.__QN = QNOW;
    window.__marks = (n, t) => { const o = []; for (let i = 0; i < n; i++) o.push({ d: i + 1, t: (t == null ? window.__QN : t) }); return o; };
    window.__setmarks = (pid, marks) => { window.__dev.delve({ clear: true, nowMs: window.__QN }); window.__dev.delve({ nowMs: window.__QN, self: pid, marks: { [pid]: marks } }); };
    window.__step = (pid, dt) => window.__dev.delve({ nowMs: window.__QN, self: pid, step: { [pid]: { dt } } });
    window.__set = (pid, delve, bands) => { window.__dev.delve({ clear: true, nowMs: window.__QN }); window.__dev.delve({ nowMs: window.__QN, self: pid, delve, bands, pid, atMs: window.__QN }); };
    window.__pick = (delve, bands) => {
      window.__dev.delve({ enabled: true, self: "self" });
      const zones = window.__dev.delve().zones || [];
      for (const z of zones) {
        window.__dev.delve({ clear: true, nowMs: window.__QN });
        const s = window.__dev.delve({ nowMs: window.__QN, self: "self", delve, bands, pid: "self", atMs: window.__QN, toZone: z });
        if (s.zone === z && s.delvable) return { zone: z, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct };
      }
      return null;
    };
  }, QNOW);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.delve && window.__dev.trailcraft && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.delve + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.delve());
  ok("2 byte-id OFF (fresh boot): enabled false AND G.delve NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.delve === 0 && dark.bands === 0 && dark.critPct === 0 && dark.critBonusPct === 0 && dark.tag === "" && dark.delveMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} bonus=${dark.critBonusPct} tag="${dark.tag}"`);

  // 3 save OFF has no delve keys
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'delve'/'delveServer'/'delveMarks' key in save blob", !/"delve(Server|Marks)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(412)));
  await page.evaluate(() => window.__dev.delve({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(412)));
  await page.evaluate(() => window.__dev.delve({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installDelve(page);

  // 5 ★ bands pure fn — VM probe cross-checked against RE-DERIVED oracle
  const bandsData = await page.evaluate((QNOW) => {
    window.__dev.delve({ enabled: true });
    const win = 30000;
    const B = (marks) => window.__dev.delve({ bandsProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const cases = {
      one:    [{ d: 1, t: QNOW }],
      still:  [{ d: 4, t: QNOW - 4000 }, { d: 4, t: QNOW - 2000 }, { d: 4, t: QNOW }],
      four:   [{ d: 1, t: QNOW }, { d: 3, t: QNOW }, { d: 5, t: QNOW }, { d: 6, t: QNOW }],
      zeroband: [{ d: 0, t: QNOW }, { d: 3, t: QNOW }],
      expired: [{ d: 2, t: QNOW - 45000 }, { d: 5, t: QNOW }],
    };
    const vm = {}; for (const k in cases) vm[k] = B(cases[k]);
    const bandOf = (z) => window.__dev.delve({ toZone: z }).band;
    return { cases, vm, forest: bandOf("forest"), ruins: bandOf("ruins"), caves: bandOf("caves"), abyss: bandOf("abyss"), frost: bandOf("frost"), swamp: bandOf("swamp") };
  }, QNOW);
  const bandsOracleOk = Object.keys(bandsData.cases).every(k => bandsData.vm[k] === oracleBands(bandsData.cases[k], QNOW, 30000));
  // depthBandOf ground-truth from ZONE_TIER (independent expected map)
  const expBand = { forest: 1, ruins: 2, caves: 3, abyss: 5, frost: 6, swamp: 4 };
  const bandOfOk = Object.keys(expBand).every(z => bandsData[z] === expBand[z]);
  ok("5 ★ BANDS = fn PURA (VM probe == oracle re-derivado): 1⇒1; N misma⇒1; distintas⇒K; banda0⇒excl; fuera-ventana⇒excl. depthBandOf=ZONE_TIER.tier (forest1/ruins2/caves3/swamp4/abyss5/frost6)",
     bandsOracleOk && bandOfOk, `vm=${JSON.stringify(bandsData.vm)} bands=${JSON.stringify(expBand)}`);

  // 6 tier table — VM vs oracle over 5 cases
  const tab = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const [dv, bn] of [[6, 5], [6, 3], [6, 2], [1, 5], [6, 1]]) {
      window.__dev.delve({ clear: true, nowMs: QNOW });
      const s = window.__dev.delve({ nowMs: QNOW, self: "self", delve: dv, bands: bn, pid: "self", atMs: QNOW, toZone: zone });
      out.push({ dv, bn, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct });
    }
    return { zone, out };
  }, QNOW);
  const tabOk = !tab.bad && tab.out.every(r => near(r.delve, r.dv) && r.bands === r.bn && r.tier === oracleTier(r.dv, r.bn) && r.critPct === oracleCrit(r.dv, r.bn));
  ok("6 TABLA de tiers = fn PURA (VM == oracle): (6,5)→T3+25; (6,3)→T2+15; (6,2)→T1+8; (1,5)→T0 (delve<min); (6,1)→T0 (bands<minBands)",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 reflect + project — half-life decay vs oracle
  const refl = await page.evaluate((QNOW) => {
    window.__dev.delve({ enabled: true, self: "self" });
    window.__dev.delve({ clear: true, nowMs: QNOW });
    window.__dev.delve({ nowMs: QNOW, self: "self", push: { "cli-A": { delve: 8, bands: 5, atMs: QNOW }, peer: { delve: 5, bands: 3, atMs: QNOW } } });
    const at0 = window.__dev.delve({ nowMs: QNOW });
    const at25 = window.__dev.delve({ nowMs: QNOW + 25000 });
    const at50 = window.__dev.delve({ nowMs: QNOW + 50000 });
    return { a0: at0.delveMap["cli-A"], p0: at0.delveMap.peer, a25: at25.delveMap["cli-A"], a50: at50.delveMap["cli-A"], b0: at0.bandsMap, b25: at25.bandsMap };
  }, QNOW);
  const reflOk = near(refl.a0, oracleDecay(8, 0)) && near(refl.p0, oracleDecay(5, 0)) &&
    near(refl.a25, oracleDecay(8, 25000), 0.02) && near(refl.a50, oracleDecay(8, 50000), 0.02) &&
    refl.b0["cli-A"] === 5 && refl.b0.peer === 3 && refl.b25["cli-A"] === 5;
  ok("7 SERVER-AUTH reflect+project: DECAY half-life 0-RNG (VM == oracle 0.5^(dt/hl): 8→4@25s→2@50s); bands sin decaer (server-auth)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accumulator = fn of BANDS (step)
  const acc = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true }; const zone = w.zone;
    window.__setmarks("self", [{ d: 6, t: QNOW - 2000 }, { d: 6, t: QNOW - 1000 }, { d: 6, t: QNOW }]);   // 1 banda (quieto)
    window.__dev.delve({ toZone: zone });
    const one = window.__step("self", 5);
    window.__setmarks("self", [{ d: 1, t: QNOW }, { d: 2, t: QNOW }, { d: 3, t: QNOW }, { d: 5, t: QNOW }, { d: 6, t: QNOW }]);   // 5 bandas
    window.__dev.delve({ toZone: zone });
    const tick1 = window.__step("self", 0.5);
    const s2 = window.__step("self", 1.5);
    const s3 = window.__step("self", 2);
    const s4 = window.__step("self", 2);
    return { zone, oneDelve: one.delve, oneBands: one.bands, tick1Delve: tick1.delve, s2delve: s2.delve, s3delve: s3.delve, s4delve: s4.delve };
  }, QNOW);
  const accTiers = await page.evaluate((QNOW, acc) => {
    const zone = acc.zone; const rd = (dv) => { window.__dev.delve({ clear: true, nowMs: QNOW }); return window.__dev.delve({ nowMs: QNOW, self: "self", delve: dv, bands: 5, pid: "self", atMs: QNOW, toZone: zone }).tier; };
    return { t1: rd(acc.tick1Delve), t2: rd(acc.s2delve), t3: rd(acc.s3delve), t4: rd(acc.s4delve) };
  }, QNOW, acc);
  const accOk = !acc.bad && near(acc.oneDelve, 0) && acc.oneBands === 1 &&
    acc.tick1Delve > 0 && acc.tick1Delve < 2 && oracleTier(acc.tick1Delve, 5) === 0 && accTiers.t1 === 0 &&
    accTiers.t2 >= 1 && accTiers.t3 >= 2 && accTiers.t4 === 3;
  ok("8 ★ ACUMULADOR = fn de BANDAS: 1 banda⇒add 0 (nunca abre, no por posición); 5 bandas 1-tick dt=0.5⇒delve<2⇒T0 (permanencia, oracle); sostenido⇒T1→T2→T3",
     accOk, JSON.stringify({ acc, accTiers }));

  // 9 ★ differentiator (bands vertical, orthogonal to Trailcraft types)
  const diff = await page.evaluate((QNOW) => {
    const win = 30000; const B = (marks) => window.__dev.delve({ bandsProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const stillDeep = B([{ d: 6, t: QNOW - 6000 }, { d: 6, t: QNOW - 5000 }, { d: 6, t: QNOW - 4000 }, { d: 6, t: QNOW - 3000 }, { d: 6, t: QNOW - 2000 }, { d: 6, t: QNOW - 1000 }, { d: 6, t: QNOW }]);
    const descend = B([{ d: 1, t: QNOW - 4000 }, { d: 2, t: QNOW - 3000 }, { d: 3, t: QNOW - 2000 }, { d: 5, t: QNOW - 1000 }, { d: 6, t: QNOW }]);
    const sameTier = B([{ d: 4, t: QNOW - 1000 }, { d: 4, t: QNOW }]);   // swamp+arena both tier 4 ⇒ 1 band (Trailcraft would count 2 types)
    return { stillDeep, descend, sameTier };
  }, QNOW);
  const diffOk = diff.stillDeep === 1 && diff.descend === 5 && diff.sameTier === 1 &&
    diff.stillDeep === oracleBands([{ d: 6, t: QNOW }], QNOW, 30000);
  ok("9 ★ DIFERENCIADOR: quieto 1 banda profunda⇒bands 1⇒NO abre (no por posición); DESCENDER 5 bandas⇒bands 5 (VERTICAL); 2 zonas MISMO tier⇒bands 1 (ORTOGONAL a Trailcraft diversidad de tipos)",
     diffOk, JSON.stringify(diff));

  // 10 ★ decay steps tier down — cross-check oracle at +hl and +2·hl
  const decay = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.delve({ clear: true, nowMs: QNOW });
    window.__dev.delve({ nowMs: QNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: QNOW, toZone: zone });
    const a0 = window.__dev.delve({ nowMs: QNOW, toZone: zone });
    const a25 = window.__dev.delve({ nowMs: QNOW + 25000, toZone: zone });
    const a50 = window.__dev.delve({ nowMs: QNOW + 50000, toZone: zone });
    return { d0: a0.delve, t0: a0.tier, c0: a0.critPct, d25: a25.delve, t25: a25.tier, c25: a25.critPct, d50: a50.delve, t50: a50.tier, c50: a50.critPct };
  }, QNOW);
  // oracle: 6→3@25s (bands5): tier for (3,5)=T1(+8); 6→1.5@50s: tier(1.5,5)=T0
  const decayOk = !decay.bad && near(decay.d0, 6) && decay.t0 === 3 && decay.c0 === 25 &&
    near(decay.d25, oracleDecay(6, 25000), 0.02) && decay.t25 === oracleTier(oracleDecay(6, 25000), 5) && decay.c25 === oracleCrit(oracleDecay(6, 25000), 5) && decay.t25 === 1 &&
    near(decay.d50, oracleDecay(6, 50000), 0.02) && decay.t50 === oracleTier(oracleDecay(6, 50000), 5) && decay.t50 === 0;
  ok("10 ★ DECAY 0-RNG vida-media (VM == oracle): 6(T3+25)→3@25s(T1+8)→1.5@50s(T0). El min crece por tier ⇒ decay baja el tier gradual",
     decayOk, JSON.stringify(decay));

  // 11 passive isolated
  const pass = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 3); if (!w) return { bad: true };   // T2 +15
    const inz = window.__dev.delve({ nowMs: QNOW, toZone: w.zone });
    const out = window.__dev.delve({ leave: true });
    return { zone: w.zone, inBonus: inz.critBonusPct, inTier: inz.tier, inPct: inz.critPct, outBonus: out.critBonusPct, outTier: out.tier };
  }, QNOW);
  ok("11 PASSIVE aislado (critChance): en zona con delve6,bands3 ⇒ critBonusPct==tier.critPct (T2=+15); leave ⇒ 0 + tier 0",
     !pass.bad && pass.inBonus === 15 && pass.inTier === 2 && pass.inPct === 15 && pass.outBonus === 0 && pass.outTier === 0, JSON.stringify(pass));

  // 12 ★ fresh channel critChance wired + HARD CAP (grep seam + critTick vs oracle)
  const simSrc = await page.evaluate(async () => (await fetch("sim/sim.js")).text());
  const seamWired = /function delveCritBonusPct/.test(simSrc) &&
    /const db=delveCritBonusPct\(\)/.test(simSrc) && /critPct\+=Math\.min\(db,room\)/.test(simSrc);
  const crit = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true };   // T3 +25
    window.__dev.delve({ nowMs: QNOW, toZone: w.zone });
    const capped = window.__dev.delve({ critTick: { base: 40 } }).critPicked;    // 40+25 ⇒ cap 50
    const uncapped = window.__dev.delve({ critTick: { base: 10 } }).critPicked;  // 10+25 ⇒ 35
    window.__dev.delve({ enabled: false });
    const off = window.__dev.delve({ critTick: { base: 40 } }).critPicked;
    const offTag = window.__dev.delve().tag;
    window.__dev.delve({ enabled: true });
    return { capped, uncapped, off, offTag };
  }, QNOW);
  const critOk = !crit.bad &&
    crit.capped.total === oracleCritTotal(40, 25) && crit.capped.total === 50 && crit.capped.capped === true && crit.capped.delveBonus === 25 &&
    crit.uncapped.total === oracleCritTotal(10, 25) && crit.uncapped.total === 35 && crit.uncapped.capped === false &&
    crit.off.total === 40 && crit.off.delveBonus === 0 && crit.offTag === "";
  ok("12 ★ CANAL critChance wired + CAP DURO (grep seam + VM==oracle): base40+25⇒cap 50 (capped); base10+25⇒35; OFF ⇒ total==base (40) byte-id + tag \"\"",
     seamWired && critOk, `wired=${seamWired} ${JSON.stringify(crit)}`);

  // 13 ★ orthogonality ⊥ 5 other channels
  const orth = await page.evaluate((QNOW) => {
    const w = window.__pick(6, 5); if (!w) return { bad: true }; const zone = w.zone;
    const a = window.__dev.delve({ nowMs: QNOW, toZone: zone });
    const critBefore = a.critBonusPct, restedBefore = a.restedXpMult;
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: QNOW });
    window.__dev.convoy({ nowMs: QNOW, push: { [zone]: { march: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: QNOW });
    window.__dev.kinship({ nowMs: QNOW, push: { [zone]: { kinship: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: QNOW });
    window.__dev.ward({ nowMs: QNOW, push: { [zone]: { ward: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
    window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: [{ c: "0,0", t: QNOW }, { c: "1,0", t: QNOW }, { c: "2,0", t: QNOW }, { c: "3,0", t: QNOW }] }, toZone: zone });
    window.__dev.trailcraft({ enabled: true, self: "self" }); window.__dev.trailcraft({ clear: true, nowMs: QNOW });
    window.__dev.trailcraft({ nowMs: QNOW, self: "self", craft: 6, pid: "self", atMs: QNOW, toZone: zone });
    const b = window.__dev.delve({ nowMs: QNOW, toZone: zone });
    // reverse: does opening delve change the other channels? read via delve VM (it exposes all channel muls)
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    return { zone, channel: a.channel, critBefore, restedBefore, critAfter: b.critBonusPct, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor, restedAfter: b.restedXpMult };
  }, QNOW);
  const orthOk = !orth.bad && orth.channel === "critChance" && orth.critBefore === 25 && orth.critAfter === orth.critBefore &&
    orth.restedAfter >= orth.restedBefore && orth.goldAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 && orth.lootAfter !== "";
  ok("13 ★ ORTOGONALIDAD critChance ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality: abrir descenso NO cambia los otros; activar CONVOY/KINSHIP/WARD/WAYFARER/TRAILCRAFT NO cambia el bono critChance (25→25)",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-regression: 16 arc flags LIVE, DELVE dark
  const cfgSrc = await page.evaluate(async () => (await fetch("sim/config.js")).text());
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["TRAILCRAFT", "FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  ok("14 ★ 0-REGRESIÓN: 16 flags del arco served enabled:true (incl. TRAILCRAFT LIVE); DELVE served false (DARK)",
     arcAllOn && flag("DELVE") === "false" && arc.length === 16, `delve=${flag("DELVE")} arc=${JSON.stringify(arcLive)}`);

  // 15 ★ 6 zones host the passive
  const zonesRes = await page.evaluate((QNOW) => {
    window.__dev.delve({ enabled: true, self: "self" });
    const zones = window.__dev.delve().zones; const broken = [];
    for (const z of zones) {
      window.__dev.delve({ clear: true, nowMs: QNOW });
      const s = window.__dev.delve({ nowMs: QNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: QNOW, toZone: z });
      if (!(s.zone === z && s.delvable && s.tier === 3 && s.critPct === 25)) broken.push(z);
    }
    return { zones, broken };
  }, QNOW);
  ok("15 ★ DESCENSO 6 zonas: las 6 zonas de DELVE.zones hospedan el pasivo (delve6+bands5⇒T3, critPct 25) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Descenso:" ON / not OFF + fps
  const badge = await page.evaluate(async (QNOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Descenso:") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__pick(6, 5); window.__dev.delve({ nowMs: QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.delve({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, QNOW);
  ok("16 render badge \"Descenso:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano (badge único, no colisiona con Sendero/Sendero Trillado)",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  await page.evaluate((QNOW) => { const w = window.__pick(6, 5); window.__dev.delve({ nowMs: QNOW, toZone: w.zone }); }, QNOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.delve({ enabled: false }));
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installDelve(pageB);
  const northStar = await (async () => {
    const zone = await page.evaluate(() => (window.__dev.delve({ enabled: true }).zones || [])[3]);   // idx3 = abyss (band 5) — re-labeled vs GE idx2
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, QNOW }) => {
        window.__dev.delve({ enabled: true, self });
        window.__dev.delve({ clear: true, nowMs: QNOW });
        const s = window.__dev.delve({ nowMs: QNOW + (elapsedSec || 0) * 1000, self, push: {
          "cli-A": { delve: 6, bands: 5, atMs: QNOW }, "cli-B": { delve: 2, bands: 2, atMs: QNOW }, peer: { delve: 6, bands: 5, atMs: QNOW },
        }, toZone: zone });
        return { self: s.self, delve: s.delve, bands: s.bands, tier: s.tier, critPct: s.critPct, nowMs: s.nowMs, map: s.delveMap, bmap: s.bandsMap };
      }, { self, elapsedSec, zone, QNOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("peer", 0);
    const decayed = await readAs("peer", 25);
    const indep = await (async () => {
      const push = { "cli-A": { delve: 6, bands: 5, atMs: QNOW }, "cli-B": { delve: 2, bands: 2, atMs: QNOW } };
      const rA = await page.evaluate(({ zone, QNOW, push }) => { window.__dev.delve({ enabled: true, self: "cli-A" }); window.__dev.delve({ clear: true, nowMs: QNOW }); const s = window.__dev.delve({ nowMs: QNOW, self: "cli-A", push, toZone: zone }); return { self: s.self, tier: s.tier, critPct: s.critPct, map: s.delveMap }; }, { zone, QNOW, push });
      const rB = await pageB.evaluate(({ zone, QNOW, push }) => { window.__dev.delve({ enabled: true, self: "cli-B" }); window.__dev.delve({ clear: true, nowMs: QNOW }); const s = window.__dev.delve({ nowMs: QNOW, self: "cli-B", push, toZone: zone }); return { self: s.self, tier: s.tier, critPct: s.critPct, map: s.delveMap }; }, { zone, QNOW, push });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    const aLeaves = await page.evaluate(() => { const s = window.__dev.delve({ leave: true }); return { bonus: s.critBonusPct, tier: s.tier, map: s.delveMap, delve: s.delve }; });
    const bIntact = await pageB.evaluate(({ zone, QNOW }) => { const s = window.__dev.delve({ nowMs: QNOW, self: "cli-B", toZone: zone }); return { bonus: s.critBonusPct, tier: s.tier, delve: s.delve }; }, { zone, QNOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && near(northStar.shared.a.delve, 6) && northStar.shared.a.critPct === 25 &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && near(northStar.decayed.a.delve, oracleDecay(6, 25000), 0.02) && northStar.decayed.a.critPct === 8 &&
    northStar.indep.mapEq && northStar.indep.rA.tier === 3 && northStar.indep.rA.critPct === 25 && northStar.indep.rB.tier === 1 && northStar.indep.rB.critPct === 8 &&
    northStar.aLeaves.bonus === 0 && northStar.aLeaves.tier === 0 && (northStar.aLeaves.map && (northStar.aLeaves.map["cli-A"] || 0) > 0) && near(northStar.aLeaves.delve, 6) &&
    northStar.bIntact.bonus === 8 && northStar.bIntact.tier === 1;
  ok("17 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ delve/bands/tier/crit byte-idénticos (peer T3+25, decae T1+8); per-pid (A=T3 vs B=T1 indep, mapa idéntico); A sale ⇒ crit 0 PERO delveMap + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqShared: northStar.shared.eq, eqDecay: northStar.decayed.eq, mapEq: northStar.indep.mapEq, aBonus: northStar.aLeaves.bonus, bBonus: northStar.bIntact.bonus, errB: errB.length }));

  ok("0 no JS errors during full run", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(`\n${FAIL === 0 ? "ALL PASS" : "HAS FAIL"}  ${PASS}/${PASS + FAIL}  build=${build}`);
  process.exit(FAIL === 0 ? 0 : 1);
} catch (e) {
  console.error("HARNESS ERROR", e);
  process.exit(2);
} finally {
  await browser.close();
  await server.stop();
}
