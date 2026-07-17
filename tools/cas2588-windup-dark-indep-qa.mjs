// CAS-2588 — EVO#99 WINDUP_SURGE (Remate de Presagio) DARK QA (Gate 2/2 input) — 41º flag candidate. Base master HEAD 6168eea.
// INDEPENDENT QA harness: re-derives EVERY oracle at the Node level from the imported knobs (WINDUP_SURGE + ETPL) — it does
// NOT copy the GE seam math nor the GE cas2585 selfverify. It then cross-checks the browser server-auth probes
// (__dev.wind / __dev.spawnKill) against those re-derived oracles.
//
// AXIS (⊥40): BASE WIND-UP / TELEGRAPH-TIME band of the mob TYPE, server-auth STATIC (how long its FACTORY type telegraphs
//   before it strikes). windWeight(victim) = band of windOf(e)=ETPL[e.type].windup (immutable base row): windup≥hiWind(0.85)
//   ⇒ deliberate/ponderoso ⇒ 2; windup≥midWind(0.62) ⇒ measured/medido ⇒ 1; windup<midWind ⇒ snappy/súbito ⇒ 0. Fresh
//   channel windFind → h.windBounty (transient, STATELESS), sub-cap windBountyCap:2, badge "Remate de Presagio" (⌛). Score
//   sampled at TOP of killEnemy (_windPre). PRE-FLIGHT PASSES with NO pivot: the ONLY readers of .windup are (a) the AI state
//   machine (e.st=tpl.windup, DURATION — behaviour) and (b) the TELL render — never a kill reward; no *Weight of the 40 live
//   flags #59-#98 reads windup as SCORE. ⊥ override/#74/champion/élite: windOf reads ETPL[type].windup BASE, NOT the clone
//   e.tpl.windup (a scaled/élite spawn overwrites the CLONE); applyZoneScale scales hp/dmg/spd/xp but NEVER windup ⇒
//   telegraph zone-independent (⊥#91). CRUX ⊥#89 INTERRUPT reads e.state DYNAMIC (executing NOW?) not ETPL[type].windup STATIC.
//
// GATES (map to the 6 task QA gates):
//   1  boot + wind + arc peer hooks + spawnKill + __BUILD, 0 err
//   2  byte-neutral OFF (fresh boot): enabled false, gExists false (G.windBounty never created), all-zero, tag ""
//   3  STATELESS: save blob has NO windBounty/windFind key (task gate 2/5)
//   4  worldFingerprint byte-stable across enabled toggle (tokens NOT in fp; 0 RNG drift) (task gate 2/5)
//   5  windupProbe LUT: windup→band→weight→tier→charge == oracle across 0.85/0.62/0.61 boundaries (task gate 3)
//   6  scoreProbe LUT: score→tier→charge == oracle table + sub-cap headroom (task gate 3)
//   7  REAL spawnWind over ALL ETPL windup rows: browser windWeight == oWeightType(ETPL[type].windup) BASE (task gate 3)
//   8  ⊥ DECOUPLING (task gate 4 ⊥override/⊥#74/⊥champion/⊥élite): spawnWind overrideWindup scales the CLONE ⇒ windOf reads
//        BASE, IGNORES clone: orc base0.82 clone0.99 stays wind1; golem base0.95 clone0.1 stays wind2
//   9  CRUX ⊥#98 ram / ⊥#97 sentinel / ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role / ⊥#84 skirmish: OPPOSED (gate 5)
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ Δh.windBounty == oGrant(type)
//        deliberate(golem/summoner/mage/moose/ironback/magmabrute/wraith/wendigo/dragon)+2,
//        measured(charger/orc/revenant/toadbrute/spearman/volatile/healer/demon)+1,
//        snappy(bat/rat/wolf/mudlurker/bandit/skeleton/quillback)+0; sub-cap 2 (task gate 3)
//   11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0 (task gate 2)
//   12 0-REGRESSION: 40 arc flags #59-#98 served enabled:true; WINDUP_SURGE served false (DARK #99), off=[] (gate 5)
//   13 NORTH STAR 2-client: A==B (score/tier/charge + windProbe MAX + LUTs + worldFingerprint + terrHash) + oracle (gate 6)
//   14 NORTH STAR fp==15920977 + terrHash==2105484439, A==B (shared deterministic world) (task gate 6)
//   0  no JS errors during the run

import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { WINDUP_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (WINDUP_SURGE.hiWind != null) ? +WINDUP_SURGE.hiWind : 0.85;
const MID = (WINDUP_SURGE.midWind != null) ? +WINDUP_SURGE.midWind : 0.62;
const WD = +(WINDUP_SURGE.weights && WINDUP_SURGE.weights.deliberate) || 0;  // ponderoso/telegrafiado largo
const WM = +(WINDUP_SURGE.weights && WINDUP_SURGE.weights.measured) || 0;    // medido
const TIERS = (WINDUP_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, WINDUP_SURGE.windBountyCap | 0);
// oBand: windup → band label.
const oBand = (w) => (w >= HI ? "deliberate" : w >= MID ? "measured" : "snappy");
// oWeight: windup → weight. deliberate⇒WD(2); measured⇒WM(1); snappy⇒0.
const oWeight = (w) => (w >= HI ? WD : w >= MID ? WM : 0);
// oWindup/oWeightType: BASE windup of a real ETPL type → weight.
const oWindup = (type) => { const t = ETPL[type]; return t && t.windup != null ? +t.windup : 0; };
const oWeightType = (type) => oWeight(oWindup(type));
// oRank: 1-based index of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank. neutral ⇒ 0.
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axis bands (ram/sentinel/tough/swift/bulk/menace) re-derived independently to prove orthogonality.
const ramBand = (knock) => knock >= 200 ? 2 : knock >= 110 ? 1 : 0;
const sentinelBand = (aggro) => aggro >= 320 ? 2 : aggro >= 250 ? 1 : 0;
const toughBand = (hp) => hp >= 110 ? 2 : hp >= 46 ? 1 : 0;
const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
const bulkBand = (sz) => sz >= 24 ? 2 : sz >= 18 ? 1 : 0;
const menaceBand = (dmg) => dmg >= 22 ? 2 : dmg >= 14 ? 1 : 0;

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2588-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash of the shared deterministic world

console.log(`[QA oracle] hiWind=${HI} midWind=${MID} wDeliberate=${WD} wMeasured=${WM} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${WINDUP_SURGE.enabled} channel=${WINDUP_SURGE.channel} radius=${WINDUP_SURGE.radius}`);

// Deterministic forest tile (same seed ⇒ same rects every client).
const Z = { forest: [192, 723] };
// windup sweep around both thresholds (independent of any real type). Covers 0.62/0.85 exact boundaries + 0.61.
const WINDUP_SWEEP = [0, 0.28, 0.5, 0.6, 0.61, 0.62, 0.63, 0.7, 0.82, 0.84, 0.85, 0.86, 0.9, 0.95, 9];
// score sweep for the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 99];
// EVERY windup row in ETPL — REAL server-auth spawn coverage (QA enumerates ETPL itself: 31 rows ≥ the 15 required).
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].windup != null);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wind && window.__dev.ram && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.bulk && window.__dev.role && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play; __dev.wind + arc peer hooks + spawnKill + __BUILD present; 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.wind());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.windBounty nunca creado), score/tier/charge/preview 0, tag \"\", channel windFind, cap 2",
     dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0 &&
     dark.forageChargePreview === 0 && dark.tag === "" && dark.channel === "windFind" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" channel=${dark.channel} cap=${dark.cap} hiWind=${dark.hiWind} midWind=${dark.midWind} weights=${JSON.stringify(dark.weights)}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"windBounty"\s*:/.test(saveOff) && !/"windFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave windBounty/windFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.wind({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.wind({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas de presagio NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // 5 windupProbe LUT sweep (thresholds 0.85/0.62)
  const wp = await page.evaluate((sweep) => sweep.map(w => { const p = window.__dev.wind({ windupProbe: { windup: w } }).windupProbe; return { w, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), WINDUP_SWEEP);
  const wpBad = wp.filter(r => r.band !== oBand(r.w) || r.weight !== oWeight(r.w) || (r.tier != null && r.tier !== oRank(oWeight(r.w))) || (r.charge != null && r.charge !== oCharge(oWeight(r.w), true)));
  ok(`5 windupProbe LUT: windup→band→weight == oracle en el sweep de umbral (${WINDUP_SWEEP.length} pts: bordes exactos 0.61/0.62 y 0.84/0.85)`,
     wpBad.length === 0, wpBad.length ? JSON.stringify(wpBad.map(r => ({ w: r.w, got: [r.band, r.weight], exp: [oBand(r.w), oWeight(r.w)] }))) : `all ${WINDUP_SWEEP.length} match`);

  // 6 scoreProbe LUT table
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.wind({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  ok(`6 scoreProbe LUT: score→tier→charge == oracle table + sub-cap (${SCORES.length} pts; charge≤cap ${CAP})`,
     scBad.length === 0, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `all match; sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // 7 REAL spawnWind over ALL ETPL windup rows
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.wind({ clearWind: true });
      const r = window.__dev.wind({ spawnWind: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnWind;
      const tp = window.__dev.wind({ windProbe: true }).windProbe;
      const mine = tp.mobs.find(m => m.type === t) || null;
      out[t] = { windup: r.windup, weight: r.weight, valid: r.valid, wpW: mine ? mine.weight : -1, wpU: mine ? mine.windup : -1 };
    }
    window.__dev.wind({ clearWind: true }); window.__dev.wind({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => !spawn7[t].valid || spawn7[t].windup !== oWindup(t) || spawn7[t].weight !== oWeightType(t) || spawn7[t].wpW !== oWeightType(t) || spawn7[t].wpU !== oWindup(t));
  ok(`7 REAL spawnWind sobre LAS ${ALL_TYPES.length} filas windup de ETPL: browser windWeight == oWeightType(ETPL[type].windup) BASE (server-auth, ≥15 requeridas)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, windup: oWindup(t), exp: oWeightType(t), got: spawn7[t] }))) : `all ${ALL_TYPES.length} types match base band (golem=${spawn7.golem.weight} summoner=${spawn7.summoner.weight} orc=${spawn7.orc.weight} charger=${spawn7.charger.weight} bat=${spawn7.bat.weight} mage=${spawn7.mage.weight})`);

  // 8 ⊥ DECOUPLING (CRUX ⊥override/⊥#74/⊥champion/⊥élite): overrideWindup on the CLONE must NOT move the band (windOf reads BASE)
  const dec = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.wind({ clearWind: true });
      const r = window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1], overrideWindup: ov } }).spawnWind;
      const tp = window.__dev.wind({ windProbe: true }).windProbe;
      const mine = tp.mobs.find(m => m.type === type) || null;
      return { base: r.windup, cloneWindup: r.tplWindup, weight: r.weight, wpW: mine ? mine.weight : -99 }; };
    const orcElite = run("orc", 0.99);        // base 0.82, élite inflates clone to 0.99 — wind must stay 1
    const golemDeflate = run("golem", 0.1);   // base 0.95, deflated clone to 0.1 — wind must stay 2
    window.__dev.wind({ clearWind: true }); window.__dev.wind({ enabled: false });
    return { orcElite, golemDeflate };
  }, Z);
  const decOK = dec.orcElite.base === oWindup("orc") && dec.orcElite.cloneWindup === 0.99 && dec.orcElite.weight === WM && dec.orcElite.wpW === WM &&
    dec.golemDeflate.base === oWindup("golem") && dec.golemDeflate.cloneWindup === 0.1 && dec.golemDeflate.weight === WD && dec.golemDeflate.wpW === WD;
  ok("8 ⊥ DESACOPLE (⊥override/⊥#74/⊥campeón/⊥élite): overrideWindup escala el CLON e.tpl.windup mimetizando un spawn escalado/élite — windOf lee BASE ETPL[type].windup ⇒ orco base0.82 élite(clon0.99) SIGUE wind1; golem base0.95 deflactado(clon0.1) SIGUE wind2 ⇒ AMAGO (base estático) ⊥ élite/campeón (clon dinámico)",
     decOK, JSON.stringify(dec));

  // 9 CRUX cross-axis (⊥#98 ram / ⊥#97 sentinel / ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role / ⊥#84 skirmish) — pure data
  const D = (t) => ({ wind: oWeightType(t), ram: ramBand(+ETPL[t].knock), sentinel: sentinelBand(+ETPL[t].aggro), tough: toughBand(+ETPL[t].hp), menace: menaceBand(+ETPL[t].dmg), swift: swiftBand(+ETPL[t].spd), bulk: bulkBand(+ETPL[t].size), arch: ETPL[t].arch, ranged: !!ETPL[t].ranged, windup: +ETPL[t].windup, knock: +ETPL[t].knock, aggro: +ETPL[t].aggro, hp: +ETPL[t].hp, dmg: +ETPL[t].dmg, spd: +ETPL[t].spd, size: +ETPL[t].size });
  const golem = D("golem"), charger = D("charger"), ironback = D("ironback"), mudlurker = D("mudlurker"), mage = D("mage"), summoner = D("summoner"), volatile = D("volatile"), bat = D("bat"), orc = D("orc"), moose = D("moose"), spearman = D("spearman");
  const cruxOK =
    // ⊥#98 RAM (base knock): golem knock60 ram0 / windup0.95 wind2 (leve-pero-ponderoso) vs charger knock235 ram2 / windup0.66 wind1 — ORDER OPPOSED
    golem.ram === 0 && golem.wind === 2 && charger.ram === 2 && charger.wind === 1 &&
    // ⊥#97 SENTINEL (base aggro): ironback aggro220 sentinel0 / windup0.86 wind2 (despistado-pero-ponderoso) vs mudlurker aggro250 sentinel1 / windup0.48 wind0 — OPPOSED
    ironback.sentinel === 0 && ironback.wind === 2 && mudlurker.sentinel === 1 && mudlurker.wind === 0 &&
    // ⊥#96 TOUGH (base hp): charger hp140 tough2 / windup0.66 wind1 vs mage hp56 tough1 / windup0.9 wind2 — OPPOSED
    charger.tough === 2 && charger.wind === 1 && mage.tough === 1 && mage.wind === 2 &&
    // ⊥#95 MENACE (base dmg): summoner dmg0 menace0 / windup0.95 wind2 (inerme-pero-ponderoso) vs volatile dmg23 menace2 / windup0.7 wind1 — OPPOSED
    summoner.menace === 0 && summoner.wind === 2 && volatile.menace === 2 && volatile.wind === 1 &&
    // ⊥#94 SWIFT (base spd): bat spd158 swift2 / windup0.28 wind0 (veloz-súbito) vs golem spd46 swift0 / windup0.95 wind2 (lento-ponderoso) — DIAMETRICALLY OPPOSED
    bat.swift === 2 && bat.wind === 0 && golem.swift === 0 && golem.wind === 2 &&
    // ⊥#93 ROLE (arch): orc brute-arch / wind1 vs moose brute-arch / wind2 — SAME arch DIFFERENT band ⇒ NOT a re-map of arch
    orc.arch === "brute" && orc.wind === 1 && moose.arch === "brute" && moose.wind === 2 &&
    // ⊥#92 BULK (base size): charger sz26 bulk2 / windup0.66 wind1 vs summoner sz20 bulk1 / windup0.95 wind2 — OPPOSED
    charger.bulk === 2 && charger.wind === 1 && summoner.bulk === 1 && summoner.wind === 2 &&
    // ⊥#84 SKIRMISH (ranged class): golem MELEE / windup0.95 wind2 vs spearman RANGED / windup0.7 wind1 — OPPOSED
    golem.ranged === false && golem.wind === 2 && spearman.ranged === true && spearman.wind === 1;
  ok("9 ⊥ CRUX cross-axis: golem ram0/wind2 vs charger ram2/wind1 ORDEN OPUESTO (⊥#98); ironback sentinel0/wind2 vs mudlurker sentinel1/wind0 OPUESTO (⊥#97); charger tough2/wind1 vs mage tough1/wind2 OPUESTO (⊥#96); summoner menace0/wind2 vs volatile menace2/wind1 OPUESTO (⊥#95); bat swift2/wind0 vs golem swift0/wind2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); orc brute/wind1 vs moose brute/wind2 MISMO arch DISTINTA banda (⊥#93); charger bulk2/wind1 vs summoner bulk1/wind2 OPUESTO (⊥#92); golem melee/wind2 vs spearman ranged/wind1 OPUESTO (⊥#84)",
     cruxOK, JSON.stringify({ golem, charger, ironback, mudlurker, mage, summoner, volatile, bat, orc, moose, spearman }));

  // 10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam → Δh.windBounty
  const GRANT_TYPES = ["golem", "summoner", "mage", "moose", "ironback", "magmabrute", "wraith", "wendigo", "dragon", "charger", "orc", "revenant", "toadbrute", "spearman", "volatile", "healer", "demon", "bat", "rat", "wolf", "mudlurker", "bandit", "skeleton", "quillback"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.wind({ enabled: true });
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.wind().hero.windBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives wind seam
      const after = window.__dev.wind().hero.windBounty | 0;
      out[t] = after - before;
    }
    window.__dev.wind({ clearWind: true }); window.__dev.wind({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.windBounty == oGrant(type) por banda (deliberate golem/summoner/mage/moose/ironback/magmabrute/wraith/wendigo/dragon+2; measured charger/orc/revenant/toadbrute/spearman/volatile/healer/demon+1; snappy bat/rat/wolf/mudlurker/bandit/skeleton/quillback+0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF
  const offGrant = await page.evaluate((Z) => {
    window.__dev.wind({ enabled: false });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.wind().hero.windBounty | 0;
    window.__dev.spawnKill("golem");                    // deliberate mob, but flag OFF ⇒ dead branch
    window.__dev.spawnKill("moose");
    const after = window.__dev.wind().hero.windBounty | 0;
    return { before, after, delta: after - before };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(golem)+spawnKill(moose) con flag OFF ⇒ Δh.windBounty == 0 (rama muerta, 0 fichas al seam)",
     offGrant.delta === 0, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 40 arc flags served true; WINDUP_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const windDark = flag("WINDUP_SURGE") === "false";
  ok("12 0-REGRESIÓN: 40 flags del arco #59-#98 served enabled:true; WINDUP_SURGE served false (DARK #99), off=[]",
     arcOff.length === 0 && windDark && arc.length === 40, `wind=${flag("WINDUP_SURGE")} n=${arc.length} off=${JSON.stringify(arcOff)}`);

  // screenshot evidence (ON + golem deliberate in radius)
  await page.evaluate((Z) => { window.__dev.wind({ enabled: true }); window.__dev.wind({ clearWind: true }); window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.wind({ clearWind: true }); window.__dev.wind({ enabled: false }); });

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
    window.__dev.wind({ enabled: true }); window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.wind();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.wind({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [0, 0.5, 0.61, 0.62, 0.7, 0.84, 0.85, 0.95].map(w => window.__dev.wind({ windupProbe: { windup: w } }).windupProbe.weight);
    const tp = window.__dev.wind({ windProbe: true }).windProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.wind({ clearWind: true }); window.__dev.wind({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, wpScore: tp.score,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: windProbe.mobs[0] ordering mirrors AMBIENT G.enemies within radius (drifts by session-age) — a session-age
  // artifact, NOT a product desync. The server-auth signal is wpScore (MAX windWeight over radius) + hero score/tier/charge
  // + pure LUTs + worldFingerprint + terrHash — all deterministic. We assert THOSE.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.wpScore === B.wpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const golemMax = A.wpScore === oWeightType("golem") && B.wpScore === oWeightType("golem");
  const oracleMatch = A.score === oWeightType("golem") && A.charge === oCharge(oWeightType("golem"), true) &&
    A.bands === JSON.stringify([0, 0.5, 0.61, 0.62, 0.7, 0.84, 0.85, 0.95].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO golem+héroe ⇒ score/tier/charge + wpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && golemMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
     `A={s:${A.score},t:${A.tier},c:${A.charge},wpScore:${A.wpScore},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},wpScore:${B.wpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} golemMax=${golemMax} oracleMatch=${oracleMatch}`);
  ok(`14 NORTH STAR fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido)`,
     A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
     `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await pageB.screenshot({ path: join(OUT, "client-b-wind.png") });
  await page.evaluate(() => window.__dev.wind({ enabled: false }));
  await pageB.evaluate(() => window.__dev.wind({ enabled: false }));

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

  console.log(`\n==== CAS-2588 WINDUP_SURGE DARK QA: ${PASS} PASS / ${FAIL} FAIL ====`);
  await browser.close();
  await server.close();
  process.exit(FAIL === 0 ? 0 : 1);
} catch (e) {
  console.error("HARNESS ERROR", e);
  try { await browser.close(); } catch (_) {}
  try { await server.close(); } catch (_) {}
  process.exit(2);
}
