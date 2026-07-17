// CAS-2576 — EVO#97 SENTINEL_SURGE (Remate de Vigía) DARK QA (Gate 2/2 input) — 39º flag candidate. Base master HEAD 4ee90af.
// INDEPENDENT QA harness: re-derives every oracle at the Node level from the imported knobs
// (SENTINEL_SURGE + ETPL) — it does NOT copy the GE seam's math nor the GE cas2573 selfverify harness. It then
// cross-checks the browser server-auth probes (__dev.sentinel / __dev.spawnKill) against those re-derived oracles.
//
// AXIS (⊥38): BASE PERCEPTION / AGGRO-RADIUS band of the mob TYPE, server-auth STATIC (how far its FACTORY type detects
//   you). sentinelWeight(victim) = band of sentinelOf(e)=ETPL[e.type].aggro (immutable base row): aggro≥hiAggro(320) ⇒
//   vigía/vigilant ⇒ 2; aggro≥midAggro(250) ⇒ vigilante moderado/wary ⇒ 1; aggro<midAggro ⇒ despistado/oblivious ⇒ 0.
//   Fresh channel sentinelFind → h.sentinelBounty (transient, STATELESS), sub-cap sentinelBountyCap:2, badge "Remate de
//   Vigía" (◎). Score sampled at TOP of killEnemy (_sentinelPre). PIVOT: recommended REACH (ETPL[type].range) COLLIDES
//   with #84 SKIRMISH (skirmishWeight reads e.tpl.range as SCORE) ⇒ pivoted to the fresh sanctioned axis PERCEPTION.
//
// GATES (map to the 7 task QA gates):
//   1  boot + sentinel + arc peer hooks + spawnKill + __BUILD, 0 err
//   2  byte-neutral OFF (fresh boot): enabled false, gExists false (G.sentinelBounty never created), all-zero, tag ""
//   3  STATELESS: save blob has NO sentinelBounty/sentinelFind key (task gate 7)
//   4  worldFingerprint byte-stable across enabled toggle (tokens NOT in fp; 0 RNG drift) (task gate 7)
//   5  aggroProbe LUT: aggro→band→weight→tier→charge == oracle across 320/250/249 boundaries (task gate 3)
//   6  scoreProbe LUT: score→tier→charge == oracle table + sub-cap headroom (task gate 3)
//   7  REAL spawnSentinel over ALL ETPL aggro rows: browser sentinelWeight == oWeightType(ETPL[type].aggro) BASE (gate 2)
//   8  ⊥ DECOUPLING (task gate 4 · CRUX ⊥override/⊥#74/⊥champion/⊥hostil): spawnSentinel overrideAggro (mimics
//        makeHostile clone→300 / champion Math.max(base,320) / boss Math.max(base,340) / spirit→0 on the CLONE) ⇒
//        sentinelOf reads BASE ETPL[type].aggro, IGNORES clone: orc base220 clone999 stays sentinel0; mage base340
//        clone10 stays sentinel2; spearman base300 clone999 stays sentinel1; adv neutral base0 clone300 stays sentinel0
//   9  CRUX ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role: axes OPPOSED / disjoint (data + real) (gate 5)
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ Δh.sentinelBounty == oGrant(type)
//        vigilant(mage/summoner/healer/demon/wendigo/golem/dragon)+2, wary(bandit/moose/spearman/charger/volatile/revenant)+1,
//        oblivious(rat/orc/bat/ironback/skeleton/wolf)+0, adv neutral+0; sub-cap 2 (task gate 2/7)
//   11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0 (task gate 6)
//   12 0-REGRESSION: 38 arc flags #59-#96 served enabled:true; SENTINEL_SURGE served false (DARK #97), off=[] (gate 6)
//   13 NORTH STAR 2-client: A==B (score/tier/charge + sentinelProbe MAX + LUTs + worldFingerprint + terrHash) + oracle (gate 1)
//   14 NORTH STAR fp==15920977 + terrHash==2105484439, A==B (shared deterministic world) (task gate 1)
//   0  no JS errors during the run

import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { SENTINEL_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (SENTINEL_SURGE.hiAggro != null) ? +SENTINEL_SURGE.hiAggro : 320;
const MID = (SENTINEL_SURGE.midAggro != null) ? +SENTINEL_SURGE.midAggro : 250;
const WV = +(SENTINEL_SURGE.weights && SENTINEL_SURGE.weights.vigilant) || 0;
const WW = +(SENTINEL_SURGE.weights && SENTINEL_SURGE.weights.wary) || 0;
const TIERS = (SENTINEL_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, SENTINEL_SURGE.sentinelBountyCap | 0);
// oBand: aggro → band label.
const oBand = (a) => (a >= HI ? "vigilant" : a >= MID ? "wary" : "oblivious");
// oWeight: aggro → weight. vigía⇒WV(2); vigilante moderado⇒WW(1); despistado⇒0.
const oWeight = (a) => (a >= HI ? WV : a >= MID ? WW : 0);
// oAggro/oWeightType: BASE aggro of a real ETPL type → weight.
const oAggro = (type) => { const t = ETPL[type]; return t && t.aggro != null ? +t.aggro : 0; };
const oWeightType = (type) => oWeight(oAggro(type));
// oRank: 1-based index of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank. neutral ⇒ 0.
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axis bands (tough/swift/bulk/menace) re-derived independently to prove orthogonality.
const toughBand = (hp) => hp >= 110 ? 2 : hp >= 46 ? 1 : 0;
const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
const bulkBand = (sz) => sz >= 24 ? 2 : sz >= 18 ? 1 : 0;
const menaceBand = (dmg) => dmg >= 22 ? 2 : dmg >= 14 ? 1 : 0;

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2576");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash of the shared deterministic world

console.log(`[QA oracle] hiAggro=${HI} midAggro=${MID} wVigilant=${WV} wWary=${WW} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${SENTINEL_SURGE.enabled} channel=${SENTINEL_SURGE.channel} radius=${SENTINEL_SURGE.radius}`);

// Deterministic forest tile (760×908 continent — same seed ⇒ same rects every client).
const Z = { forest: [192, 723] };
// aggro sweep around both thresholds (independent of any real type). Covers 320/250/249 exact boundaries.
const AGGRO_SWEEP = [0, 100, 170, 220, 230, 240, 249, 250, 251, 260, 290, 300, 319, 320, 321, 330, 340, 360, 380, 999];
// score sweep for the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 99];
// EVERY aggro row in ETPL — REAL server-auth spawn coverage (QA enumerates ETPL itself: 31 rows ≥ the 15 required).
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].aggro != null);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.bulk && window.__dev.role && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play; __dev.sentinel + arc peer hooks + spawnKill + __BUILD present; 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.sentinel());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.sentinelBounty nunca creado), score/tier/charge/preview 0, tag \"\", channel sentinelFind, cap 2",
     dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0 &&
     dark.forageChargePreview === 0 && dark.tag === "" && dark.channel === "sentinelFind" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" channel=${dark.channel} cap=${dark.cap} hiAggro=${dark.hiAggro} midAggro=${dark.midAggro} weights=${JSON.stringify(dark.weights)}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"sentinelBounty"\s*:/.test(saveOff) && !/"sentinelFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave sentinelBounty/sentinelFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.sentinel({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.sentinel({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // 5 aggroProbe LUT sweep (thresholds 320/250)
  const ag = await page.evaluate((sweep) => sweep.map(a => { const p = window.__dev.sentinel({ aggroProbe: { aggro: a } }).aggroProbe; return { a, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), AGGRO_SWEEP);
  const agBad = ag.filter(r => r.band !== oBand(r.a) || r.weight !== oWeight(r.a) || (r.tier != null && r.tier !== oRank(oWeight(r.a))) || (r.charge != null && r.charge !== oCharge(oWeight(r.a), true)));
  ok(`5 aggroProbe LUT: aggro→band→weight == oracle en el sweep de umbral (${AGGRO_SWEEP.length} pts: bordes exactos 249/250 y 319/320)`,
     agBad.length === 0, agBad.length ? JSON.stringify(agBad.map(r => ({ a: r.a, got: [r.band, r.weight], exp: [oBand(r.a), oWeight(r.a)] }))) : `all ${AGGRO_SWEEP.length} match`);

  // 6 scoreProbe LUT table
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.sentinel({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  ok(`6 scoreProbe LUT: score→tier→charge == oracle table + sub-cap (${SCORES.length} pts; charge≤cap ${CAP})`,
     scBad.length === 0, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `all match; sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // 7 REAL spawnSentinel over ALL ETPL aggro rows
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.sentinel({ clearSentinel: true });
      const r = window.__dev.sentinel({ spawnSentinel: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSentinel;
      const sp = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;
      out[t] = { aggro: r.aggro, weight: r.weight, valid: r.valid, spW: sp.mobs[0] ? sp.mobs[0].weight : -1, spA: sp.mobs[0] ? sp.mobs[0].aggro : -1 };
    }
    window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => !spawn7[t].valid || spawn7[t].aggro !== oAggro(t) || spawn7[t].weight !== oWeightType(t) || spawn7[t].spW !== oWeightType(t) || spawn7[t].spA !== oAggro(t));
  ok(`7 REAL spawnSentinel sobre LAS ${ALL_TYPES.length} filas aggro de ETPL: browser sentinelWeight == oWeightType(ETPL[type].aggro) BASE (server-auth, ≥15 requeridas)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, aggro: oAggro(t), exp: oWeightType(t), got: spawn7[t] }))) : `all ${ALL_TYPES.length} types match base band (mage=${spawn7.mage.weight} golem=${spawn7.golem.weight} orc=${spawn7.orc.weight} bandit=${spawn7.bandit.weight} summoner=${spawn7.summoner.weight} adv=${spawn7.adv.weight})`);

  // 8 ⊥ DECOUPLING (CRUX ⊥override/⊥#74/⊥champion/⊥hostil): overrideAggro on the CLONE must NOT move the band (sentinelOf reads BASE)
  const dec = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.sentinel({ clearSentinel: true });
      const r = window.__dev.sentinel({ spawnSentinel: { type, tx: Z.forest[0], ty: Z.forest[1], overrideAggro: ov } }).spawnSentinel;
      const sp = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;
      return { base: r.aggro, cloneAggro: r.tplAggro, weight: r.weight, spW: sp.mobs[0] ? sp.mobs[0].weight : -99 }; };
    const orcHostile = run("orc", 999);      // base 220, makeHostile/champion inflates clone to 999 — sentinel must stay 0
    const mageSpirit = run("mage", 10);       // base 340, spirit clone deflates to 10 — sentinel must stay 2
    const spearWary = run("spearman", 999);   // base 300, inflated clone — sentinel must stay 1
    const advHostile = run("adv", 300);       // base 0 neutral, makeHostile clone→300 — sentinel must stay 0
    window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ enabled: false });
    return { orcHostile, mageSpirit, spearWary, advHostile };
  }, Z);
  const decOK = dec.orcHostile.base === 220 && dec.orcHostile.cloneAggro === 999 && dec.orcHostile.weight === 0 && dec.orcHostile.spW === 0 &&
    dec.mageSpirit.base === 340 && dec.mageSpirit.cloneAggro === 10 && dec.mageSpirit.weight === WV && dec.mageSpirit.spW === WV &&
    dec.spearWary.base === 300 && dec.spearWary.cloneAggro === 999 && dec.spearWary.weight === WW && dec.spearWary.spW === WW &&
    dec.advHostile.base === 0 && dec.advHostile.cloneAggro === 300 && dec.advHostile.weight === 0 && dec.advHostile.spW === 0;
  ok("8 ⊥ DESACOPLE (task gate 4 · ⊥override/⊥#74/⊥campeón/⊥hostil): overrideAggro escala el CLON e.tpl.aggro mimetizando makeHostile(clon300)/campeón(Math.max(base,320))/jefe(Math.max(base,340))/espíritu(0) — sentinelOf lee BASE ETPL[type].aggro ⇒ orco base220 hostil(clon999) SIGUE sentinel0; mago base340 espíritu(clon10) SIGUE sentinel2; lancero base300 inflado(clon999) SIGUE sentinel1; adv neutral base0 hostil(clon300) SIGUE sentinel0 ⇒ PERCEPCIÓN (base estática) ⊥ hostilidad/campeón/jefe (clon dinámico)",
     decOK, JSON.stringify(dec));

  // 9 CRUX cross-axis (⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role) — pure data + real weights
  const D = (t) => ({ sentinel: oWeightType(t), tough: toughBand(+ETPL[t].hp), menace: menaceBand(+ETPL[t].dmg), swift: swiftBand(+ETPL[t].spd), bulk: bulkBand(+ETPL[t].size), arch: ETPL[t].arch, aggro: +ETPL[t].aggro, hp: +ETPL[t].hp, dmg: +ETPL[t].dmg, spd: +ETPL[t].spd, size: +ETPL[t].size });
  const ironback = D("ironback"), mage = D("mage"), summoner = D("summoner"), orc = D("orc"), bat = D("bat"), wisp = D("wisp");
  const cruxOK =
    // ⊥#96 TOUGH (base hp): ironback hp112 tough2 / aggro220 sentinel0 (coloso-despistado) vs mage hp56 tough1 / aggro340 sentinel2 (firme-vigía) — ORDER OPPOSED
    ironback.tough === 2 && ironback.sentinel === 0 && mage.tough === 1 && mage.sentinel === 2 &&
    // ⊥#95 MENACE (base dmg): summoner dmg0 menace0 / aggro330 sentinel2 (inofensivo-vigía) vs orc dmg24 menace2 / aggro220 sentinel0 (pegador-despistado) — OPPOSED
    summoner.menace === 0 && summoner.sentinel === 2 && orc.menace === 2 && orc.sentinel === 0 &&
    // ⊥#94 SWIFT (base spd): bat spd158 swift2 / aggro220 sentinel0 (veloz-ciego) vs mage spd62 swift0 / aggro340 sentinel2 (lento-vigía) — DIAMETRICALLY OPPOSED
    bat.swift === 2 && bat.sentinel === 0 && mage.swift === 0 && mage.sentinel === 2 &&
    // ⊥#92 BULK (base size): wisp sz18 bulk1 / aggro330 sentinel2 (menudo-vigilante) vs ironback sz28 bulk2 / aggro220 sentinel0 (grande-despistado) — OPPOSED
    wisp.bulk === 1 && wisp.sentinel === 2 && ironback.bulk === 2 && ironback.sentinel === 0 &&
    // ⊥#93 ROLE: mage caster(rol0)/sentinel2 vs summoner enabler(rol2)/sentinel2 — MISMO sentinel, distinto rol
    mage.arch === "caster" && summoner.arch === "summoner" && mage.sentinel === summoner.sentinel && mage.sentinel === 2;
  ok("9 ⊥ CRUX cross-axis: ironback tough2/sentinel0 vs mage tough1/sentinel2 ORDEN OPUESTO (⊥#96); summoner menace0/sentinel2 vs orc menace2/sentinel0 OPUESTO (⊥#95); bat swift2/sentinel0 vs mage swift0/sentinel2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); wisp bulk1/sentinel2 vs ironback bulk2/sentinel0 OPUESTOS (⊥#92); mage caster sentinel2 vs summoner enabler sentinel2 mismo sentinel distinto rol (⊥#93)",
     cruxOK, JSON.stringify({ ironback, mage, summoner, orc, bat, wisp }));

  // 10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam → Δh.sentinelBounty
  const GRANT_TYPES = ["mage", "summoner", "healer", "demon", "wendigo", "golem", "dragon", "wraith", "bandit", "moose", "spearman", "charger", "volatile", "revenant", "rat", "orc", "bat", "ironback", "skeleton", "wolf", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.sentinel({ enabled: true });
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.sentinel().hero.sentinelBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives sentinel seam
      const after = window.__dev.sentinel().hero.sentinelBounty | 0;
      out[t] = after - before;
    }
    window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.sentinelBounty == oGrant(type) por banda (vigía mage/summoner/healer/demon/wendigo/golem/dragon/wraith+2; vigilante moderado bandit/moose/spearman/charger/volatile/revenant+1; despistado rat/orc/bat/ironback/skeleton/wolf+0; adv neutral+0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF
  const offGrant = await page.evaluate((Z) => {
    window.__dev.sentinel({ enabled: false });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.sentinel().hero.sentinelBounty | 0;
    window.__dev.spawnKill("mage");                     // vigía mob, but flag OFF ⇒ dead branch
    window.__dev.spawnKill("golem");
    const after = window.__dev.sentinel().hero.sentinelBounty | 0;
    return { before, after, delta: after - before };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(mage)+spawnKill(golem) con flag OFF ⇒ Δh.sentinelBounty == 0 (rama muerta, 0 fichas al seam)",
     offGrant.delta === 0, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 38 arc flags served true; SENTINEL_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const sentinelDark = flag("SENTINEL_SURGE") === "false";
  ok("12 0-REGRESIÓN: 38 flags del arco #59-#96 served enabled:true; SENTINEL_SURGE served false (DARK #97), off=[]",
     arcOff.length === 0 && sentinelDark && arc.length === 38, `sentinel=${flag("SENTINEL_SURGE")} n=${arc.length} off=${JSON.stringify(arcOff)}`);

  // screenshot evidence (ON + mage vigía in radius)
  await page.evaluate((Z) => { window.__dev.sentinel({ enabled: true }); window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ enabled: false }); });

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
    window.__dev.sentinel({ enabled: true }); window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.sentinel();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.sentinel({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [0, 170, 220, 249, 250, 300, 319, 320, 340].map(a => window.__dev.sentinel({ aggroProbe: { aggro: a } }).aggroProbe.weight);
    const sp = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spScore: sp.score, spW: sp.mobs[0] ? sp.mobs[0].weight : -1, spA: sp.mobs[0] ? sp.mobs[0].aggro : -1,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: sentinelProbe.mobs[0] mirrors AMBIENT G.enemies order within radius, which drifts by session-age (page A
  // booted first + ran the GRANT/spawn cycles ⇒ different ambient snapshot) — a session-age artifact, NOT a product
  // desync. The server-auth signal is spScore (MAX sentinelWeight over radius) + hero score/tier/charge + pure LUTs +
  // worldFingerprint + terrHash — all deterministic. We assert THOSE (mirror of the TOUGH harness tpScore caveat).
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const mageMax = A.spScore === oWeightType("mage") && B.spScore === oWeightType("mage");
  const oracleMatch = A.score === oWeightType("mage") && A.charge === oCharge(oWeightType("mage"), true) &&
    A.bands === JSON.stringify([0, 170, 220, 249, 250, 300, 319, 320, 340].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO mage+héroe ⇒ score/tier/charge + spScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && mageMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
     `A={s:${A.score},t:${A.tier},c:${A.charge},spScore:${A.spScore},spA:${A.spA},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},spScore:${B.spScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} mageMax=${mageMax} oracleMatch=${oracleMatch}`);
  ok(`14 NORTH STAR fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido)`,
     A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
     `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await pageB.screenshot({ path: join(OUT, "client-b-sentinel.png") });
  await page.evaluate(() => window.__dev.sentinel({ enabled: false }));
  await pageB.evaluate(() => window.__dev.sentinel({ enabled: false }));

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
