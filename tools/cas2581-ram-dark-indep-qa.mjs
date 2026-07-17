// CAS-2581 — EVO#98 RAM_SURGE (Remate de Ariete) DARK QA (Gate 2/2 input) — 40º flag candidate. Base master HEAD d8d5d0b.
// INDEPENDENT QA harness: re-derives EVERY oracle at the Node level from the imported knobs (RAM_SURGE + ETPL) — it does
// NOT copy the GE seam math nor the GE cas2580 selfverify. It then cross-checks the browser server-auth probes
// (__dev.ram / __dev.spawnKill) against those re-derived oracles.
//
// AXIS (⊥39): BASE IMPACT / KNOCKBACK band of the mob TYPE, server-auth STATIC (how hard its FACTORY type rams you).
//   ramWeight(victim) = band of ramOf(e)=ETPL[e.type].knock (immutable base row): knock≥hiKnock(200) ⇒ ariete/battering ⇒
//   2; knock≥midKnock(110) ⇒ pegador firme/forceful ⇒ 1; knock<midKnock ⇒ leve ⇒ 0. Fresh channel ramFind → h.ramBounty
//   (transient, STATELESS), sub-cap ramBountyCap:2, badge "Remate de Ariete" (✸). Score sampled at TOP of killEnemy
//   (_ramPre). PRE-FLIGHT PASSES with NO pivot: the ONLY reader of .knock is knockback PHYSICS (e.knockX+=cos*tpl.knock)
//   — never a kill reward; no *Weight of the 39 live flags #59-#97 reads knock as SCORE. ⊥ override/#74/champion/élite:
//   ramOf reads ETPL[type].knock BASE, NOT the clone e.tpl.knock (AMBUSH.elite scales the CLONE ×knockMul); applyZoneScale
//   never scales knock ⇒ impact zone-independent (⊥#91).
//
// GATES (map to the 5 task QA gates):
//   1  boot + ram + arc peer hooks + spawnKill + __BUILD, 0 err
//   2  byte-neutral OFF (fresh boot): enabled false, gExists false (G.ramBounty never created), all-zero, tag ""
//   3  STATELESS: save blob has NO ramBounty/ramFind key (task gate 5)
//   4  worldFingerprint byte-stable across enabled toggle (tokens NOT in fp; 0 RNG drift) (task gate 5)
//   5  knockProbe LUT: knock→band→weight→tier→charge == oracle across 200/110/109 boundaries (task gate 3)
//   6  scoreProbe LUT: score→tier→charge == oracle table + sub-cap headroom (task gate 3)
//   7  REAL spawnRam over ALL ETPL knock rows: browser ramWeight == oWeightType(ETPL[type].knock) BASE (task gate 3)
//   8  ⊥ DECOUPLING (task gate ⊥override/⊥#74/⊥champion/⊥élite): spawnRam overrideKnock scales the CLONE ⇒ ramOf reads
//        BASE, IGNORES clone: orc base150 clone999 stays ram1; charger base235 clone10 stays ram2
//   9  CRUX ⊥#97 sentinel / ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role / ⊥#84 skirmish: OPPOSED (gate 5)
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ Δh.ramBounty == oGrant(type)
//        ariete(moose/ironback/magmabrute/toadbrute/charger)+2, firme(rat/bandit/demon/skeleton/revenant/quillback/mudlurker/wolf/orc)+1,
//        leve(mage/golem/summoner/healer/bat/dragon/wendigo/…)+0; sub-cap 2 (task gate 2)
//   11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0 (task gate 2)
//   12 0-REGRESSION: 39 arc flags #59-#97 served enabled:true; RAM_SURGE served false (DARK #98), off=[] (gate 5)
//   13 NORTH STAR 2-client: A==B (score/tier/charge + ramProbe MAX + LUTs + worldFingerprint + terrHash) + oracle (gate 4)
//   14 NORTH STAR fp==15920977 + terrHash==2105484439, A==B (shared deterministic world) (task gate 4)
//   0  no JS errors during the run

import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { RAM_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (RAM_SURGE.hiKnock != null) ? +RAM_SURGE.hiKnock : 200;
const MID = (RAM_SURGE.midKnock != null) ? +RAM_SURGE.midKnock : 110;
const WB = +(RAM_SURGE.weights && RAM_SURGE.weights.battering) || 0;  // ariete
const WF = +(RAM_SURGE.weights && RAM_SURGE.weights.forceful) || 0;   // pegador firme
const TIERS = (RAM_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, RAM_SURGE.ramBountyCap | 0);
// oBand: knock → band label.
const oBand = (k) => (k >= HI ? "battering" : k >= MID ? "forceful" : "light");
// oWeight: knock → weight. ariete⇒WB(2); firme⇒WF(1); leve⇒0.
const oWeight = (k) => (k >= HI ? WB : k >= MID ? WF : 0);
// oKnock/oWeightType: BASE knock of a real ETPL type → weight.
const oKnock = (type) => { const t = ETPL[type]; return t && t.knock != null ? +t.knock : 0; };
const oWeightType = (type) => oWeight(oKnock(type));
// oRank: 1-based index of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank. neutral ⇒ 0.
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axis bands (sentinel/tough/swift/bulk/menace) re-derived independently to prove orthogonality.
const sentinelBand = (aggro) => aggro >= 320 ? 2 : aggro >= 250 ? 1 : 0;
const toughBand = (hp) => hp >= 110 ? 2 : hp >= 46 ? 1 : 0;
const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
const bulkBand = (sz) => sz >= 24 ? 2 : sz >= 18 ? 1 : 0;
const menaceBand = (dmg) => dmg >= 22 ? 2 : dmg >= 14 ? 1 : 0;

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2581-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash of the shared deterministic world

console.log(`[QA oracle] hiKnock=${HI} midKnock=${MID} wBattering=${WB} wForceful=${WF} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${RAM_SURGE.enabled} channel=${RAM_SURGE.channel} radius=${RAM_SURGE.radius}`);

// Deterministic forest tile (same seed ⇒ same rects every client).
const Z = { forest: [192, 723] };
// knock sweep around both thresholds (independent of any real type). Covers 200/110/109 exact boundaries.
const KNOCK_SWEEP = [0, 40, 90, 100, 109, 110, 111, 120, 150, 170, 199, 200, 201, 210, 235, 300, 999];
// score sweep for the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 99];
// EVERY knock row in ETPL — REAL server-auth spawn coverage (QA enumerates ETPL itself: 31 rows ≥ the 15 required).
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].knock != null);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ram && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.bulk && window.__dev.role && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play; __dev.ram + arc peer hooks + spawnKill + __BUILD present; 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.ram());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.ramBounty nunca creado), score/tier/charge/preview 0, tag \"\", channel ramFind, cap 2",
     dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0 &&
     dark.forageChargePreview === 0 && dark.tag === "" && dark.channel === "ramFind" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" channel=${dark.channel} cap=${dark.cap} hiKnock=${dark.hiKnock} midKnock=${dark.midKnock} weights=${JSON.stringify(dark.weights)}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"ramBounty"\s*:/.test(saveOff) && !/"ramFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave ramBounty/ramFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.ram({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.ram({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas de ariete NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // 5 knockProbe LUT sweep (thresholds 200/110)
  const kn = await page.evaluate((sweep) => sweep.map(k => { const p = window.__dev.ram({ knockProbe: { knock: k } }).knockProbe; return { k, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), KNOCK_SWEEP);
  const knBad = kn.filter(r => r.band !== oBand(r.k) || r.weight !== oWeight(r.k) || (r.tier != null && r.tier !== oRank(oWeight(r.k))) || (r.charge != null && r.charge !== oCharge(oWeight(r.k), true)));
  ok(`5 knockProbe LUT: knock→band→weight == oracle en el sweep de umbral (${KNOCK_SWEEP.length} pts: bordes exactos 109/110 y 199/200)`,
     knBad.length === 0, knBad.length ? JSON.stringify(knBad.map(r => ({ k: r.k, got: [r.band, r.weight], exp: [oBand(r.k), oWeight(r.k)] }))) : `all ${KNOCK_SWEEP.length} match`);

  // 6 scoreProbe LUT table
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.ram({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  ok(`6 scoreProbe LUT: score→tier→charge == oracle table + sub-cap (${SCORES.length} pts; charge≤cap ${CAP})`,
     scBad.length === 0, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `all match; sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // 7 REAL spawnRam over ALL ETPL knock rows
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.ram({ clearRam: true });
      const r = window.__dev.ram({ spawnRam: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnRam;
      const rp = window.__dev.ram({ ramProbe: true }).ramProbe;
      const mine = rp.mobs.find(m => m.type === t) || null;
      out[t] = { knock: r.knock, weight: r.weight, valid: r.valid, rpW: mine ? mine.weight : -1, rpK: mine ? mine.knock : -1 };
    }
    window.__dev.ram({ clearRam: true }); window.__dev.ram({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => !spawn7[t].valid || spawn7[t].knock !== oKnock(t) || spawn7[t].weight !== oWeightType(t) || spawn7[t].rpW !== oWeightType(t) || spawn7[t].rpK !== oKnock(t));
  ok(`7 REAL spawnRam sobre LAS ${ALL_TYPES.length} filas knock de ETPL: browser ramWeight == oWeightType(ETPL[type].knock) BASE (server-auth, ≥15 requeridas)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, knock: oKnock(t), exp: oWeightType(t), got: spawn7[t] }))) : `all ${ALL_TYPES.length} types match base band (charger=${spawn7.charger.weight} moose=${spawn7.moose.weight} orc=${spawn7.orc.weight} rat=${spawn7.rat.weight} golem=${spawn7.golem.weight} mage=${spawn7.mage.weight})`);

  // 8 ⊥ DECOUPLING (CRUX ⊥override/⊥#74/⊥champion/⊥élite): overrideKnock on the CLONE must NOT move the band (ramOf reads BASE)
  const dec = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.ram({ clearRam: true });
      const r = window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1], overrideKnock: ov } }).spawnRam;
      const rp = window.__dev.ram({ ramProbe: true }).ramProbe;
      const mine = rp.mobs.find(m => m.type === type) || null;
      return { base: r.knock, cloneKnock: r.tplKnock, weight: r.weight, rpW: mine ? mine.weight : -99 }; };
    const orcElite = run("orc", 999);        // base 150, AMBUSH.elite inflates clone to 999 — ram must stay 1
    const chargerDeflate = run("charger", 10); // base 235, deflated clone to 10 — ram must stay 2
    window.__dev.ram({ clearRam: true }); window.__dev.ram({ enabled: false });
    return { orcElite, chargerDeflate };
  }, Z);
  const decOK = dec.orcElite.base === 150 && dec.orcElite.cloneKnock === 999 && dec.orcElite.weight === WF && dec.orcElite.rpW === WF &&
    dec.chargerDeflate.base === 235 && dec.chargerDeflate.cloneKnock === 10 && dec.chargerDeflate.weight === WB && dec.chargerDeflate.rpW === WB;
  ok("8 ⊥ DESACOPLE (⊥override/⊥#74/⊥campeón/⊥élite): overrideKnock escala el CLON e.tpl.knock mimetizando AMBUSH.elite(round(base×knockMul))/spawn-escalado — ramOf lee BASE ETPL[type].knock ⇒ orco base150 élite(clon999) SIGUE ram1; charger base235 deflactado(clon10) SIGUE ram2 ⇒ IMPACTO (base estático) ⊥ élite/campeón (clon dinámico)",
     decOK, JSON.stringify(dec));

  // 9 CRUX cross-axis (⊥#97 sentinel / ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role / ⊥#84 skirmish) — pure data
  const D = (t) => ({ ram: oWeightType(t), sentinel: sentinelBand(+ETPL[t].aggro), tough: toughBand(+ETPL[t].hp), menace: menaceBand(+ETPL[t].dmg), swift: swiftBand(+ETPL[t].spd), bulk: bulkBand(+ETPL[t].size), arch: ETPL[t].arch, ranged: !!ETPL[t].ranged, knock: +ETPL[t].knock, aggro: +ETPL[t].aggro, hp: +ETPL[t].hp, dmg: +ETPL[t].dmg, spd: +ETPL[t].spd, size: +ETPL[t].size });
  const golem = D("golem"), charger = D("charger"), rat = D("rat"), bat = D("bat"), moose = D("moose"), mage = D("mage"), summoner = D("summoner");
  const cruxOK =
    // ⊥#97 SENTINEL (base aggro): golem aggro360 sentinel2 / knock60 ram0 (vigía-leve) vs charger aggro300 sentinel1 / knock235 ram2 (ariete-vigilante) — ORDER OPPOSED
    golem.sentinel === 2 && golem.ram === 0 && charger.sentinel === 1 && charger.ram === 2 &&
    // ⊥#96 TOUGH (base hp): golem hp640 tough2 / ram0 (coloso-leve) vs rat hp20 tough0 / knock110 ram1 (frágil-firme) — OPPOSED
    golem.tough === 2 && golem.ram === 0 && rat.tough === 0 && rat.ram === 1 &&
    // ⊥#95 MENACE (base dmg): golem dmg30 menace2 / ram0 (duro-leve) vs rat dmg6 menace0 / ram1 (débil-firme) — OPPOSED
    golem.menace === 2 && golem.ram === 0 && rat.menace === 0 && rat.ram === 1 &&
    // ⊥#94 SWIFT (base spd): bat spd158 swift2 / knock90 ram0 (veloz-leve) vs charger spd74 swift0 / knock235 ram2 (lento-ariete) — DIAMETRICALLY OPPOSED
    bat.swift === 2 && bat.ram === 0 && charger.swift === 0 && charger.ram === 2 &&
    // ⊥#92 BULK (base size): golem sz36 bulk2 / ram0 (mole-leve) vs rat sz15 bulk0 / knock110 ram1 (menuda-firme) — DIAMETRICALLY OPPOSED
    golem.bulk === 2 && golem.ram === 0 && rat.bulk === 0 && rat.ram === 1 &&
    // ⊥#93 ROLE (arch): summoner enabler-arch / ram0 vs charger charger-arch / ram2 — selection OPPOSED
    summoner.arch === "summoner" && summoner.ram === 0 && charger.arch === "charger" && charger.ram === 2 &&
    // ⊥#84 SKIRMISH (ranged class): mage RANGED / knock60 ram0 vs moose MELEE / knock200 ram2 — OPPOSED
    mage.ranged === true && mage.ram === 0 && moose.ranged === false && moose.ram === 2;
  ok("9 ⊥ CRUX cross-axis: golem sentinel2/ram0 vs charger sentinel1/ram2 ORDEN OPUESTO (⊥#97); golem tough2/ram0 vs rat tough0/ram1 OPUESTO (⊥#96); golem menace2/ram0 vs rat menace0/ram1 OPUESTO (⊥#95); bat swift2/ram0 vs charger swift0/ram2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); golem bulk2/ram0 vs rat bulk0/ram1 DIAMÉTRICAMENTE OPUESTOS (⊥#92); summoner enabler/ram0 vs charger charger/ram2 (⊥#93); mage ranged/ram0 vs moose melee/ram2 (⊥#84)",
     cruxOK, JSON.stringify({ golem, charger, rat, bat, moose, mage, summoner }));

  // 10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam → Δh.ramBounty
  const GRANT_TYPES = ["moose", "ironback", "magmabrute", "toadbrute", "charger", "rat", "bandit", "demon", "skeleton", "revenant", "quillback", "mudlurker", "wolf", "orc", "mage", "golem", "summoner", "healer", "bat", "dragon", "wendigo", "spearman"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.ram({ enabled: true });
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.ram().hero.ramBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives ram seam
      const after = window.__dev.ram().hero.ramBounty | 0;
      out[t] = after - before;
    }
    window.__dev.ram({ clearRam: true }); window.__dev.ram({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.ramBounty == oGrant(type) por banda (ariete moose/ironback/magmabrute/toadbrute/charger+2; firme rat/bandit/demon/skeleton/revenant/quillback/mudlurker/wolf/orc+1; leve mage/golem/summoner/healer/bat/dragon/wendigo/spearman+0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF
  const offGrant = await page.evaluate((Z) => {
    window.__dev.ram({ enabled: false });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.ram().hero.ramBounty | 0;
    window.__dev.spawnKill("charger");                  // ariete mob, but flag OFF ⇒ dead branch
    window.__dev.spawnKill("moose");
    const after = window.__dev.ram().hero.ramBounty | 0;
    return { before, after, delta: after - before };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(charger)+spawnKill(moose) con flag OFF ⇒ Δh.ramBounty == 0 (rama muerta, 0 fichas al seam)",
     offGrant.delta === 0, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 39 arc flags served true; RAM_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const ramDark = flag("RAM_SURGE") === "false";
  ok("12 0-REGRESIÓN: 39 flags del arco #59-#97 served enabled:true; RAM_SURGE served false (DARK #98), off=[]",
     arcOff.length === 0 && ramDark && arc.length === 39, `ram=${flag("RAM_SURGE")} n=${arc.length} off=${JSON.stringify(arcOff)}`);

  // screenshot evidence (ON + charger ariete in radius)
  await page.evaluate((Z) => { window.__dev.ram({ enabled: true }); window.__dev.ram({ clearRam: true }); window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.ram({ clearRam: true }); window.__dev.ram({ enabled: false }); });

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
    window.__dev.ram({ enabled: true }); window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.ram();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.ram({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [0, 90, 109, 110, 150, 199, 200, 235].map(k => window.__dev.ram({ knockProbe: { knock: k } }).knockProbe.weight);
    const rp = window.__dev.ram({ ramProbe: true }).ramProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.ram({ clearRam: true }); window.__dev.ram({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, rpScore: rp.score,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: ramProbe.mobs[0] ordering mirrors AMBIENT G.enemies within radius (drifts by session-age) — a session-age
  // artifact, NOT a product desync. The server-auth signal is rpScore (MAX ramWeight over radius) + hero score/tier/charge
  // + pure LUTs + worldFingerprint + terrHash — all deterministic. We assert THOSE.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.rpScore === B.rpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const chargerMax = A.rpScore === oWeightType("charger") && B.rpScore === oWeightType("charger");
  const oracleMatch = A.score === oWeightType("charger") && A.charge === oCharge(oWeightType("charger"), true) &&
    A.bands === JSON.stringify([0, 90, 109, 110, 150, 199, 200, 235].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO charger+héroe ⇒ score/tier/charge + rpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && chargerMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
     `A={s:${A.score},t:${A.tier},c:${A.charge},rpScore:${A.rpScore},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},rpScore:${B.rpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} chargerMax=${chargerMax} oracleMatch=${oracleMatch}`);
  ok(`14 NORTH STAR fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido)`,
     A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
     `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await pageB.screenshot({ path: join(OUT, "client-b-ram.png") });
  await page.evaluate(() => window.__dev.ram({ enabled: false }));
  await pageB.evaluate(() => window.__dev.ram({ enabled: false }));

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
