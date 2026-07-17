// CAS-2601 — EVO#101 LUNGE_SURGE (Remate de Acometida) DARK QA (Gate 2/2 input) — 43º flag candidate. Base master HEAD dcffd95.
// INDEPENDENT QA harness: re-derives EVERY oracle at the Node level from the imported knobs (LUNGE_SURGE + ETPL + peer
// surges) — it does NOT copy the GE seam math nor the GE cas2600-lunge-selfverify file. It then cross-checks the browser
// server-auth probes (__dev.lunge / __dev.spawnKill) against those re-derived oracles.
//
// AXIS (⊥42): BASE LUNGE / POUNCE DISTANCE of the mob TYPE, server-auth STATIC (how far its FACTORY type dashes to close
//   distance on its rusher lunge). lungeWeight(victim) = band of lungeOf(e)=ETPL[e.type].lunge (immutable base row):
//   lunge≥hiLunge(130) ⇒ pouncer ⇒ 2 (bandit132); lunge≥midLunge(110) ⇒ mid-lunge ⇒ 1 (wolf118/mudlurker126); lunge<mid ⇒
//   0 (bat96 + every melee-static without a lunge field). Only 4 types carry lunge. Fresh channel lungeFind → h.lungeBounty
//   (transient, STATELESS), sub-cap lungeBountyCap:2, badge "Acometida" (↠). Score sampled at TOP of killEnemy (_lungePre).
//   PRE-FLIGHT PASSES with NO pivot: the ONLY reader of .lunge is the AI MOVEMENT machine (lspd=(e.tpl.lunge||110)/0.2, the
//   special dash speed) — never a kill reward; no *Weight of the 42 live flags #59-#100 reads lunge as SCORE. INTERRUPT #89
//   reads e.specialNow/e.state (the STATE category), never the NUMBER .lunge.
//   ⊥ override/#74/champion/élite: lungeOf reads ETPL[type].lunge BASE, NOT the clone e.tpl.lunge; applyZoneScale never
//   scales lunge ⇒ pounce zone-independent (⊥#91). CRUX ⊥#93 ROLE: the 4 lunge-carriers are ALL arch:"rusher" yet lunge
//   sweeps 0/1/2 ⇒ lunge is NOT a re-map of arch.
//
// GATES (map to the 5 task QA gates):
//   1  boot + __dev.lunge + peer hooks + spawnKill + saveBlob + worldFingerprint + __BUILD, 0 err
//   2  byte-neutral OFF (fresh boot): enabled false, gExists false (G.lungeBounty never created), all-zero, tag "" (gate 1)
//   3  STATELESS: save blob has NO lungeBounty/lungeFind key (task gate 1/5)
//   4  worldFingerprint byte-stable across enabled toggle (tokens NOT in fp; 0 RNG drift) (task gate 5)
//   5  lungeProbe LUT: lunge→band→weight == oracle across 130/110/109 exact edges (task gate 2)
//   6  scoreProbe LUT: score→tier→charge == oracle table + sub-cap headroom (task gate 2)
//   7  REAL spawnLunge over ALL ETPL rows: browser lungeWeight == oWeightType(ETPL[type].lunge) BASE (task gate 2)
//   8  ⊥ DECOUPLING (⊥override/⊥#74/⊥champion/⊥élite): overrideLunge scales the CLONE ⇒ lungeOf reads BASE, IGNORES clone:
//        bandit base132 clone50 stays 2; wolf base118 clone200 stays 1 (task gate 3)
//   9  CRUX ⊥#93 role / ⊥#94 swift / ⊥#100 recover / ⊥#99 windup / ⊥#98 ram — re-derived from peer knobs (task gate 3)
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ Δh.lungeBounty == oGrant(type); sub-cap 2 (gate 2)
//   11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0 (task gate 1) — the byte-neutral killEnemy proof
//   12 0-REGRESSION: 42 arc flags #59-#100 served enabled:true; LUNGE_SURGE served false (DARK #101), off=[] (task gate 4)
//   13 NORTH STAR 2-client: A==B (score/tier/charge + lungeProbeLive + LUTs + worldFingerprint + terrHash) + oracle (gate 5)
//   14 NORTH STAR fp==15920977 + terrHash==2105484439, A==B (shared deterministic world) (task gate 5)
//   0  no JS errors during the run
//
// Run: node tools/cas2601-lunge-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { LUNGE_SURGE, ETPL, SWIFT_SURGE, RAM_SURGE, WINDUP_SURGE, RECOVER_SURGE } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (LUNGE_SURGE.hiLunge != null) ? +LUNGE_SURGE.hiLunge : 130;
const MID = (LUNGE_SURGE.midLunge != null) ? +LUNGE_SURGE.midLunge : 110;
const WP = +(LUNGE_SURGE.weights && LUNGE_SURGE.weights.pouncer) || 0;   // salto largo / pouncer
const WL = +(LUNGE_SURGE.weights && LUNGE_SURGE.weights.lunger) || 0;    // estocada media
const TIERS = (LUNGE_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, LUNGE_SURGE.lungeBountyCap | 0);
// oBand: lunge → band label.
const oBand = (l) => (l >= HI ? "pouncer" : l >= MID ? "lunger" : "short");
// oWeight: lunge → weight. pouncer⇒WP(2); lunger⇒WL(1); short⇒0.
const oWeight = (l) => (l >= HI ? WP : l >= MID ? WL : 0);
// oLunge: BASE lunge of a real ETPL type → number (undefined ⇒ 0, mirroring lungeOf's fallback).
const oLunge = (type) => { const t = ETPL[type]; return t && t.lunge != null ? +t.lunge : 0; };
const oWeightType = (type) => oWeight(oLunge(type));
// oRank: 1-based index of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank. neutral ⇒ 0.
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axis bands (swift/ram/windup/recover) re-derived independently from THEIR imported knobs to prove orthogonality.
const band3 = (v, hi, mid) => (v >= hi ? 2 : v >= mid ? 1 : 0);
const swiftBand = (s) => band3(s, +SWIFT_SURGE.hiSpd, +SWIFT_SURGE.midSpd);
const ramBand = (k) => band3(k, +RAM_SURGE.hiKnock, +RAM_SURGE.midKnock);
const windBand = (w) => band3(w, +WINDUP_SURGE.hiWind, +WINDUP_SURGE.midWind);
const recoverBand = (r) => band3(r, +RECOVER_SURGE.hiRecover, +RECOVER_SURGE.midRecover);

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2601-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash of the shared deterministic world

console.log(`[QA oracle] hiLunge=${HI} midLunge=${MID} wPouncer=${WP} wLunger=${WL} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${LUNGE_SURGE.enabled} channel=${LUNGE_SURGE.channel} radius=${LUNGE_SURGE.radius}`);

// Deterministic forest tile (same seed ⇒ same rects every client).
const Z = { forest: [192, 723] };
// lunge sweep around both thresholds (independent of any real type). Covers 110/130 exact boundaries.
const LUNGE_SWEEP = [0, 96, 109, 110, 111, 118, 126, 129, 130, 131, 132, 200];
// score sweep for the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 99];
// EVERY lunge-bearing row in ETPL + a representative set of no-lunge types (undefined ⇒ 0).
const LUNGE_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].lunge != null);
const NO_LUNGE = ["golem", "moose", "summoner", "skeleton", "orc", "charger", "mage", "rat"].filter(t => ETPL[t] && ETPL[t].lunge == null);
const ALL_TYPES = [...LUNGE_TYPES, ...NO_LUNGE];

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

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // 1 boot + hooks
  const build = await page.evaluate(() => window.__BUILD || null);
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.lunge && window.__dev.swift && window.__dev.ram && window.__dev.wind && window.__dev.recover && window.__dev.role && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play; __dev.lunge + peer hooks (swift/ram/wind/recover/role) + spawnKill + saveBlob + worldFingerprint + __BUILD present; 0 err",
     hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.lunge());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.lungeBounty nunca creado), score/tier/charge/preview 0, tag \"\", channel lungeFind, cap 2",
     dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0 &&
     dark.forageChargePreview === 0 && dark.tag === "" && dark.channel === "lungeFind" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" channel=${dark.channel} cap=${dark.cap} hiLunge=${dark.hiLunge} midLunge=${dark.midLunge} weights=${JSON.stringify(dark.weights)}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"lungeBounty"\s*:/.test(saveOff) && !/"lungeFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave lungeBounty/lungeFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.lunge({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.lunge({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas de acometida NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // 5 lungeProbe LUT sweep (thresholds 130/110)
  const ln = await page.evaluate((sweep) => sweep.map(l => { const p = window.__dev.lunge({ lungeProbe: { lunge: l } }).lungeProbe; return { l, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), LUNGE_SWEEP);
  const lnBad = ln.filter(r => r.band !== oBand(r.l) || r.weight !== oWeight(r.l) || (r.tier != null && r.tier !== oRank(oWeight(r.l))) || (r.charge != null && r.charge !== oCharge(oWeight(r.l), true)));
  ok(`5 lungeProbe LUT: lunge→band→weight == oracle en el sweep de umbral (${LUNGE_SWEEP.length} pts: bordes exactos 109/110 y 129/130)`,
     lnBad.length === 0, lnBad.length ? JSON.stringify(lnBad.map(r => ({ l: r.l, got: [r.band, r.weight], exp: [oBand(r.l), oWeight(r.l)] }))) : `all ${LUNGE_SWEEP.length} match`);

  // 6 scoreProbe LUT table
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.lunge({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  ok(`6 scoreProbe LUT: score→tier→charge == oracle table + sub-cap (${SCORES.length} pts; charge≤cap ${CAP})`,
     scBad.length === 0, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `all match; sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // 7 REAL spawnLunge over ALL ETPL types
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.lunge({ enabled: true });
    const out = {};
    for (const t of types) {
      window.__dev.lunge({ clearLunge: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const r = window.__dev.lunge({ spawnLunge: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnLunge;
      const lp = window.__dev.lunge({ lungeProbeLive: true }).lungeProbeLive;
      const mine = lp.mobs.find(m => m.type === t) || null;
      out[t] = { lunge: r.lunge, weight: r.weight, valid: r.valid, lpW: mine ? mine.weight : -1, lpLunge: mine ? mine.lunge : -1 };
    }
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => !spawn7[t].valid || spawn7[t].lunge !== oLunge(t) || spawn7[t].weight !== oWeightType(t) || spawn7[t].lpW !== oWeightType(t) || spawn7[t].lpLunge !== oLunge(t));
  ok(`7 REAL spawnLunge sobre las ${ALL_TYPES.length} filas de ETPL (${LUNGE_TYPES.length} con lunge + ${NO_LUNGE.length} sin): browser lungeWeight == oWeightType(ETPL[type].lunge) BASE (server-auth)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, lunge: oLunge(t), exp: oWeightType(t), got: spawn7[t] }))) : `all match; bandit=${spawn7.bandit.weight} wolf=${spawn7.wolf.weight} mudlurker=${spawn7.mudlurker.weight} bat=${spawn7.bat.weight} golem=${spawn7.golem.weight}`);

  // 8 ⊥ DECOUPLING: overrideLunge on the CLONE must NOT move the band (lungeOf reads BASE)
  const dec = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: true });
    const run = (type, ov) => { window.__dev.lunge({ clearLunge: true });
      window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const r = window.__dev.lunge({ spawnLunge: { type, tx: Z.forest[0], ty: Z.forest[1], overrideLunge: ov } }).spawnLunge;
      const lp = window.__dev.lunge({ lungeProbeLive: true }).lungeProbeLive;
      const mine = lp.mobs.find(m => m.type === type) || null;
      return { base: r.lunge, cloneLunge: r.tplLunge, weight: r.weight, lpW: mine ? mine.weight : -99 }; };
    const banditElite = run("bandit", 50);   // base 132, elite deflates clone to 50 — lunge must stay 2
    const wolfElite = run("wolf", 200);       // base 118, elite inflates clone to 200 — lunge must stay 1
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false });
    return { banditElite, wolfElite };
  }, Z);
  const decOK = dec.banditElite.base === 132 && dec.banditElite.cloneLunge === 50 && dec.banditElite.weight === WP && dec.banditElite.lpW === WP &&
    dec.wolfElite.base === 118 && dec.wolfElite.cloneLunge === 200 && dec.wolfElite.weight === WL && dec.wolfElite.lpW === WL;
  ok("8 ⊥ DESACOPLE (⊥override/⊥#74/⊥campeón/⊥élite): overrideLunge escala el CLON e.tpl.lunge mimetizando un spawn escalado/élite/variante-stalker — lungeOf lee BASE ETPL[type].lunge ⇒ bandit base132 clon50 SIGUE lunge2; wolf base118 clon200 SIGUE lunge1 ⇒ ACOMETIDA (base estático) ⊥ élite/campeón (clon dinámico)",
     decOK, JSON.stringify(dec));

  // 9 CRUX cross-axis (⊥#93 role / ⊥#94 swift / ⊥#100 recover / ⊥#99 windup / ⊥#98 ram) — pure data re-derived from peer knobs
  const D = (t) => ({ lunge: oWeightType(t), swift: swiftBand(+ETPL[t].spd), ram: ramBand(+ETPL[t].knock), wind: windBand(+ETPL[t].windup), recover: recoverBand(+ETPL[t].recover), arch: ETPL[t].arch, spd: +ETPL[t].spd, lungeRaw: oLunge(t) });
  const bat = D("bat"), wolf = D("wolf"), mudlurker = D("mudlurker"), bandit = D("bandit"), golem = D("golem"), moose = D("moose");
  const cruxOK =
    // ⊥#93 ROLE (arch): the 4 lunge-carriers all arch:"rusher" IDENTICAL, yet lunge sweeps 0/1/1/2 ⇒ NOT a re-map of arch (STRONGEST)
    bat.arch === "rusher" && wolf.arch === "rusher" && mudlurker.arch === "rusher" && bandit.arch === "rusher" &&
    bat.lunge === 0 && wolf.lunge === 1 && mudlurker.lunge === 1 && bandit.lunge === 2 &&
    // ⊥#94 SWIFT (base spd): within swift2 — bat spd158 swift2/lunge0 vs wolf spd128 swift2/lunge1 — SAME swift OPPOSITE lunge
    bat.swift === 2 && bat.lunge === 0 && wolf.swift === 2 && wolf.lunge === 1 &&
    // ⊥#100 RECOVER (base recover): bandit recover0.55 recov0/lunge2 vs golem recover0.8 recov2/lunge0 — OPPOSED
    bandit.recover === 0 && bandit.lunge === 2 && golem.recover === 2 && golem.lunge === 0 &&
    // ⊥#99 WINDUP (base windup): bandit windup0.5 wind0/lunge2 vs golem windup0.95 wind2/lunge0 — OPPOSED
    bandit.wind === 0 && bandit.lunge === 2 && golem.wind === 2 && golem.lunge === 0 &&
    // ⊥#98 RAM (base knock): moose knock200 ram2/lunge0 vs bandit knock110 ram1/lunge2 — ORDER OPPOSED
    moose.ram === 2 && moose.lunge === 0 && bandit.ram === 1 && bandit.lunge === 2;
  ok("9 ⊥ CRUX cross-axis: 4 lunge-carriers TODOS arch:\"rusher\" pero lunge 0/1/1/2 (⊥#93 ROLE, el más firme); bat swift2/lunge0 vs wolf swift2/lunge1 MISMO swift OPUESTO (⊥#94); bandit recov0/lunge2 vs golem recov2/lunge0 OPUESTO (⊥#100); bandit wind0/lunge2 vs golem wind2/lunge0 OPUESTO (⊥#99); moose ram2/lunge0 vs bandit ram1/lunge2 ORDEN OPUESTO (⊥#98)",
     cruxOK, JSON.stringify({ bat, wolf, mudlurker, bandit, golem, moose }));

  // 10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam → Δh.lungeBounty  [independent of GE probe-only]
  const GRANT_TYPES = ["bandit", "wolf", "mudlurker", "bat", "golem", "moose", "summoner", "skeleton", "orc", "charger", "rat"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.lunge({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.lunge().hero.lungeBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives lunge seam
      const after = window.__dev.lunge().hero.lungeBounty | 0;
      out[t] = after - before;
    }
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.lungeBounty == oGrant(type) por banda (pouncer bandit+2; estocada media wolf/mudlurker+1; corto/sin lunge bat/golem/moose/summoner/skeleton/orc/charger/rat+0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF — THE byte-neutral killEnemy proof
  const offGrant = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: false });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.lunge().hero.lungeBounty | 0;
    window.__dev.spawnKill("bandit");                   // pouncer, but flag OFF ⇒ dead branch, no bank
    window.__dev.spawnKill("wolf");
    const after = window.__dev.lunge().hero.lungeBounty | 0;
    const gExists = window.__dev.lunge().gExists;
    return { before, after, delta: after - before, gExists };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(bandit)+spawnKill(wolf) con flag OFF ⇒ Δh.lungeBounty == 0 Y gExists false (rama muerta, 0 fichas al seam ⇒ killEnemy byte-idéntico al HEAD)",
     offGrant.delta === 0 && offGrant.gExists === false, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 42 arc flags served true; LUNGE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const lungeDark = flag("LUNGE_SURGE") === "false";
  ok("12 0-REGRESIÓN: 42 flags del arco #59-#100 served enabled:true; LUNGE_SURGE served false (DARK #101), off=[]",
     arcOff.length === 0 && lungeDark && arc.length === 42, `lunge=${flag("LUNGE_SURGE")} n=${arc.length} off=${JSON.stringify(arcOff)}`);

  // screenshot evidence (ON + bandit pouncer in radius)
  await page.evaluate((Z) => { window.__dev.lunge({ enabled: true }); window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false }); });

  // 13/14 NORTH STAR — 2-client convergence
  await sleep(400);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();   // headless throttles rAF in background ⇒ boot hangs unless foregrounded
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.lunge({ enabled: true }); window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.lunge();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.lunge({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [0, 96, 109, 110, 118, 126, 129, 130, 132].map(l => window.__dev.lunge({ lungeProbe: { lunge: l } }).lungeProbe.weight);
    const lp = window.__dev.lunge({ lungeProbeLive: true }).lungeProbeLive;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, lpScore: lp.score,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.lpScore === B.lpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const banditMax = A.lpScore === oWeightType("bandit") && B.lpScore === oWeightType("bandit");
  const oracleMatch = A.score === oWeightType("bandit") && A.charge === oCharge(oWeightType("bandit"), true) &&
    A.bands === JSON.stringify([0, 96, 109, 110, 118, 126, 129, 130, 132].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO bandit+héroe ⇒ score/tier/charge + lpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle",
     conv && banditMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
     `A={s:${A.score},t:${A.tier},c:${A.charge},lpScore:${A.lpScore},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},lpScore:${B.lpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} banditMax=${banditMax} oracleMatch=${oracleMatch}`);
  ok(`14 NORTH STAR fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido)`,
     A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
     `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await pageB.screenshot({ path: join(OUT, "client-b-lunge.png") });
  await page.evaluate(() => window.__dev.lunge({ enabled: false }));
  await pageB.evaluate(() => window.__dev.lunge({ enabled: false }));

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

  console.log(`\nfp observado=${A.fpLen} (esperado ${EXPECT_FP}) · terrHash=${A.terrHash} (esperado ${EXPECT_TERRHASH}) · 2-cli fpMatch=${A.fp === B.fp} · served build=${build} · grants=${JSON.stringify(grant)}`);
} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
