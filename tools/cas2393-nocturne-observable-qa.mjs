// CAS-2393 — QA INDEPENDENT observable verify for NOCTURNE / CAZADOR NOCTURNO (DARK, NOCTURNE_HUNT.enabled:false). EVO mecánica #66 (serializa tras #65 ERUDITION LIVE).
// Independent re-implementation of every oracle (tally/tier/decay/gold seam/phase) from the SPEC — NOT imported from sim.js. Re-labeled pids (obs-A/obs-B/peer) + distinct QA wall-clock (QNOW) + re-derived enemy timestamps.
//
// EJE FRESCO = FASE TEMPORAL / CAZA NOCTURNA (nº de kills hechos DE NOCHE en la ventana). server-auth, 0-RNG, INDIVIDUAL per-pid: 1er eje del arco anclado al RELOJ día/noche (NO espacio/presa/densidad).
//   El server registra marcas de kill { pid → [{n,t}] } (n=1 si el kill cayó de NOCHE via isNightAt(t) del reloj COMPARTIDO), computa nightTally = nº de marcas nocturnas (n===1) en la ventana (PURA), y mientras
//   tally≥minKills ACUMULA `nocturne` (accruePerSec·dt) con DECAY vida-media. Kills DIURNOS (n=0) NUNCA cuentan ⇒ cazar de día jamás abre.
// CANAL REUSADO = goldFind (bono de oro por el chokepoint tryPickup). De-stack máximo-único: NOCTURNE (#66) CEDE a KINSHIP_BOND (#60) y FOCUS_FIRE (#62): si su goldFind>0 ⇒ nocturneMul 0 (0 doble-dip). 3ª fuente.
//
// ★ DIFERENCIADOR (checks 8/9): OPUESTO a Erudition (#65 diversidad de presas). Matar el MISMO tipo N× DE NOCHE ⇒ tally N ⇒ ABRE (Erudition NO abriría). Cazar de DÍA ⇒ tally 0 ⇒ NUNCA abre (eje TEMPORAL). INDIVIDUAL.
// ★ DE-STACK (check 13): KINSHIP O FOCUS abierto (goldFind>0) ⇒ nocturneMul CEDE a 0. ★ ORTOGONALIDAD (14): abrir caza nocturna NO cambia restedMult/xpGain/wardRegen/oocMitigation/lootQuality/critChance.
// ★ NORTH STAR (18): 2 páginas puppeteer, MISMO snapshot {pid→noct} + MISMO reloj ⇒ noct/tier/boost byte-idénticos; per-pid A=T3 vs B=T1 indep; A sale ⇒ boost 0 pero noctMap + Δ_B intactos (0 desync).
// Run: node tools/cas2393-nocturne-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2393-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── RE-DERIVED ORACLES (independent re-implementation from the NOCTURNE spec; NOT imported from sim.js) ──
const CFG = { minKills: 3, halfLifeSec: 25, accruePerSec: 1, capNocturne: 12, windowSec: 30,
  cycleSeconds: 1200, epochMs: 0, nightStart: 0.78, nightEnd: 0.28,
  tiers: [{ min: 2, boost: 0.06 }, { min: 4, boost: 0.12 }, { min: 6, boost: 0.20 }] };
// fase 0..1 del reloj compartido a partir de un t (ms). PURA.
const oraclePhase = (t) => { const cyc = Math.max(1, CFG.cycleSeconds); const x = ((+t || 0) / 1000 - CFG.epochMs / 1000) / cyc; return ((x % 1) + 1) % 1; };
// ¿t cae de noche? night si phase>=nightStart || phase<nightEnd (envuelve la medianoche; s>e). PURA.
const oracleIsNight = (t) => { const ph = oraclePhase(t), s = CFG.nightStart, e = CFG.nightEnd; return (s <= e) ? (ph >= s && ph < e) : (ph >= s || ph < e); };
// tally = nº de marcas NOCTURNAS (n===1) con t ∈ [now-win, now]. PURA. Marcas diurnas (n=0)/fuera de ventana ⇒ no cuentan.
const oracleTally = (marks, now, winMs) => { if (!Array.isArray(marks)) return 0; const lo = now - winMs; let n = 0;
  for (const m of marks) { const t = +(m && m.t) || 0; if (t < lo || t > now) continue; if ((+(m && m.n) || 0) === 1) n++; } return n; };
const oracleTier = (noct) => { let idx = 0; for (let i = 0; i < CFG.tiers.length; i++) { if (noct >= CFG.tiers[i].min) idx = i + 1; } return idx; };
const oracleBoost = (noct) => { const t = oracleTier(noct); return t > 0 ? CFG.tiers[t - 1].boost : 0; };
const oracleDecay = (base, dtMs) => Math.min(CFG.capNocturne, base * Math.pow(0.5, dtMs / (CFG.halfLifeSec * 1000)));

const QNOW = 9_066_000;   // reloj de pared FIJO (ms) para proyección determinista — DISTINTO al GE (8642000). Mismo en ambos clientes.

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  await sleep(400);
}

async function installNoct(page) {
  await page.evaluate((QNOW) => {
    window.__QN = QNOW;
    // fija marcas de kill DIRECTAS (n explícito) para un pid (CLEAR antes ⇒ snapshot limpio). Prueba tally/diferenciadores.
    window.__nmarks = (pid, marks) => { window.__dev.nocturne({ clear: true, nowMs: window.__QN }); window.__dev.nocturne({ nowMs: window.__QN, self: pid, marks: { [pid]: marks } }); };
    // inyecta kills (timestamps) con una FASE forzada (night bool) ⇒ el server deriva n=isNightAt(t) del override. CLEAR antes. Prueba diferenciador día/noche.
    window.__nkills = (pid, ts, night) => { window.__dev.nocturne({ clear: true, nowMs: window.__QN, phaseOverride: (night ? 0.9 : 0.5) }); window.__dev.nocturne({ nowMs: window.__QN, self: pid, kills: { [pid]: ts.map(t => ({ t })) } }); };
    // corre un STEP de acumulación (tally→accrue) con dt para un pid (usa las marcas ya fijadas)
    window.__nstep = (pid, dt) => window.__dev.nocturne({ nowMs: window.__QN, self: pid, step: { [pid]: { dt } } });
    // empuja el nocturne crudo (acumulador) de un pid directamente (CLEAR antes). Prueba tiers/decay sin ruido del acumulador.
    window.__noct = (pid, noct) => { window.__dev.nocturne({ clear: true, nowMs: window.__QN }); window.__dev.nocturne({ nowMs: window.__QN, self: pid, noct, pid, atMs: window.__QN }); };
    // inyecta `noct` para el pid "self", teleporta a cada zona candidata y devuelve la 1ª donde el héroe cae DENTRO (huntable + zona coincide).
    window.__npick = (noct) => {
      window.__dev.nocturne({ enabled: true, self: "self" });
      const zones = window.__dev.nocturne().zones || [];
      for (const z of zones) {
        window.__dev.nocturne({ clear: true, nowMs: window.__QN });
        const s = window.__dev.nocturne({ nowMs: window.__QN, self: "self", noct, pid: "self", atMs: window.__QN, toZone: z });
        if (s.zone === z && s.huntable) return { zone: z, noct: s.noct, tier: s.tier, boost: s.boost };
      }
      return null;
    };
    // N marcas nocturnas del MISMO instante (todas n=1) — para tally
    window.__night = (n, now) => Array.from({ length: n }, (_, i) => ({ n: 1, t: now - i * 500 }));
    // N marcas diurnas (todas n=0)
    window.__day = (n, now) => Array.from({ length: n }, (_, i) => ({ n: 0, t: now - i * 500 }));
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.nocturne && window.__dev.erudition && window.__dev.delve && window.__dev.kinship && window.__dev.focus && window.__dev.convoy && window.__dev.ward && window.__dev.wayfarerRoam && window.__dev.fellowship && window.__dev.trailcraft && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.nocturne + arc hooks (+kinship/focus) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.nocturne());
  ok("2 byte-id OFF (fresh boot): enabled false AND G.nocturne NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.noct === 0 && dark.boost === 0 && dark.goldFindMul === 0 && dark.tag === "" && dark.noctMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} boost=${dark.boost} tag="${dark.tag}"`);

  // 3 save OFF has no nocturne keys
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'nocturne'/'nocturneServer'/'nocturneMarks' key in save blob", !/"nocturne(Server|Marks)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.nocturne({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.nocturne({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installNoct(page);

  // 5 ★ tally pure fn — VM probe cross-checked against RE-DERIVED oracle
  const tallyData = await page.evaluate((QNOW) => {
    window.__dev.nocturne({ enabled: true });
    const win = 30000;
    const T = (marks) => window.__dev.nocturne({ tallyProbe: { marks, now: QNOW, windowMs: win } }).probe;
    const cases = {
      oneNight:  [{ n: 1, t: QNOW }],
      manyNight: [{ n: 1, t: QNOW - 4000 }, { n: 1, t: QNOW - 2000 }, { n: 1, t: QNOW }],
      allDay:    [{ n: 0, t: QNOW - 4000 }, { n: 0, t: QNOW - 2000 }, { n: 0, t: QNOW }],
      mixed:     [{ n: 1, t: QNOW - 3000 }, { n: 0, t: QNOW - 2000 }, { n: 1, t: QNOW }],   // 2 noche + 1 día ⇒ 2
      expired:   [{ n: 1, t: QNOW - 45000 }, { n: 1, t: QNOW }],   // 1 en ventana, 1 fuera
      empty:     [],
    };
    const vm = {}; for (const k in cases) vm[k] = T(cases[k]);
    return { cases, vm };
  }, QNOW);
  const tallyOracleOk = Object.keys(tallyData.cases).every(k => tallyData.vm[k] === oracleTally(tallyData.cases[k], QNOW, 30000));
  const tallyExpectOk = tallyData.vm.oneNight === 1 && tallyData.vm.manyNight === 3 && tallyData.vm.allDay === 0 && tallyData.vm.mixed === 2 && tallyData.vm.expired === 1 && tallyData.vm.empty === 0;
  ok("5 ★ TALLY = fn PURA (VM probe == oracle re-derivado): 1 noche⇒1; 3 noche⇒3; 3 DÍA⇒0 (n=0 nunca cuenta); mixto 2N+1D⇒2; fuera-ventana⇒excl; vacío⇒0",
     tallyOracleOk && tallyExpectOk, `vm=${JSON.stringify(tallyData.vm)}`);

  // 6 tier table — VM vs oracle over 5 noct cases
  const tab = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const lv of [6, 4, 2, 1, 0]) {
      window.__dev.nocturne({ clear: true, nowMs: QNOW });
      const s = window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: lv, pid: "self", atMs: QNOW, toZone: zone });
      out.push({ lv, noct: s.noct, tier: s.tier, boost: s.boost });
    }
    return { zone, out };
  }, QNOW);
  const tabOk = !tab.bad && tab.out.every(r => near(r.noct, r.lv) && r.tier === oracleTier(r.lv) && near(r.boost, oracleBoost(r.lv)));
  ok("6 TABLA de tiers = fn PURA de nocturne (VM == oracle): 6→T3+0.20; 4→T2+0.12; 2→T1+0.06; 1→T0; 0→T0",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 reflect + project — half-life decay vs oracle
  const refl = await page.evaluate((QNOW) => {
    window.__dev.nocturne({ enabled: true, self: "self" });
    window.__dev.nocturne({ clear: true, nowMs: QNOW });
    window.__dev.nocturne({ nowMs: QNOW, self: "self", push: { "obs-A": { noct: 8, atMs: QNOW }, peer: { noct: 5, atMs: QNOW } } });
    const at0 = window.__dev.nocturne({ nowMs: QNOW });
    const at25 = window.__dev.nocturne({ nowMs: QNOW + 25000 });
    const at50 = window.__dev.nocturne({ nowMs: QNOW + 50000 });
    return { a0: at0.noctMap["obs-A"], p0: at0.noctMap.peer, a25: at25.noctMap["obs-A"], a50: at50.noctMap["obs-A"] };
  }, QNOW);
  const reflOk = near(refl.a0, oracleDecay(8, 0)) && near(refl.p0, oracleDecay(5, 0)) &&
    near(refl.a25, oracleDecay(8, 25000), 0.02) && near(refl.a50, oracleDecay(8, 50000), 0.02);
  ok("7 SERVER-AUTH reflect+project: DECAY half-life 0-RNG (VM == oracle 0.5^(dt/hl): 8→4@25s→2@50s)",
     reflOk, JSON.stringify(refl));

  // 8 ★ accumulator = fn of TALLY (step): DAY kills ⇒ tally 0 ⇒ add 0; NIGHT kills sustained ⇒ accrue; 1-tick permanence
  const acc = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true }; const zone = w.zone;
    // independent VM cross-check of tally on the two mark sets (proves add-gate is driven by NIGHT tally)
    const tDay = window.__dev.nocturne({ tallyProbe: { marks: window.__day(4, QNOW), now: QNOW, windowMs: 30000 } }).probe;
    const tNight = window.__dev.nocturne({ tallyProbe: { marks: window.__night(4, QNOW), now: QNOW, windowMs: 30000 } }).probe;
    window.__nmarks("self", window.__day(4, QNOW));    // 4 marcas de DÍA (tally 0)
    window.__dev.nocturne({ toZone: zone });
    const dayStep = window.__nstep("self", 5);          // tally 0 < min ⇒ add 0 ⇒ noct stays 0
    window.__nmarks("self", window.__night(4, QNOW));  // 4 marcas de NOCHE (tally 4≥3) — clear resets noct to 0
    window.__dev.nocturne({ toZone: zone });
    const tick1 = window.__nstep("self", 0.5);          // 1-tick permanencia ⇒ noct≈0.5 < 2 ⇒ T0
    const s2 = window.__nstep("self", 1.5);             // cumulative noct ≈ 2.0
    const s3 = window.__nstep("self", 2);               // ≈ 4.0
    const s4 = window.__nstep("self", 2);               // ≈ 6.0
    return { zone, tDay, tNight, dayNoct: dayStep.noct, dayTier: dayStep.tier, tick1Noct: tick1.noct, tick1Tier: tick1.tier, s2Tier: s2.tier, s3Tier: s3.tier, s4Tier: s4.tier };
  }, QNOW);
  const accOk = !acc.bad && acc.tDay === 0 && acc.tNight === 4 &&
    near(acc.dayNoct, 0) && acc.dayTier === 0 &&
    acc.tick1Noct > 0 && acc.tick1Noct < 2 && oracleTier(acc.tick1Noct) === 0 && acc.tick1Tier === 0 &&
    acc.s2Tier >= 1 && acc.s3Tier >= 2 && acc.s4Tier === 3;
  ok("8 ★ ACUMULADOR = fn del TALLY NOCTURNO: kills de DÍA (tally0)⇒add 0 (jamás abre, eje TEMPORAL); 4 kills de NOCHE 1-tick dt=0.5⇒noct<2⇒T0 (permanencia, oracle); sostenido⇒T1→T2→T3",
     accOk, JSON.stringify(acc));

  // 9 ★ differentiator (WHEN you kill, not WHOM; opposite Erudition) + phase derivation PURE
  const diff = await page.evaluate((QNOW) => {
    // phase derivation cross-checked below in JS; here VM night/day for chosen t
    const pN1 = window.__dev.nocturne({ phaseProbe: 1080000 }).phaseProbe;   // phase 0.9 ⇒ night
    const pDay = window.__dev.nocturne({ phaseProbe: 600000 }).phaseProbe;   // phase 0.5 ⇒ day
    const pN2 = window.__dev.nocturne({ phaseProbe: 120000 }).phaseProbe;    // phase 0.1 ⇒ night (wraps midnight)
    // MISMO tipo repetido de NOCHE ⇒ abre (server derives n=isNightAt). 8 kills mismo t-stream de noche ⇒ tally 8.
    const w = window.__npick(6); const zone = w ? w.zone : null;
    window.__nkills("self", [QNOW - 6000, QNOW - 5000, QNOW - 4000, QNOW - 3000, QNOW - 2000, QNOW - 1000, QNOW - 500, QNOW], true);  // NIGHT via override 0.9
    const nightTally = window.__dev.nocturne({ nowMs: QNOW, self: "self" });
    const nightStep = window.__nstep("self", 6);   // sustained ⇒ opens
    window.__nkills("self", [QNOW - 6000, QNOW - 5000, QNOW - 4000, QNOW - 3000, QNOW - 2000, QNOW - 1000, QNOW - 500, QNOW], false);  // DAY via override 0.5
    const dayStep = window.__nstep("self", 6);     // tally 0 ⇒ never opens
    return { pN1, pDay, pN2, nightMap: nightTally.noctMap, nightTier: nightStep.tier, dayTier: dayStep.tier };
  }, QNOW);
  const phaseOk = diff.pN1 && near(diff.pN1.phase, oraclePhase(1080000), 1e-5) && diff.pN1.night === oracleIsNight(1080000) && diff.pN1.night === true &&
    diff.pDay && diff.pDay.night === oracleIsNight(600000) && diff.pDay.night === false &&
    diff.pN2 && diff.pN2.night === oracleIsNight(120000) && diff.pN2.night === true;
  const diffOk = phaseOk && diff.nightTier === 3 && diff.dayTier === 0;
  ok("9 ★ DIFERENCIADOR: matar el MISMO tipo 8× DE NOCHE⇒tally sube⇒ABRE (OPUESTO a Erudition que exige tipos distintos); cazar de DÍA⇒tally 0⇒NO abre (TEMPORAL); isNightAt PURA (0.9⇒noche,0.5⇒día,0.1⇒noche)",
     diffOk, JSON.stringify({ phaseOk, nightTier: diff.nightTier, dayTier: diff.dayTier }));

  // 10 ★ decay steps tier down — cross-check oracle at +hl and +2·hl
  const decay = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.nocturne({ clear: true, nowMs: QNOW });
    window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: 6, pid: "self", atMs: QNOW, toZone: zone });
    const a0 = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });
    const a25 = window.__dev.nocturne({ nowMs: QNOW + 25000, toZone: zone });
    const a50 = window.__dev.nocturne({ nowMs: QNOW + 50000, toZone: zone });
    return { d0: a0.noct, t0: a0.tier, b0: a0.boost, d25: a25.noct, t25: a25.tier, b25: a25.boost, d50: a50.noct, t50: a50.tier, b50: a50.boost };
  }, QNOW);
  // oracle: 6(T3+.20)→3@25s: tier(3)=T1(+.06); 6→1.5@50s: tier(1.5)=T0
  const decayOk = !decay.bad && near(decay.d0, 6) && decay.t0 === 3 && near(decay.b0, 0.20) &&
    near(decay.d25, oracleDecay(6, 25000), 0.02) && decay.t25 === oracleTier(oracleDecay(6, 25000)) && near(decay.b25, oracleBoost(oracleDecay(6, 25000))) && decay.t25 === 1 &&
    near(decay.d50, oracleDecay(6, 50000), 0.02) && decay.t50 === oracleTier(oracleDecay(6, 50000)) && decay.t50 === 0;
  ok("10 ★ DECAY 0-RNG vida-media (VM == oracle): 6(T3+.20)→3@25s(T1+.06)→1.5@50s(T0). El min crece por tier ⇒ decay baja el tier gradual",
     decayOk, JSON.stringify(decay));

  // 11 passive isolated
  const pass = await page.evaluate((QNOW) => {
    const w = window.__npick(4); if (!w) return { bad: true };   // T2 +12%
    const inz = window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone });
    const out = window.__dev.nocturne({ leave: true });
    return { zone: w.zone, inBoost: inz.boost, inTier: inz.tier, inMul: inz.goldFindMul, outBoost: out.boost, outTier: out.tier, outMul: out.goldFindMul };
  }, QNOW);
  ok("11 PASSIVE aislado (goldFind): en zona con noct4 ⇒ boost==tier.boost (T2=+0.12) == goldFindMul; leave ⇒ 0 + tier 0",
     !pass.bad && near(pass.inBoost, 0.12) && pass.inTier === 2 && near(pass.inMul, 0.12) && pass.outBoost === 0 && pass.outTier === 0 && pass.outMul === 0, JSON.stringify(pass));

  // 12 ★ channel goldFind wired + seam (grep seam + goldTick vs oracle)
  const simSrc = await page.evaluate(async () => (await fetch("sim/sim.js")).text());
  const seamWired = /function nocturneMul\(h,kind\)/.test(simSrc) &&
    /const gf=kinshipMul\(h,"goldFind"\)\+focusMul\(h,"goldFind"\)\+nocturneMul\(h,"goldFind"\);/.test(simSrc);
  const gold = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true };   // T3 +0.20, no kinship/focus ⇒ 0
    window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone });
    const on = window.__dev.nocturne({ goldTick: { base: 1000 } }).goldPicked;   // 1000·1.20 = 1200
    window.__dev.nocturne({ enabled: false });
    const off = window.__dev.nocturne({ goldTick: { base: 1000 } }).goldPicked;   // enabled false ⇒ nb 0 ⇒ 1000·(1+kinship+focus)
    const offTag = window.__dev.nocturne().tag;
    window.__dev.nocturne({ enabled: true });
    return { on, off, offTag };
  }, QNOW);
  const goldOk = !gold.bad &&
    gold.on.paid === Math.round(1000 * (1 + gold.on.kinshipBonus + gold.on.focusBonus + 0.20)) && near(gold.on.nocturneBonus, 0.20) &&
    gold.off.paid === Math.round(1000 * (1 + gold.off.kinshipBonus + gold.off.focusBonus)) && gold.off.nocturneBonus === 0 && gold.offTag === "";
  ok("12 ★ CANAL goldFind wired + seam tryPickup (grep g·(1+kinship+focus+nocturne) + VM==oracle): ON noct6⇒base1000·1.20=1200; OFF ⇒ paid==base·(1+kinship+focus) byte-id + tag \"\"",
     seamWired && goldOk, `wired=${seamWired} ${JSON.stringify(gold)}`);

  // 13 ★ DE-STACK máximo-único: KINSHIP O FOCUS abierto ⇒ NOCTURNE cede
  const destack = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.nocturne({ enabled: true, self: "self" });
    window.__dev.nocturne({ clear: true, nowMs: QNOW });
    window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: 6, pid: "self", atMs: QNOW, toZone: zone });
    const before = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });   // kinship+focus OFF ⇒ nocturneMul = 0.20
    // open KINSHIP goldFind in the SAME zone (kinshipMul(goldFind)>0 ⇒ NOCTURNE cedes)
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: QNOW });
    window.__dev.kinship({ nowMs: QNOW, push: { [zone]: { kinship: 6, atMs: QNOW } }, toZone: zone });
    const ks = window.__dev.kinship({ nowMs: QNOW, toZone: zone });
    const afterK = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });   // kinshipMul>0 ⇒ nocturneMul CEDES to 0
    const goldK = window.__dev.nocturne({ goldTick: { base: 1000 } }).goldPicked;   // paid = 1000·(1+kinship+0) — the MAX, not double
    window.__dev.kinship({ enabled: false });
    // open FOCUS goldFind (kinship off) ⇒ NOCTURNE cedes to FOCUS too
    window.__dev.focus({ enabled: true }); window.__dev.focus({ clear: true, nowMs: QNOW });
    window.__dev.focus({ nowMs: QNOW, focus: 6, zone, atMs: QNOW, toZone: zone });
    const fs = window.__dev.focus({ nowMs: QNOW, toZone: zone });
    const afterF = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });   // focusMul>0 ⇒ nocturneMul CEDES to 0
    window.__dev.focus({ enabled: false });
    return { zone, beforeMul: before.goldFindMul, beforeTier: before.tier, kinshipGold: ks.goldFindMul, afterKMul: afterK.goldFindMul, afterKTier: afterK.tier,
      goldK, focusGold: fs.goldFindMul, afterFMul: afterF.goldFindMul, afterFTier: afterF.tier };
  }, QNOW);
  const destackOk = !destack.bad && near(destack.beforeMul, 0.20) && destack.beforeTier === 3 &&
    destack.kinshipGold > 0 && destack.afterKMul === 0 && destack.afterKTier === 3 &&   // tier still 3 (noct unchanged) but MUL cedes to 0
    destack.goldK.nocturneBonus === 0 && near(destack.goldK.kinshipBonus, destack.kinshipGold) && destack.goldK.paid === Math.round(1000 * (1 + destack.kinshipGold)) &&
    destack.focusGold > 0 && destack.afterFMul === 0 && destack.afterFTier === 3;
  ok("13 ★ DE-STACK máximo-único: KINSHIP #60 abierto (goldFind>0)⇒NOCTURNE CEDE (0.20→0, aplica el MAYOR); paid=1000·(1+kinship) (NO doble-dip). Idem FOCUS #62. KINSHIP>FOCUS>NOCTURNE",
     destackOk, JSON.stringify(destack));

  // 14 ★ orthogonality ⊥ 6 other channels
  const orth = await page.evaluate((QNOW) => {
    const w = window.__npick(6); if (!w) return { bad: true }; const zone = w.zone;
    window.__dev.kinship({ enabled: false }); window.__dev.focus({ enabled: false });   // ensure no de-stack interference
    const a = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });
    const noctBefore = a.goldFindMul, restedBefore = a.restedXpMult;
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: QNOW });
    window.__dev.convoy({ nowMs: QNOW, push: { [zone]: { march: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: QNOW });
    window.__dev.ward({ nowMs: QNOW, push: { [zone]: { ward: 6, atMs: QNOW } }, toZone: zone });
    window.__dev.wayfarerRoam({ enabled: true, self: "self" }); window.__dev.wayfarerRoam({ clear: true, nowMs: QNOW });
    window.__dev.wayfarerRoam({ nowMs: QNOW, self: "self", push: { self: [{ c: "0,0", t: QNOW }, { c: "1,0", t: QNOW }, { c: "2,0", t: QNOW }, { c: "3,0", t: QNOW }] }, toZone: zone });
    window.__dev.fellowship({ enabled: true, nowMs: QNOW });
    window.__dev.trailcraft({ enabled: true, self: "self" }); window.__dev.trailcraft({ clear: true, nowMs: QNOW });
    window.__dev.trailcraft({ nowMs: QNOW, self: "self", craft: 6, pid: "self", atMs: QNOW, toZone: zone });
    window.__dev.delve({ enabled: true, self: "self" }); window.__dev.delve({ clear: true, nowMs: QNOW });
    window.__dev.delve({ nowMs: QNOW, self: "self", delve: 6, bands: 5, pid: "self", atMs: QNOW, toZone: zone });
    window.__dev.erudition({ enabled: true, self: "self" }); window.__dev.erudition({ clear: true, nowMs: QNOW });
    window.__dev.erudition({ nowMs: QNOW, self: "self", lore: 6, pid: "self", atMs: QNOW, toZone: zone });
    window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: 6, pid: "self", atMs: QNOW, toZone: zone });   // re-assert self (drivers changed self)
    const b = window.__dev.nocturne({ nowMs: QNOW, toZone: zone });
    window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false }); window.__dev.fellowship({ enabled: false }); window.__dev.trailcraft({ enabled: false }); window.__dev.delve({ enabled: false }); window.__dev.erudition({ enabled: false });
    return { zone, channel: a.channel, noctBefore, restedBefore, noctAfter: b.goldFindMul, restedAfter: b.restedXpMult, xpAfter: b.xpGainMul, wardAfter: b.wardRegenMul, oocAfter: b.oocMitigMul, lootAfter: b.lootQualityFloor, critAfter: b.critBonusPct };
  }, QNOW);
  // INVARIANTE clave: el bono goldFind de NOCTURNE (0.20) queda INTACTO con los 7 acumuladores rivales al máximo (noctAfter==noctBefore). Que restedMult SUBA (1.5→1.65) es CONVOY haciendo SU trabajo en SU canal ⇒ prueba que restedMult es un seam SEPARADO (responde a convoy, no a nocturne). Los 7 canales encendidos ⇒ test significativo.
  const orthOk = !orth.bad && orth.channel === "goldFind" && near(orth.noctBefore, 0.20) && near(orth.noctAfter, orth.noctBefore) &&
    orth.restedAfter > 0 && orth.xpAfter > 0 && orth.wardAfter > 0 && orth.oocAfter > 0 && orth.lootAfter !== "" && orth.critAfter > 0;
  ok("14 ★ ORTOGONALIDAD goldFind ⊥ restedMult ⊥ xpGain ⊥ wardRegen ⊥ oocMitigation ⊥ lootQuality ⊥ critChance: el bono goldFind de nocturne (0.20) queda INTACTO con los 7 acumuladores rivales al máximo (0.20→0.20); cada canal rival responde SÓLO a su propio seam (0 doble-conteo)",
     orthOk, JSON.stringify(orth));

  // 15 ★ 0-regression: 18 arc flags LIVE, NOCTURNE_HUNT dark
  const cfgSrc = await page.evaluate(async () => (await fetch("sim/config.js")).text());
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["CONGREGATION", "WAYFARER_TRAIL", "WORLD_PULSE", "SOUL_RECOVERY", "DIVERSE_COMPANY", "LONG_WATCH", "FRONTIER_SPREAD", "INFLUX_SURGE", "FELLOWSHIP_BOND", "BATTLE_SYNC", "CONVOY_MARCH", "WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  ok("15 ★ 0-REGRESIÓN: 18 flags del arco served enabled:true (incl. ERUDITION #65 LIVE); NOCTURNE_HUNT served false (DARK #66)",
     arcAllOn && flag("NOCTURNE_HUNT") === "false" && arc.length === 18, `nocturne=${flag("NOCTURNE_HUNT")} arc=${JSON.stringify(arcLive)}`);

  // 16 ★ 6 zones host the passive
  const zonesRes = await page.evaluate((QNOW) => {
    window.__dev.nocturne({ enabled: true, self: "self" });
    const zones = window.__dev.nocturne().zones; const broken = [];
    for (const z of zones) {
      window.__dev.nocturne({ clear: true, nowMs: QNOW });
      const s = window.__dev.nocturne({ nowMs: QNOW, self: "self", noct: 6, pid: "self", atMs: QNOW, toZone: z });
      if (!(s.zone === z && s.huntable && s.tier === 3 && Math.abs(s.boost - 0.20) < 1e-9)) broken.push(z);
    }
    return { zones, broken };
  }, QNOW);
  ok("16 ★ NOCTURNE 6 zonas: las 6 zonas de NOCTURNE_HUNT.zones hospedan el pasivo (noct6⇒T3, boost 0.20) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 17 render badge "Nocturno:" ON / not OFF + fps
  const badge = await page.evaluate(async (QNOW) => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Nocturno:") >= 0) cnt++; return orig(t, x, y); };
    const w = window.__npick(6); window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.nocturne({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, QNOW);
  ok("17 render badge \"Nocturno:\" se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano (colon único, no colisiona)",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  await page.evaluate((QNOW) => { const w = window.__npick(6); window.__dev.nocturne({ nowMs: QNOW, toZone: w.zone }); }, QNOW);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 18 ★ NORTH STAR — 2-client convergence + per-pid independence
  await page.evaluate(() => window.__dev.nocturne({ enabled: false }));
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installNoct(pageB);
  const northStar = await (async () => {
    const zone = await page.evaluate(() => (window.__dev.nocturne({ enabled: true }).zones || [])[3]);   // idx3 (re-labeled vs GE)
    const readAs = async (self, elapsedSec) => {
      const inj = (pg) => pg.evaluate(({ self, elapsedSec, zone, QNOW }) => {
        window.__dev.nocturne({ enabled: true, self });
        window.__dev.nocturne({ clear: true, nowMs: QNOW });
        const s = window.__dev.nocturne({ nowMs: QNOW + (elapsedSec || 0) * 1000, self, push: {
          "obs-A": { noct: 6, atMs: QNOW }, "obs-B": { noct: 2, atMs: QNOW }, peer: { noct: 6, atMs: QNOW },
        }, toZone: zone });
        return { self: s.self, noct: s.noct, tier: s.tier, boost: s.boost, nowMs: s.nowMs, map: s.noctMap };
      }, { self, elapsedSec, zone, QNOW });
      const [a, b] = await Promise.all([inj(page), inj(pageB)]);
      return { a, b, eq: JSON.stringify(a) === JSON.stringify(b) };
    };
    const shared = await readAs("peer", 0);
    const decayed = await readAs("peer", 25);
    const indep = await (async () => {
      const push = { "obs-A": { noct: 6, atMs: QNOW }, "obs-B": { noct: 2, atMs: QNOW } };
      const rA = await page.evaluate(({ zone, QNOW, push }) => { window.__dev.nocturne({ enabled: true, self: "obs-A" }); window.__dev.nocturne({ clear: true, nowMs: QNOW }); const s = window.__dev.nocturne({ nowMs: QNOW, self: "obs-A", push, toZone: zone }); return { self: s.self, tier: s.tier, boost: s.boost, map: s.noctMap }; }, { zone, QNOW, push });
      const rB = await pageB.evaluate(({ zone, QNOW, push }) => { window.__dev.nocturne({ enabled: true, self: "obs-B" }); window.__dev.nocturne({ clear: true, nowMs: QNOW }); const s = window.__dev.nocturne({ nowMs: QNOW, self: "obs-B", push, toZone: zone }); return { self: s.self, tier: s.tier, boost: s.boost, map: s.noctMap }; }, { zone, QNOW, push });
      return { rA, rB, mapEq: JSON.stringify(rA.map) === JSON.stringify(rB.map) };
    })();
    const aLeaves = await page.evaluate(() => { const s = window.__dev.nocturne({ leave: true }); return { boost: s.boost, tier: s.tier, map: s.noctMap, noct: s.noct }; });
    const bIntact = await pageB.evaluate(({ zone, QNOW }) => { const s = window.__dev.nocturne({ nowMs: QNOW, self: "obs-B", toZone: zone }); return { boost: s.boost, tier: s.tier, noct: s.noct }; }, { zone, QNOW });
    return { zone, shared, decayed, indep, aLeaves, bIntact };
  })();
  const nsOk = northStar.shared.eq && northStar.shared.a.tier === 3 && near(northStar.shared.a.noct, 6) && near(northStar.shared.a.boost, 0.20) &&
    northStar.decayed.eq && northStar.decayed.a.tier === 1 && near(northStar.decayed.a.noct, oracleDecay(6, 25000), 0.02) && near(northStar.decayed.a.boost, 0.06) &&
    northStar.indep.mapEq && northStar.indep.rA.tier === 3 && near(northStar.indep.rA.boost, 0.20) && northStar.indep.rB.tier === 1 && near(northStar.indep.rB.boost, 0.06) &&
    northStar.aLeaves.boost === 0 && northStar.aLeaves.tier === 0 && (northStar.aLeaves.map && (northStar.aLeaves.map["obs-A"] || 0) > 0) && near(northStar.aLeaves.noct, 6) &&
    near(northStar.bIntact.boost, 0.06) && northStar.bIntact.tier === 1;
  ok("18 ★ NORTH STAR — 2-CLIENTE: MISMO snapshot+reloj ⇒ noct/tier/boost byte-idénticos (peer T3+.20, decae T1+.06); per-pid (A=T3 vs B=T1 indep, mapa idéntico); A sale ⇒ boost 0 PERO noctMap + Δ_B INTACTOS (0 desync)",
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
