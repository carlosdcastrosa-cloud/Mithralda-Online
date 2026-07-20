// CAS-2612 — EVO#102 GEARCHANCE_SURGE (Remate de Pertrecho) DARK QA (Gate 2/2 input) — 44º flag candidate. Base master HEAD 9e7563e.
// INDEPENDENT QA harness: re-derives EVERY oracle at the Node level from the imported knobs (GEARCHANCE_SURGE + ETPL + peer
// surges) — it does NOT copy the GE seam math nor the GE tools/cas2611-gear-selfverify.mjs file. It then cross-checks the
// browser server-auth probes (__dev.gearchance / __dev.spawnKill) against those independently re-derived oracles.
//
// AXIS (⊥43): BASE gearChance / equipment-DROP PROBABILITY of the mob TYPE, server-auth STATIC (how kitted-out its FACTORY
//   type is). gearWeight(victim) = band of gearOf(e)=ETPL[e.type].gearChance (immutable base row, NOT the clone e.tpl.gearChance
//   which affix/Forge/champion could elevate via gearBonus): gearChance≥hiGear(0.30) ⇒ arsenal ⇒ 2; gearChance≥midGear(0.22)
//   ⇒ kitted ⇒ 1; gearChance<midGear ⇒ bare ⇒ 0. Fresh channel gearFind → h.gearBounty (transient, STATELESS, out of
//   save+fingerprint), sub-cap gearBountyCap:2, badge "⚙". Score sampled at TOP of killEnemy (_gearPre) with the victim's LIVE type.
//   PRE-FLIGHT PASSES with NO pivot: .gearChance is read ONLY by (a) the loot DROP ROLL (srand()<tpl.gearChance*mul — probability,
//   inside the loot branch), (b) affix/Forge modifiers that ADD gearBonus to the CLONE, (c) dev probes — never a *Weight/reward SCORE.
//   CRUX ⊥#72 SCARCITY: #72 reads ETPL[type].xp as reward MAGNITUDE (essence), NOT gearChance; within the kitted band (gear1)
//   xp sweeps 20→38 (skeleton xp20/gc0.22 vs emberkin xp38/gc0.26 SAME gearWeight1) ⇒ not co-monotone ⇒ ⊥#72.
//
// GATES (map to the 6 task QA checks):
//   1  boot + __dev.gearchance + spawnKill + saveBlob + worldFingerprint + __BUILD, 0 err
//   2  byte-neutral OFF (fresh boot): enabled false, gExists false (G.gearBounty never created), all-zero, tag "" (check 1)
//   3  STATELESS: save blob has NO gearBounty/gearFind key (check 1)
//   4  worldFingerprint byte-stable across enabled toggle (tokens NOT in fp; 0 RNG drift) (check 1)
//   5  gearProbe LUT: gearChance→band→weight == oracle at exact edges 0.30/0.22/0.21 (check 3)
//   6  scoreProbe LUT: score→tier→charge == oracle table + sub-cap 2 (check 3)
//   7  REAL spawnGear over ALL ETPL rows: browser gearWeight == oWeightType(ETPL[type].gearChance) BASE (check 4)
//   8  ⊥override / server-auth: overrideGear scales the CLONE ⇒ gearOf reads BASE, IGNORES clone (check 4)
//   9  CRUX ⊥#101 lunge / ⊥#100 recover / ⊥#99 windup / ⊥#98 ram / ⊥#97 sentinel / ⊥#94 swift / ⊥#72 scarcity — re-derived from peer knobs (check 5)
//   10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam ⇒ Δh.gearBounty == oGrant(type); sub-cap 2 (check 4)
//   11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0 (check 1) — the byte-neutral killEnemy proof
//   12 0-REGRESSION: 43 arc flags #59-#101 served enabled:true; GEARCHANCE_SURGE served false (DARK #102), off=[] (check 2)
//   13 NORTH STAR 2-client: A==B (score/tier/charge + gearProbeLive + LUTs + worldFingerprint + terrHash) + oracle (check 6)
//   14 NORTH STAR fp==15920977 + terrHash==2105484439, A==B (shared deterministic world) (check 6)
//   0  no JS errors during the run
//
// Run: node tools/cas2612-gear-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { GEARCHANCE_SURGE, ETPL, SWIFT_SURGE, RAM_SURGE, WINDUP_SURGE, RECOVER_SURGE, SENTINEL_SURGE, LUNGE_SURGE } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from imported knobs — NOT copied from GE seam/harness) ----
const HI = (GEARCHANCE_SURGE.hiGear != null) ? +GEARCHANCE_SURGE.hiGear : 0.30;
const MID = (GEARCHANCE_SURGE.midGear != null) ? +GEARCHANCE_SURGE.midGear : 0.22;
const WA = +(GEARCHANCE_SURGE.weights && GEARCHANCE_SURGE.weights.arsenal) || 0;  // bien-armado
const WK = +(GEARCHANCE_SURGE.weights && GEARCHANCE_SURGE.weights.kitted) || 0;   // pertrecho medio
const TIERS = (GEARCHANCE_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, GEARCHANCE_SURGE.gearBountyCap | 0);
// oBand: gearChance → band label.
const oBand = (g) => (g >= HI ? "arsenal" : g >= MID ? "kitted" : "bare");
// oWeight: gearChance → weight. arsenal⇒WA(2); kitted⇒WK(1); bare⇒0.
const oWeight = (g) => (g >= HI ? WA : g >= MID ? WK : 0);
// oGear: BASE gearChance of a real ETPL type → number (undefined ⇒ 0, mirroring gearOf's fallback).
const oGear = (type) => { const t = ETPL[type]; return t && t.gearChance != null ? +t.gearChance : 0; };
const oWeightType = (type) => oWeight(oGear(type));
// oRank: 1-based index of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank. neutral ⇒ 0.
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axis bands (swift/ram/windup/recover/sentinel/lunge) re-derived independently from THEIR imported knobs to prove orthogonality.
const band3 = (v, hi, mid) => (v >= hi ? 2 : v >= mid ? 1 : 0);
const swiftBand = (s) => band3(s, +SWIFT_SURGE.hiSpd, +SWIFT_SURGE.midSpd);
const ramBand = (k) => band3(k, +RAM_SURGE.hiKnock, +RAM_SURGE.midKnock);
const windBand = (w) => band3(w, +WINDUP_SURGE.hiWind, +WINDUP_SURGE.midWind);
const recoverBand = (r) => band3(r, +RECOVER_SURGE.hiRecover, +RECOVER_SURGE.midRecover);
const sentinelBand = (a) => band3(a, +SENTINEL_SURGE.hiAggro, +SENTINEL_SURGE.midAggro);
const lungeBand = (type) => { const l = ETPL[type] && ETPL[type].lunge; if (l == null) return 0; return band3(+l, +LUNGE_SURGE.hiLunge, +LUNGE_SURGE.midLunge); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2612-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash of the shared deterministic world

console.log(`[QA oracle] hiGear=${HI} midGear=${MID} wArsenal=${WA} wKitted=${WK} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${GEARCHANCE_SURGE.enabled} channel=${GEARCHANCE_SURGE.channel} radius=${GEARCHANCE_SURGE.radius}`);

// Deterministic forest tile (same seed ⇒ same rects every client).
const Z = { forest: [192, 723] };
// gearChance sweep around both thresholds. Covers 0.22/0.30 exact boundaries + 0.21 just below mid.
const GEAR_SWEEP = [0, 0.08, 0.10, 0.14, 0.21, 0.22, 0.24, 0.26, 0.29, 0.30, 0.31, 0.32, 0.5, 1.0];
// score sweep for the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 99];
// EVERY row in ETPL that carries a gearChance + a couple of no-gearChance representatives (undefined ⇒ 0).
const GEAR_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].gearChance != null);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.gearchance && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play; __dev.gearchance + spawnKill + saveBlob + worldFingerprint + __BUILD present; 0 err",
     hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.gearchance());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.gearBounty nunca creado), score/tier/charge/preview 0, tag \"\", channel gearFind, cap 2",
     dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0 &&
     dark.forageChargePreview === 0 && dark.tag === "" && dark.channel === "gearFind" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" channel=${dark.channel} cap=${dark.cap} hiGear=${dark.hiGear} midGear=${dark.midGear} weights=${JSON.stringify(dark.weights)}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"gearBounty"\s*:/.test(saveOff) && !/"gearFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave gearBounty/gearFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.gearchance({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.gearchance({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas de pertrecho NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // 5 gearProbe LUT sweep (thresholds 0.30/0.22, edge 0.21)
  const gp = await page.evaluate((sweep) => sweep.map(g => { const p = window.__dev.gearchance({ gearProbe: { gearChance: g } }).gearProbe; return { g, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), GEAR_SWEEP);
  const gpBad = gp.filter(r => r.band !== oBand(r.g) || r.weight !== oWeight(r.g) || (r.tier != null && r.tier !== oRank(oWeight(r.g))) || (r.charge != null && r.charge !== oCharge(oWeight(r.g), true)));
  ok(`5 gearProbe LUT: gearChance→band→weight == oracle en el sweep de umbral (${GEAR_SWEEP.length} pts: bordes exactos 0.21/0.22 y 0.29/0.30)`,
     gpBad.length === 0, gpBad.length ? JSON.stringify(gpBad.map(r => ({ g: r.g, got: [r.band, r.weight], exp: [oBand(r.g), oWeight(r.g)] }))) : `all ${GEAR_SWEEP.length} match`);

  // 6 scoreProbe LUT table
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.gearchance({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  ok(`6 scoreProbe LUT: score→tier→charge == oracle table + sub-cap (${SCORES.length} pts; charge≤cap ${CAP})`,
     scBad.length === 0, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `all match; sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // 7 REAL spawnGear over ALL gearChance-bearing ETPL types
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.gearchance({ enabled: true });
    const out = {};
    for (const t of types) {
      window.__dev.gearchance({ clearGear: true });
      window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const r = window.__dev.gearchance({ spawnGear: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnGear;
      const lp = window.__dev.gearchance({ gearProbeLive: true }).gearProbeLive;
      const mine = lp.mobs.find(m => m.type === t) || null;
      out[t] = { gearChance: r.gearChance, weight: r.weight, valid: r.valid, lpW: mine ? mine.weight : -1, lpGear: mine ? mine.gearChance : -1 };
    }
    window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ enabled: false });
    return out;
  }, { types: GEAR_TYPES, Z });
  const s7bad = GEAR_TYPES.filter(t => !spawn7[t].valid || spawn7[t].gearChance !== oGear(t) || spawn7[t].weight !== oWeightType(t) || spawn7[t].lpW !== oWeightType(t) || spawn7[t].lpGear !== oGear(t));
  ok(`7 REAL spawnGear sobre las ${GEAR_TYPES.length} filas de ETPL con gearChance: browser gearWeight == oWeightType(ETPL[type].gearChance) BASE (server-auth)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.slice(0, 6).map(t => ({ t, gearChance: oGear(t), exp: oWeightType(t), got: spawn7[t] }))) : `all match; orc=${spawn7.orc.weight} bandit=${spawn7.bandit.weight} wolf=${spawn7.wolf.weight} bat=${spawn7.bat.weight} moose=${spawn7.moose.weight}`);

  // 8 ⊥override / server-auth: overrideGear on the CLONE must NOT move the band (gearOf reads BASE)
  const dec = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: true });
    const run = (type, ov) => { window.__dev.gearchance({ clearGear: true });
      window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const r = window.__dev.gearchance({ spawnGear: { type, tx: Z.forest[0], ty: Z.forest[1], overrideGear: ov } }).spawnGear;
      const lp = window.__dev.gearchance({ gearProbeLive: true }).gearProbeLive;
      const mine = lp.mobs.find(m => m.type === type) || null;
      return { base: r.gearChance, cloneGear: r.tplGear, weight: r.weight, lpW: mine ? mine.weight : -99 }; };
    const wolfForged = run("wolf", 0.99);   // base 0.14 (gear0), Forge inflates clone to 0.99 — weight must stay 0
    const orcAffix = run("orc", 0.05);       // base 0.30 (gear2), affix deflates clone to 0.05 — weight must stay 2
    window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ enabled: false });
    return { wolfForged, orcAffix };
  }, Z);
  const decOK = dec.wolfForged.base === 0.14 && dec.wolfForged.cloneGear === 0.99 && dec.wolfForged.weight === 0 && dec.wolfForged.lpW === 0 &&
    dec.orcAffix.base === 0.30 && dec.orcAffix.cloneGear === 0.05 && dec.orcAffix.weight === WA && dec.orcAffix.lpW === WA;
  ok("8 ⊥override / SERVER-AUTH (⊥#74/⊥campeón/⊥Forja): overrideGear escala el CLON e.tpl.gearChance mimetizando un spawn afijado/Forja/campeón — gearOf lee BASE ETPL[type].gearChance ⇒ wolf base0.14 clon0.99 SIGUE gear0; orc base0.30 clon0.05 SIGUE gear2 ⇒ PERTRECHO (base estático) ⊥ afijo/Forja (clon dinámico)",
     decOK, JSON.stringify(dec));

  // 9 CRUX cross-axis (⊥#101 lunge / ⊥#100 recover / ⊥#99 windup / ⊥#98 ram / ⊥#97 sentinel / ⊥#94 swift / ⊥#72 scarcity) — pure data re-derived from peer knobs
  const D = (t) => ({ gear: oWeightType(t), gearRaw: oGear(t), swift: swiftBand(+ETPL[t].spd), ram: ramBand(+ETPL[t].knock), wind: windBand(+ETPL[t].windup), recover: recoverBand(+ETPL[t].recover), sentinel: sentinelBand(+ETPL[t].aggro), lunge: lungeBand(t), xp: +ETPL[t].xp, arch: ETPL[t].arch });
  const bandit = D("bandit"), moose = D("moose"), wolf = D("wolf"), revenant = D("revenant"), bat = D("bat"), volatil = D("volatile"), orc = D("orc"), summoner = D("summoner"), ironback = D("ironback"), skeleton = D("skeleton"), emberkin = D("emberkin");
  const cruxOK =
    // ⊥#101 LUNGE: bandit lunge2/gear1 vs moose lunge0/gear2 — ORDER OPPOSITE
    bandit.lunge === 2 && bandit.gear === 1 && moose.lunge === 0 && moose.gear === 2 &&
    // ⊥#100 RECOVER: within recov0 — revenant recover0.55 recov0/gear2 vs bat recover0.35 recov0/gear0 — SAME recov OPPOSITE gear
    revenant.recover === 0 && revenant.gear === 2 && bat.recover === 0 && bat.gear === 0 &&
    // ⊥#99 WINDUP: volatile wind1/gear0 vs bandit wind0/gear1 — OPPOSITE
    volatil.wind === 1 && volatil.gear === 0 && bandit.wind === 0 && bandit.gear === 1 &&
    // ⊥#98 RAM: moose ram2/gear2 vs revenant ram1/gear2 — SAME gear DIFFERENT ram
    moose.ram === 2 && moose.gear === 2 && revenant.ram === 1 && revenant.gear === 2 &&
    // ⊥#97 SENTINEL: ironback sentinel0/gear2 vs summoner sentinel2/gear1 — OPPOSITE
    ironback.sentinel === 0 && ironback.gear === 2 && summoner.sentinel === 2 && summoner.gear === 1 &&
    // ⊥#94 SWIFT: volatile swift2/gear0 vs orc swift0/gear2 — DIAMETRAL
    volatil.swift === 2 && volatil.gear === 0 && orc.swift === 0 && orc.gear === 2 &&
    // ⊥#72 SCARCITY (the flagged risk): skeleton xp20/gc0.22 vs emberkin xp38/gc0.26 — SAME gearWeight1, ~2× xp ⇒ NOT co-monotone
    skeleton.gear === 1 && emberkin.gear === 1 && skeleton.xp === 20 && emberkin.xp === 38 && emberkin.xp > 1.5 * skeleton.xp;
  ok("9 ⊥ CRUX cross-axis: bandit lunge2/gear1 vs moose lunge0/gear2 OPUESTO (⊥#101); revenant recov0/gear2 vs bat recov0/gear0 MISMO recov OPUESTO (⊥#100); volatile wind1/gear0 vs bandit wind0/gear1 OPUESTO (⊥#99); moose ram2/gear2 vs revenant ram1/gear2 MISMO gear distinto ram (⊥#98); ironback sentinel0/gear2 vs summoner sentinel2/gear1 OPUESTO (⊥#97); volatile swift2/gear0 vs orc swift0/gear2 DIAMETRAL (⊥#94); skeleton xp20/gear1 vs emberkin xp38/gear1 MISMO gear ~2× xp ⇒ NO co-monótono (⊥#72 SCARCITY)",
     cruxOK, JSON.stringify({ bandit, moose, wolf, revenant, bat, volatil, orc, summoner, ironback, skeleton, emberkin }));

  // 10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam → Δh.gearBounty  [independent of GE probe-only]
  const GRANT_TYPES = ["orc", "moose", "revenant", "bandit", "skeleton", "emberkin", "wolf", "bat", "volatile", "summoner", "ironback", "charger"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.gearchance({ enabled: true });
    window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.gearchance().hero.gearBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives gear seam
      const after = window.__dev.gearchance().hero.gearBounty | 0;
      out[t] = after - before;
    }
    window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.gearBounty == oGrant(type) por banda (arsenal orc/moose/revenant/ironback/charger+2; kitted bandit/skeleton/emberkin/summoner+1; pelado wolf/bat/volatile+0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF — THE byte-neutral killEnemy proof
  const offGrant = await page.evaluate((Z) => {
    window.__dev.gearchance({ enabled: false });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.gearchance().hero.gearBounty | 0;
    window.__dev.spawnKill("orc");                   // arsenal, but flag OFF ⇒ dead branch, no bank
    window.__dev.spawnKill("bandit");
    const after = window.__dev.gearchance().hero.gearBounty | 0;
    const gExists = window.__dev.gearchance().gExists;
    return { before, after, delta: after - before, gExists };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(orc)+spawnKill(bandit) con flag OFF ⇒ Δh.gearBounty == 0 Y gExists false (rama muerta, 0 fichas al seam ⇒ killEnemy byte-idéntico al HEAD)",
     offGrant.delta === 0 && offGrant.gExists === false, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 43 arc flags served true; GEARCHANCE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const gearDark = flag("GEARCHANCE_SURGE") === "false";
  ok("12 0-REGRESIÓN: 43 flags del arco #59-#101 served enabled:true; GEARCHANCE_SURGE served false (DARK #102), off=[]",
     arcOff.length === 0 && gearDark && arc.length === 43, `gear=${flag("GEARCHANCE_SURGE")} n=${arc.length} off=${JSON.stringify(arcOff)}`);

  // screenshot evidence (ON + orc arsenal in radius)
  await page.evaluate((Z) => { window.__dev.gearchance({ enabled: true }); window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ enabled: false }); });

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
    window.__dev.gearchance({ enabled: true }); window.__dev.gearchance({ clearGear: true });
    window.__dev.gearchance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.gearchance({ spawnGear: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.gearchance();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.gearchance({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [0, 0.08, 0.14, 0.21, 0.22, 0.26, 0.29, 0.30, 0.32].map(g => window.__dev.gearchance({ gearProbe: { gearChance: g } }).gearProbe.weight);
    const lp = window.__dev.gearchance({ gearProbeLive: true }).gearProbeLive;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.gearchance({ clearGear: true }); window.__dev.gearchance({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, lpScore: lp.score,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.lpScore === B.lpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const orcMax = A.lpScore === oWeightType("orc") && B.lpScore === oWeightType("orc");
  const oracleMatch = A.score === oWeightType("orc") && A.charge === oCharge(oWeightType("orc"), true) &&
    A.bands === JSON.stringify([0, 0.08, 0.14, 0.21, 0.22, 0.26, 0.29, 0.30, 0.32].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO orc+héroe ⇒ score/tier/charge + lpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle",
     conv && orcMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
     `A={s:${A.score},t:${A.tier},c:${A.charge},lpScore:${A.lpScore},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},lpScore:${B.lpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} orcMax=${orcMax} oracleMatch=${oracleMatch}`);
  ok(`14 NORTH STAR fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido)`,
     A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
     `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await pageB.screenshot({ path: join(OUT, "client-b-gear.png") });
  await page.evaluate(() => window.__dev.gearchance({ enabled: false }));
  await pageB.evaluate(() => window.__dev.gearchance({ enabled: false }));

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
