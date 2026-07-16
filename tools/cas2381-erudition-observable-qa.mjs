// CAS-2381 — QA INDEPENDENT observable DARK harness for ERUDICIÓN / LOREKEEPER (DARK, ERUDITION.enabled:false). EVO mecánica #65.
// This is the QA (b5c10283) independent verification — NOT the GE self-verify. Oracles are RE-DERIVED here in Node
// (loreVariety / eruditionTier / half-life decay / xpGain de-stack re-implemented from the spec, NOT reused from sim.js) and
// cross-checked AGAINST the VM (__dev.erudition) outputs. Clock (QNOW) + pids + kill-types are RE-LABELED (QNOW 8.780M,
// pids "obs-A"/"obs-B"/"peer", enemy types wraith/ghoul/ogre/troll/harpy) so a copy of the GE numbers would not silently pass.
// Same twin pattern as CAS-2380 (Delve) / CAS-2377 (Trailcraft) / CAS-2370 (Focus) QA.
//
// EJE FRESCO = DIVERSIDAD DE PRESAS / BESTIARY BREADTH (nº de TIPOS de enemigo DISTINTOS abatidos). server-auth, 0-RNG, INDIVIDUAL (per-pid).
// CANAL REUSADO = xpGain (multiplicador de XP por el ÚNICO chokepoint gainXP). De-stack máximo-único: ERUDITION cede a FELLOWSHIP_BOND #47
// (si fellowMul(xpGain)>0 ⇒ eruditionMul=0). Mirror EXACTO de FOCUS→KINSHIP en goldFind. ⊥ goldFind/restedMult/wardRegen/oocMitigation/lootQuality/critChance.
//
// Checks:
//   1  boot to play, __dev.erudition + arc hooks (+fellowship) + __BUILD, 0 JS err.
//   2  byte-id OFF fresh boot: ERUDITION.enabled false AND G.lore NUNCA se crea (gExists false).
//   3  byte-id save OFF: saveBlob() sin clave lore/loreServer/loreMarks.
//   4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift).
//   5  ★ VARIETY = fn PURA (VM probe == oracle re-derivado): 1 kill⇒1; N MISMO tipo⇒1; K tipos distintos⇒K; fuera-ventana⇒excl; vacío⇒0.
//   6  TABLA de tiers = fn PURA de lore (oracle re-derivado cruzado contra VM, 5 casos).
//   7  server-auth reflect+project: DECAY half-life determinista (oracle 0.5^(dt/hl)).
//   8  ★ ACUMULADOR = fn de VARIEDAD (step): 1 tipo⇒add 0 (nunca abre); 3 tipos 1-tick⇒lore<2⇒T0 (permanencia); sostenido⇒T1→T2→T3.
//   9  ★ DIFERENCIADOR: matar SIEMPRE el mismo tipo⇒variety 1⇒NO abre (OPUESTO a Focus concentración); 3 tipos distintos⇒variety 3⇒abre (a QUIÉN matas).
//  10  ★ DECAY 0-RNG por vida-media ⇒ tier baja gradual (oracle cross-check en +halfLife y +2·halfLife).
//  11  PASSIVE aislado (xpGain): en zona ⇒ boost==tier.boost; leave ⇒ 0.
//  12  ★ CANAL xpGain wired + seam gainXP (grep seam + xpTick base·(1+fellow+erudition); OFF ⇒ paid==base·(1+fellow) byte-id).
//  13  ★ DE-STACK máximo-único: forjar FELLOWSHIP ⇒ fellowMul(xpGain)>0 ⇒ eruditionMul CEDE a 0 (aplica el MAYOR, 0 doble-dip). Mirror FOCUS→KINSHIP.
//  14  ★ ORTOGONALIDAD xpGain ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance (0 doble-conteo).
//  15  ★ 0-REGRESIÓN: 16 flags del arco served enabled:true; DELVE + ERUDITION served false (DARK).
//  16  ★ ERUDICIÓN 6 zonas: pasivo aplica en las 6 zonas de ERUDITION.zones (broken=[]).
//  17  render badge "Erudito:" se DIBUJA ON / no OFF + fps sano (colon único, no colisiona con "Erudición" meta).
//  18  ★ NORTH STAR — 2-CLIENTE REAL: 2 páginas, MISMO snapshot+reloj ⇒ lore/tier/boost byte-idénticos; per-pid A vs B independientes; A sale ⇒ boost 0 pero loreMap + Δ_B intactos (0 desync).
//   0  no JS errors.
// Run: node tools/cas2381-erudition-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2381-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── RE-DERIVED ORACLES (independent re-implementation from the spec; NOT imported from sim.js) ──
const CFG = { minVariety: 3, halfLifeSec: 25, accruePerSec: 1, capLore: 12, windowSec: 30,
  tiers: [{ min: 2, boost: 0.05 }, { min: 4, boost: 0.10 }, { min: 6, boost: 0.15 }] };
const oracleVariety = (marks, now, winMs) => {   // nº de TIPOS (k) DISTINTOS con t ∈ [now-win, now]
  if (!Array.isArray(marks)) return 0; const lo = now - winMs; const set = new Set();
  for (const m of marks) { const k = String((m && m.k) == null ? "" : m.k), t = +(m && m.t) || 0; if (t >= lo && t <= now) set.add(k); }
  return set.size;
};
const oracleTier = (lore) => { let idx = 0; for (let i = 0; i < CFG.tiers.length; i++) { if (lore >= CFG.tiers[i].min) idx = i + 1; } return idx; };
const oracleBoost = (lore) => { const t = oracleTier(lore); return t > 0 ? CFG.tiers[t - 1].boost : 0; };
const oracleDecay = (base, dtMs) => Math.min(CFG.capLore, base * Math.pow(0.5, dtMs / (CFG.halfLifeSec * 1000)));

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAErudite";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit3", key: "3", bubbles: true })));  // class 3 (re-labeled vs GE)
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

const QNOW = 8780000;   // QA clock (re-labeled, distinct from GE) — shared wall-clock for deterministic projection.
// RE-LABELED enemy types (distinct from GE's) — the 5 species used to build variety.
const TY = ["wraith", "ghoul", "ogre", "troll", "harpy"];
async function installEru(page) {
  await page.evaluate((QNOW, TY) => {
    window.__QN = QNOW; window.__TY = TY;
    // build `n` kill marks of DISTINCT types (variety n) at time t
    window.__distinct = (n, t) => { const o = []; for (let i = 0; i < n; i++) o.push({ k: window.__TY[i % window.__TY.length], t: (t == null ? window.__QN : t) }); return o; };
    // build `n` kill marks of the SAME type (variety 1) at time t
    window.__same = (n, t) => { const o = []; for (let i = 0; i < n; i++) o.push({ k: window.__TY[0], t: (t == null ? window.__QN : t) }); return o; };
    window.__setmarks = (pid, marks) => { window.__dev.erudition({ clear: true, nowMs: window.__QN }); window.__dev.erudition({ nowMs: window.__QN, self: pid, marks: { [pid]: marks } }); };
    window.__step = (pid, dt) => window.__dev.erudition({ nowMs: window.__QN, self: pid, step: { [pid]: { dt } } });
    // push a raw lore accumulator for a pid, teleport to a hunt zone
    window.__pick = (lore) => {
      window.__dev.erudition({ enabled: true, self: "self" });
      const zones = window.__dev.erudition().zones || [];
      for (const z of zones) {
        window.__dev.erudition({ clear: true, nowMs: window.__QN });
        const s = window.__dev.erudition({ nowMs: window.__QN, self: "self", lore, pid: "self", atMs: window.__QN, toZone: z });
        if (s.zone === z && s.learnable) return { zone: z, lore: s.lore, tier: s.tier, boost: s.boost };
      }
      return null;
    };
  }, QNOW, TY);
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.erudition && window.__dev.delve && window.__dev.trailcraft && window.__dev.fellowship && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.erudition + arc hooks (+fellowship) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.erudition());
  ok("2 byte-id OFF (fresh boot): enabled false AND G.lore NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.lore === 0 && dark.boost === 0 && dark.xpGainMul === 0 && dark.tag === "" && dark.loreMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} boost=${dark.boost} tag="${dark.tag}"`);

  // 3 save OFF has no lore keys
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'lore'/'loreServer'/'loreMarks' key in save blob", !/"lore(Server|Marks)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(381)));
  await page.evaluate(() => window.__dev.erudition({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(381)));
  await page.evaluate(() => window.__dev.erudition({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installEru(page);

  // 5 ★ variety pure fn — VM probe cross-checked against RE-DERIVED oracle
  const varData = await page.evaluate((QNOW, TY) => {
    window.__dev.erudition({ enabled: true });
    const win = 30000;
    const V = (marks) => window.__dev.erudition({ varietyProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const cases = {
      one:      [{ k: TY[0], t: QNOW }],
      sameMany: [{ k: TY[0], t: QNOW - 4000 }, { k: TY[0], t: QNOW - 2000 }, { k: TY[0], t: QNOW }],
      three:    [{ k: TY[0], t: QNOW }, { k: TY[1], t: QNOW }, { k: TY[2], t: QNOW }],
      five:     [{ k: TY[0], t: QNOW }, { k: TY[1], t: QNOW }, { k: TY[2], t: QNOW }, { k: TY[3], t: QNOW }, { k: TY[4], t: QNOW }],
      expired:  [{ k: TY[1], t: QNOW - 45000 }, { k: TY[2], t: QNOW }],   // 1 en ventana, 1 fuera
      empty:    [],
    };
    const vm = {}; for (const k in cases) vm[k] = V(cases[k]);
    return { cases, vm };
  }, QNOW, TY);
  const varOracleOk = Object.keys(varData.cases).every(k => varData.vm[k] === oracleVariety(varData.cases[k], QNOW, 30000));
  const varExpectOk = varData.vm.one === 1 && varData.vm.sameMany === 1 && varData.vm.three === 3 && varData.vm.five === 5 && varData.vm.expired === 1 && varData.vm.empty === 0;
  ok("5 ★ VARIETY = fn PURA (VM probe == oracle re-derivado): 1 kill⇒1; N MISMO tipo⇒1; 3 tipos⇒3; 5 tipos⇒5; fuera-ventana⇒excl; vacío⇒0",
     varOracleOk && varExpectOk, `vm=${JSON.stringify(varData.vm)}`);

  // 6 tier table — VM vs oracle over 5 lore cases
  const tab = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const lv of [6, 4, 2, 1, 0]) {
      window.__dev.erudition({ clear: true, nowMs: QNOW });
      const s = window.__dev.erudition({ nowMs: QNOW, self: "self", lore: lv, pid: "self", atMs: QNOW, toZone: zone });
      out.push({ lv, lore: s.lore, tier: s.tier, boost: s.boost });
    }
    return { zone, out };
  }, QNOW);
  const tabOk = !tab.bad && tab.out.every(r => near(r.lore, r.lv) && r.tier === oracleTier(r.lv) && near(r.boost, oracleBoost(r.lv)));
  ok("6 TABLA de tiers = fn PURA de lore (VM == oracle): 6→T3+0.15; 4→T2+0.10; 2→T1+0.05; 1→T0; 0→T0",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 reflect + project — half-life decay vs oracle
  const refl = await page.evaluate((QNOW) => {
    window.__dev.erudition({ enabled: true, self: "self" });
    window.__dev.erudition({ clear: true, nowMs: QNOW });
    window.__dev.erudition({ nowMs: QNOW, self: "self", push: { "obs-A": { lore: 8, atMs: QNOW }, peer: { lore: 5, atMs: QNOW } } });
    const at0 = window.__dev.erudition({ nowMs: QNOW });
    const at25 = window.__dev.erudition({ nowMs: QNOW + 25000 });
    const at50 = window.__dev.erudition({ nowMs: QNOW + 50000 });
    return { a0: at0.loreMap["obs-A"], p0: at0.loreMap.peer, a25: at25.loreMap["obs-A"], a50: at50.loreMap["obs-A"] };
  }, QNOW);
  const reflOk = near(refl.a0, oracleDecay(8, 0)) && near(refl.p0, oracleDecay(5, 0)) &&
    near(refl.a25, oracleDecay(8, 25000), 0.02) && near(refl.a50, oracleDecay(8, 50000), 0.02);
  ok("7 SERVER-AUTH reflect+project: DECAY half-life 0-RNG (VM == oracle 0.5^(dt/hl): 8→4@25s→2@50s)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accumulator = fn of VARIETY (step). NOTE: the step hook returns the full snapshot (read .lore/.tier), not the raw loreStep result.
  const acc = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true }; const zone = w.zone;
    // independent VM cross-check of variety on the two mark sets (proves add-gate is driven by variety)
    const vSame = window.__dev.erudition({ varietyProbe: { marks: window.__same(3, QNOW), now: QNOW, windowMs: 30000 } }).probe;
    const vDist = window.__dev.erudition({ varietyProbe: { marks: window.__distinct(3, QNOW), now: QNOW, windowMs: 30000 } }).probe;
    window.__setmarks("self", window.__same(3, QNOW));   // 3 marcas MISMO tipo (variety 1)
    window.__dev.erudition({ toZone: zone });
    const one = window.__step("self", 5);                 // variety 1 < min ⇒ add 0 ⇒ lore stays 0
    window.__setmarks("self", window.__distinct(3, QNOW));  // 3 tipos DISTINTOS (variety 3) — clear resets lore to 0
    window.__dev.erudition({ toZone: zone });
    const tick1 = window.__step("self", 0.5);            // 1-tick permanencia ⇒ lore≈0.5 < 2 ⇒ T0
    const s2 = window.__step("self", 1.5);               // cumulative lore ≈ 2.0
    const s3 = window.__step("self", 2);                 // ≈ 4.0
    const s4 = window.__step("self", 2);                 // ≈ 6.0
    return { zone, vSame, vDist, oneLore: one.lore, oneTier: one.tier, tick1Lore: tick1.lore, tick1Tier: tick1.tier, s2Lore: s2.lore, s2Tier: s2.tier, s3Tier: s3.tier, s4Tier: s4.tier };
  }, QNOW);
  const accOk = !acc.bad && acc.vSame === 1 && acc.vDist === 3 &&
    near(acc.oneLore, 0) && acc.oneTier === 0 &&
    acc.tick1Lore > 0 && acc.tick1Lore < 2 && oracleTier(acc.tick1Lore) === 0 && acc.tick1Tier === 0 &&
    acc.s2Tier >= 1 && acc.s3Tier >= 2 && acc.s4Tier === 3;
  ok("8 ★ ACUMULADOR = fn de VARIEDAD: 1 tipo (variety1<3)⇒add 0 (nunca abre, no por conteo de kills); 3 tipos 1-tick dt=0.5⇒lore<2⇒T0 (permanencia, oracle); sostenido⇒T1→T2→T3",
     accOk, JSON.stringify(acc));

  // 9 ★ differentiator (WHO you kill; opposite Focus concentration)
  const diff = await page.evaluate((QNOW) => {
    const win = 30000; const V = (marks) => window.__dev.erudition({ varietyProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const sameSpam = V(window.__same(8, QNOW));          // 8 kills MISMO tipo ⇒ variety 1
    const diverse = V(window.__distinct(4, QNOW));       // 4 tipos DISTINTOS ⇒ variety 4
    const oneType = V([{ k: "wraith", t: QNOW - 1000 }, { k: "wraith", t: QNOW }]);   // Bounty/Emissary contarían 2 kills; aquí 1 tipo
    return { sameSpam, diverse, oneType };
  }, QNOW);
  const diffOk = diff.sameSpam === 1 && diff.diverse === 4 && diff.oneType === 1 &&
    diff.sameSpam < CFG.minVariety && diff.diverse >= CFG.minVariety;
  ok("9 ★ DIFERENCIADOR: matar SIEMPRE el mismo tipo (8 kills)⇒variety 1<3⇒NO abre (OPUESTO a Focus concentración/BOUNTY conteo); 4 tipos distintos⇒variety 4⇒abre (a QUIÉN matas)",
     diffOk, JSON.stringify(diff));

  // 10 ★ decay steps tier down — cross-check oracle at +hl and +2·hl
  const decay = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.erudition({ clear: true, nowMs: QNOW });
    window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: zone });
    const a0 = window.__dev.erudition({ nowMs: QNOW, toZone: zone });
    const a25 = window.__dev.erudition({ nowMs: QNOW + 25000, toZone: zone });
    const a50 = window.__dev.erudition({ nowMs: QNOW + 50000, toZone: zone });
    return { d0: a0.lore, t0: a0.tier, b0: a0.boost, d25: a25.lore, t25: a25.tier, b25: a25.boost, d50: a50.lore, t50: a50.tier, b50: a50.boost };
  }, QNOW);
  // oracle: 6(T3+.15)→3@25s: tier(3)=T1(+.05); 6→1.5@50s: tier(1.5)=T0
  const decayOk = !decay.bad && near(decay.d0, 6) && decay.t0 === 3 && near(decay.b0, 0.15) &&
    near(decay.d25, oracleDecay(6, 25000), 0.02) && decay.t25 === oracleTier(oracleDecay(6, 25000)) && near(decay.b25, oracleBoost(oracleDecay(6, 25000))) && decay.t25 === 1 &&
    near(decay.d50, oracleDecay(6, 50000), 0.02) && decay.t50 === oracleTier(oracleDecay(6, 50000)) && decay.t50 === 0;
  ok("10 ★ DECAY 0-RNG vida-media (VM == oracle): 6(T3+.15)→3@25s(T1+.05)→1.5@50s(T0). El min crece por tier ⇒ decay baja el tier gradual",
     decayOk, JSON.stringify(decay));

  // 11 passive isolated
  const pass = await page.evaluate((QNOW) => {
    const w = window.__pick(4); if (!w) return { bad: true };   // T2 +10%
    const inz = window.__dev.erudition({ nowMs: QNOW, toZone: w.zone });
    const out = window.__dev.erudition({ leave: true });
    return { zone: w.zone, inBoost: inz.boost, inTier: inz.tier, inMul: inz.xpGainMul, outBoost: out.boost, outTier: out.tier, outMul: out.xpGainMul };
  }, QNOW);
  ok("11 PASSIVE aislado (xpGain): en zona con lore4 ⇒ boost==tier.boost (T2=+0.10) == xpGainMul; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inBoost, 0.10) && pass.inTier === 2 && near(pass.inMul, 0.10) && pass.outBoost === 0 && pass.outTier === 0 && pass.outMul === 0, JSON.stringify(pass));

  // 12 ★ channel xpGain wired + seam (grep seam + xpTick vs oracle)
  const simSrc = await page.evaluate(async () => (await fetch("sim/sim.js")).text());
  const seamWired = /function eruditionMul\(h,kind\)/.test(simSrc) &&
    /n=Math\.round\(n\*\(1\+fellowMul\(h,"xpGain"\)\+eruditionMul\(h,"xpGain"\)\)\)/.test(simSrc);
  const xp = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true };   // T3 +0.15, no fellowship forged (fb=0)
    window.__dev.erudition({ nowMs: QNOW, toZone: w.zone });
    const on = window.__dev.erudition({ xpTick: { base: 1000 } }).xpPicked;   // 1000·1.15 = 1150
    window.__dev.erudition({ enabled: false });
    const off = window.__dev.erudition({ xpTick: { base: 1000 } }).xpPicked;   // enabled false ⇒ eb 0 ⇒ 1000·(1+fb)
    const offTag = window.__dev.erudition().tag;
    window.__dev.erudition({ enabled: true });
    return { on, off, offTag };
  }, QNOW);
  const xpOk = !xp.bad &&
    xp.on.paid === Math.round(1000 * (1 + xp.on.fellowBonus + 0.15)) && near(xp.on.eruditionBonus, 0.15) &&
    xp.off.paid === Math.round(1000 * (1 + xp.off.fellowBonus)) && xp.off.eruditionBonus === 0 && xp.offTag === "";
  ok("12 ★ CANAL xpGain wired + seam gainXP (grep n·(1+fellowMul+eruditionMul) + VM==oracle): ON lore6⇒base1000·1.15=1150; OFF ⇒ paid==base·(1+fellow) byte-id + tag \"\"",
     seamWired && xpOk, `wired=${seamWired} ${JSON.stringify(xp)}`);

  // 13 ★ DE-STACK máximo-único: FELLOWSHIP forjada ⇒ ERUDITION cede
  const destack = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.erudition({ enabled: true, self: "self" });
    window.__dev.erudition({ clear: true, nowMs: QNOW });
    window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: zone });
    const before = window.__dev.erudition({ nowMs: QNOW, toZone: zone });   // fellowship OFF ⇒ eruditionMul = 0.15
    // forge fellowship: enable + schedule (creates fellowAt) + huge kills to pass forgeTier
    window.__dev.fellowship({ enabled: true, nowMs: QNOW });
    window.__dev.fellowship({ kill: { n: 100000 } });
    window.__dev.fellowship({ nowMs: QNOW });   // re-derive after kills so forge registers
    const fs = window.__dev.fellowship();
    const after = window.__dev.erudition({ nowMs: QNOW, toZone: zone });    // fellowMul(xpGain)>0 ⇒ eruditionMul CEDES to 0
    const xpAfter = window.__dev.erudition({ xpTick: { base: 1000 } }).xpPicked;   // paid = 1000·(1+0.10+0) — the MAX (fellow), not double
    window.__dev.fellowship({ enabled: false });
    return { zone, beforeMul: before.xpGainMul, beforeTier: before.tier, afterMul: after.xpGainMul, afterFellow: after.fellowXpMul, afterTier: after.tier, forged: fs.forged, fellowMulXp: fs.fellowMulXp, xpAfter };
  }, QNOW);
  const destackOk = !destack.bad && near(destack.beforeMul, 0.15) && destack.beforeTier === 3 &&
    destack.forged === true && near(destack.afterFellow, 0.10) &&
    destack.afterMul === 0 && destack.afterTier === 3 &&   // tier still 3 (lore unchanged) but MUL cedes to 0
    destack.xpAfter.eruditionBonus === 0 && near(destack.xpAfter.fellowBonus, 0.10) && destack.xpAfter.paid === Math.round(1000 * 1.10);
  ok("13 ★ DE-STACK máximo-único: FELLOWSHIP forjada (fellowMul xpGain=0.10)⇒ERUDITION CEDE (eruditionMul 0.15→0, aplica el MAYOR); paid=1000·1.10 (NO 1.25 doble-dip). Mirror FOCUS→KINSHIP en goldFind",
     destackOk, JSON.stringify(destack));

  // 14 ★ orthogonality ⊥ 6 other channels
  const orth = await page.evaluate((QNOW) => {
    const w = window.__pick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.fellowship({ enabled: false });   // ensure no de-stack interference
    const a = window.__dev.erudition({ nowMs: QNOW, toZone: zone });
    const eruBefore = a.xpGainMul, restedBefore = a.restedXpMult;
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
    window.__dev.delve({ enabled: true, self: "self" }); window.__dev.delve({ clear: true, nowMs: QNOW });
    window.__dev.delve({ nowMs: QNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: QNOW, toZone: zone });
    window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: zone });   // re-assert self (drivers changed self)
    const b = window.__dev.erudition({ nowMs: QNOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false }); window.__dev.delve({ enabled: false });
    return { zone, channel: a.channel, eruBefore, restedBefore, eruAfter: b.xpGainMul, goldAfter: b.goldFindMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor, critAfter: b.critBonusPct, restedAfter: b.restedXpMult };
  }, QNOW);
  const orthOk = !orth.bad && orth.channel === "xpGain" && near(orth.eruBefore, 0.15) && near(orth.eruAfter, orth.eruBefore) &&
    near(orth.restedAfter, orth.restedBefore) && orth.goldAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 && orth.lootAfter !== "" && orth.critAfter > 0;
  ok("14 ★ ORTOGONALIDAD xpGain ⊥ restedMult ⊥ goldFind ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance: abrir erudición NO cambia los otros; activar CONVOY/KINSHIP/WARD/WAYFARER/TRAILCRAFT/DELVE NO cambia el bono xpGain (0.15→0.15)",
     orthOk, JSON.stringify(orth));

  // 15 ★ 0-regression: 16 arc flags LIVE, DELVE + ERUDITION dark
  const cfgSrc = await page.evaluate(async () => (await fetch("sim/config.js")).text());
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["TRAILCRAFT", "FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  ok("15 ★ 0-REGRESIÓN: 16 flags del arco served enabled:true (incl. TRAILCRAFT LIVE); DELVE + ERUDITION served false (DARK)",
     arcAllOn && flag("DELVE") === "false" && flag("ERUDITION") === "false" && arc.length === 16, `delve=${flag("DELVE")} erudition=${flag("ERUDITION")} arc=${JSON.stringify(arcLive)}`);

  // 16 ★ 6 zones host the passive
  const zonesRes = await page.evaluate((QNOW) => {
    window.__dev.erudition({ enabled: true, self: "self" });
    const zones = window.__dev.erudition().zones; const broken = [];
    for (const z of zones) {
      window.__dev.erudition({ clear: true, nowMs: QNOW });
      const s = window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: z });
      if (!(s.zone === z && s.learnable && s.tier === 3 && Math.abs(s.boost - 0.15) < 1e-9)) broken.push(z);
    }
    return { zones, broken };
  }, QNOW);
  ok("16 ★ ERUDICIÓN 6 zonas: las 6 zonas de ERUDITION.zones hospedan el pasivo (lore6⇒T3, boost 0.15) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 17 render badge "Erudito:" ON / not OFF + fps
  const badge = await page.evaluate(async (QNOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Erudito:") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__pick(6); window.__dev.erudition({ nowMs: QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.erudition({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, QNOW);
  ok("17 render badge \"Erudito:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano (colon único, no colisiona con la mejora meta \"Erudición\")",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  await page.evaluate((QNOW) => { const w = window.__pick(6); window.__dev.erudition({ nowMs: QNOW, toZone: w.zone }); }, QNOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 18 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.erudition({ enabled: false }));
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installEru(pageB);
  const northStar = await (async () => {
    const zone = await page.evaluate(() => (window.__dev.erudition({ enabled: true }).zones || [])[2]);   // idx2 (re-labeled vs GE)
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, QNOW }) => {
        window.__dev.erudition({ enabled: true, self });
        window.__dev.erudition({ clear: true, nowMs: QNOW });
        const s = window.__dev.erudition({ nowMs: QNOW + (elapsedSec || 0) * 1000, self, push: {
          "obs-A": { lore: 6, atMs: QNOW }, "obs-B": { lore: 2, atMs: QNOW }, peer: { lore: 6, atMs: QNOW },
        }, toZone: zone });
        return { self: s.self, lore: s.lore, tier: s.tier, boost: s.boost, nowMs: s.nowMs, map: s.loreMap };
      }, { self, elapsedSec, zone, QNOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("peer", 0);
    const decayed = await readAs("peer", 25);
    const indep = await (async () => {
      const push = { "obs-A": { lore: 6, atMs: QNOW }, "obs-B": { lore: 2, atMs: QNOW } };
      const rA = await page.evaluate(({ zone, QNOW, push }) => { window.__dev.erudition({ enabled: true, self: "obs-A" }); window.__dev.erudition({ clear: true, nowMs: QNOW }); const s = window.__dev.erudition({ nowMs: QNOW, self: "obs-A", push, toZone: zone }); return { self: s.self, tier: s.tier, boost: s.boost, map: s.loreMap }; }, { zone, QNOW, push });
      const rB = await pageB.evaluate(({ zone, QNOW, push }) => { window.__dev.erudition({ enabled: true, self: "obs-B" }); window.__dev.erudition({ clear: true, nowMs: QNOW }); const s = window.__dev.erudition({ nowMs: QNOW, self: "obs-B", push, toZone: zone }); return { self: s.self, tier: s.tier, boost: s.boost, map: s.loreMap }; }, { zone, QNOW, push });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    const aLeaves = await page.evaluate(() => { const s = window.__dev.erudition({ leave: true }); return { boost: s.boost, tier: s.tier, map: s.loreMap, lore: s.lore }; });
    const bIntact = await pageB.evaluate(({ zone, QNOW }) => { const s = window.__dev.erudition({ nowMs: QNOW, self: "obs-B", toZone: zone }); return { boost: s.boost, tier: s.tier, lore: s.lore }; }, { zone, QNOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && near(northStar.shared.a.lore, 6) && near(northStar.shared.a.boost, 0.15) &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && near(northStar.decayed.a.lore, oracleDecay(6, 25000), 0.02) && near(northStar.decayed.a.boost, 0.05) &&
    northStar.indep.mapEq && northStar.indep.rA.tier === 3 && near(northStar.indep.rA.boost, 0.15) && northStar.indep.rB.tier === 1 && near(northStar.indep.rB.boost, 0.05) &&
    northStar.aLeaves.boost === 0 && northStar.aLeaves.tier === 0 && (northStar.aLeaves.map && (northStar.aLeaves.map["obs-A"] || 0) > 0) && near(northStar.aLeaves.lore, 6) &&
    near(northStar.bIntact.boost, 0.05) && northStar.bIntact.tier === 1;
  ok("18 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ lore/tier/boost byte-idénticos (peer T3+.15, decae T1+.05); per-pid (A=T3 vs B=T1 indep, mapa idéntico); A sale ⇒ boost 0 PERO loreMap + Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ eqShared: northStar.shared.eq, eqDecay: northStar.decayed.eq, mapEq: northStar.indep.mapEq, aBoost: northStar.aLeaves.boost, bBoost: northStar.bIntact.boost, errB: errB.length }));

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
