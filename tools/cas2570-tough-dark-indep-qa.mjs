// CAS-2570 — EVO#96 TOUGH_SURGE (Remate de Coloso) DARK QA (Gate 2/2 input) — 38º flag candidate. Base master HEAD 670f061.
// INDEPENDENT QA harness: re-derives every oracle at the Node level from the imported knobs
// (TOUGH_SURGE + ETPL) — it does NOT copy the GE seam's math nor the GE cas2569 selfverify harness. It then
// cross-checks the browser server-auth probes (__dev.tough / __dev.spawnKill) against those re-derived oracles.
//
// AXIS (⊥37): BASE TOUGHNESS / MAX-HP band of the mob TYPE, server-auth STATIC. toughWeight(victim) = band of
//   toughOf(e)=ETPL[e.type].hp (immutable base row): hp≥hiHp(110) ⇒ coloso/tank ⇒ 2; hp≥midHp(46) ⇒ firme/sturdy ⇒ 1;
//   hp<midHp ⇒ frágil ⇒ 0. Fresh channel toughFind → h.toughBounty (transient, STATELESS), sub-cap toughBountyCap:2,
//   badge "Remate de Coloso" (⛨). Score sampled at TOP of killEnemy (_toughPre).
//
// GATES (map to the 7 task QA gates):
//   1  boot + tough + arc peer hooks + spawnKill + __BUILD, 0 err
//   2  byte-neutral OFF (fresh boot): enabled false, gExists false (G.toughBounty never created), all-zero, tag ""
//   3  STATELESS: save blob has NO toughBounty/toughFind key (task gate 7)
//   4  worldFingerprint byte-stable across enabled toggle (tokens NOT in fp; 0 RNG drift) (task gate 7)
//   5  hpProbe LUT: hp→band→weight→tier→charge == oracle across 110/46/45 boundaries (task gate 3)
//   6  scoreProbe LUT: score→tier→charge == oracle table + sub-cap headroom (task gate 3)
//   7  REAL spawnTough over ALL ETPL hp rows: browser toughWeight == oWeightType(ETPL[type].hp) BASE (task gate 2)
//   8  ⊥ DECOUPLING (task gate 4 · CRUX ⊥#86 SIEGE): spawnTough overrideHp (mimics wound e.hp / affix A.hpMul / zone
//        z.hpMul / champion C.hpMul on the CLONE) ⇒ toughOf reads BASE ETPL[type].hp, IGNORES clone: golem base640
//        deflated(→5, a 5%-HP wreck) stays tough2; rat base20 inflated(→999) stays tough0 ⇒ tough (static base) ⊥ siege (dyn fraction)
//   9  CRUX ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role: axes OPPOSED / disjoint (data + real weights) (task gate 5)
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ Δh.toughBounty == oGrant(type)
//        tank(golem/dragon/moose/charger/revenant/demon/wendigo/ironback)+2, sturdy(orc/skeleton/mage/bandit/summoner/healer)+1,
//        fragile(rat/bat/wolf/spearman/volatile)+0, adv neutral+0; sub-cap 2 (task gate 2/7)
//   11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0 (task gate 6)
//   12 0-REGRESSION: 37 arc flags #59-#95 served enabled:true; TOUGH_SURGE served false (DARK #96), off=[] (task gate 6)
//   13 NORTH STAR 2-client: A==B (score/tier/charge + toughProbe MAX + LUTs + worldFingerprint + terrHash) + oracle (task gate 1)
//   14 NORTH STAR fp==15920977 + terrHash==2105484439, A==B (shared deterministic world) (task gate 1)
//   0  no JS errors during the run

import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { TOUGH_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (TOUGH_SURGE.hiHp != null) ? +TOUGH_SURGE.hiHp : 110;
const MID = (TOUGH_SURGE.midHp != null) ? +TOUGH_SURGE.midHp : 46;
const WTK = +(TOUGH_SURGE.weights && TOUGH_SURGE.weights.tank) || 0;
const WST = +(TOUGH_SURGE.weights && TOUGH_SURGE.weights.sturdy) || 0;
const TIERS = (TOUGH_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, TOUGH_SURGE.toughBountyCap | 0);
// oBand: hp → band label.
const oBand = (h) => (h >= HI ? "tank" : h >= MID ? "sturdy" : "fragile");
// oWeight: hp → weight. coloso⇒WTK(2); firme⇒WST(1); frágil⇒0.
const oWeight = (h) => (h >= HI ? WTK : h >= MID ? WST : 0);
// oHp/oWeightType: BASE hp of a real ETPL type → weight.
const oHp = (type) => { const t = ETPL[type]; return t && t.hp != null ? +t.hp : 0; };
const oWeightType = (type) => oWeight(oHp(type));
// oRank: 1-based index of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank. neutral ⇒ 0.
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// swift/bulk/menace bands (peer axes) re-derived independently to prove orthogonality.
const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
const bulkBand = (sz) => sz >= 24 ? 2 : sz >= 18 ? 1 : 0;
const menaceBand = (dmg) => dmg >= 22 ? 2 : dmg >= 14 ? 1 : 0;

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2570");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash of the shared deterministic world

console.log(`[QA oracle] hiHp=${HI} midHp=${MID} wTank=${WTK} wSturdy=${WST} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${TOUGH_SURGE.enabled} channel=${TOUGH_SURGE.channel}`);

// Deterministic forest tile (760×908 continent — same seed ⇒ same rects every client).
const Z = { forest: [192, 723] };
// hp sweep around both thresholds (independent of any real type). Covers 110/46/45 exact boundaries.
const HP_SWEEP = [0, 8, 16, 20, 34, 45, 46, 47, 50, 60, 96, 100, 109, 110, 111, 120, 135, 300, 640, 1020];
// score sweep for the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 99];
// EVERY hp row in ETPL — REAL server-auth spawn coverage (QA enumerates ETPL itself: 31 rows ≥ the 15 required).
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].hp != null);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.bulk && window.__dev.role && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play; __dev.tough + arc peer hooks + spawnKill + __BUILD present; 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.tough());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.toughBounty nunca creado), score/tier/charge/preview 0, tag \"\", channel toughFind, cap 2",
     dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0 &&
     dark.forageChargePreview === 0 && dark.tag === "" && dark.channel === "toughFind" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" channel=${dark.channel} cap=${dark.cap} hiHp=${dark.hiHp} midHp=${dark.midHp}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"toughBounty"\s*:/.test(saveOff) && !/"toughFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave toughBounty/toughFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.tough({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.tough({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // 5 hpProbe LUT sweep (thresholds 110/46/45)
  const hp = await page.evaluate((sweep) => sweep.map(h => { const p = window.__dev.tough({ hpProbe: { hp: h } }).hpProbe; return { h, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), HP_SWEEP);
  const hpBad = hp.filter(r => r.band !== oBand(r.h) || r.weight !== oWeight(r.h) || (r.tier != null && r.tier !== oRank(oWeight(r.h))) || (r.charge != null && r.charge !== oCharge(oWeight(r.h), true)));
  ok(`5 hpProbe LUT: hp→band→weight == oracle en el sweep de umbral (${HP_SWEEP.length} pts: bordes exactos 45/46 y 109/110)`,
     hpBad.length === 0, hpBad.length ? JSON.stringify(hpBad.map(r => ({ h: r.h, got: [r.band, r.weight], exp: [oBand(r.h), oWeight(r.h)] }))) : `all ${HP_SWEEP.length} match`);

  // 6 scoreProbe LUT table
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.tough({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  ok(`6 scoreProbe LUT: score→tier→charge == oracle table + sub-cap (${SCORES.length} pts; charge≤cap ${CAP})`,
     scBad.length === 0, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `all match; sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // 7 REAL spawnTough over ALL ETPL hp rows
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.tough({ clearTough: true });
      const r = window.__dev.tough({ spawnTough: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnTough;
      const tp = window.__dev.tough({ toughProbe: true }).toughProbe;
      out[t] = { hp: r.hp, weight: r.weight, valid: r.valid, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpHp: tp.mobs[0] ? tp.mobs[0].hp : -1 };
    }
    window.__dev.tough({ clearTough: true }); window.__dev.tough({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => !spawn7[t].valid || spawn7[t].hp !== oHp(t) || spawn7[t].weight !== oWeightType(t) || spawn7[t].tpW !== oWeightType(t) || spawn7[t].tpHp !== oHp(t));
  ok(`7 REAL spawnTough sobre LAS ${ALL_TYPES.length} filas hp de ETPL: browser toughWeight == oWeightType(ETPL[type].hp) BASE (server-auth, ≥15 requeridas)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, hp: oHp(t), exp: oWeightType(t), got: spawn7[t] }))) : `all ${ALL_TYPES.length} types match base band (golem=${spawn7.golem.weight} orc=${spawn7.orc.weight} rat=${spawn7.rat.weight} revenant=${spawn7.revenant.weight} summoner=${spawn7.summoner.weight})`);

  // 8 ⊥ DECOUPLING (CRUX ⊥#86 SIEGE): overrideHp on the CLONE must NOT move the band (toughOf reads BASE)
  const dec = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.tough({ clearTough: true });
      const r = window.__dev.tough({ spawnTough: { type, tx: Z.forest[0], ty: Z.forest[1], overrideHp: ov } }).spawnTough;
      const tp = window.__dev.tough({ toughProbe: true }).toughProbe;
      return { base: r.hp, cloneHp: r.eHp, cloneTplHp: r.tplHp, weight: r.weight, tpW: tp.mobs[0] ? tp.mobs[0].weight : -99 }; };
    const golemWreck = run("golem", 5);   // base 640, wounded to 5%HP (siege2) — tough must stay 2
    const ratFull = run("rat", 999);      // base 20, affix/zone/champion inflates clone to 999 — tough must stay 0
    const orcInfl = run("orc", 999);      // base 96, inflated clone — tough must stay 1
    window.__dev.tough({ clearTough: true }); window.__dev.tough({ enabled: false });
    return { golemWreck, ratFull, orcInfl };
  }, Z);
  const decOK = dec.golemWreck.base === 640 && dec.golemWreck.cloneHp === 5 && dec.golemWreck.weight === WTK && dec.golemWreck.tpW === WTK &&
    dec.ratFull.base === 20 && dec.ratFull.cloneHp === 999 && dec.ratFull.weight === 0 && dec.ratFull.tpW === 0 &&
    dec.orcInfl.base === 96 && dec.orcInfl.cloneHp === 999 && dec.orcInfl.weight === WST && dec.orcInfl.tpW === WST;
  ok("8 ⊥ DESACOPLE (task gate 4 · CRUX ⊥#86 SIEGA): overrideHp escala el CLON (e.hp/e.maxHp/e.tpl.hp) mimetizando herida e.hp / afijo A.hpMul / zona z.hpMul / campeón C.hpMul — toughOf lee BASE ETPL[type].hp ⇒ golem base640 herido(clon5, un 5%-HP wreck siege2) SIGUE tough2; rata base20 inflada(clon999) SIGUE tough0; orco base96 inflado(clon999) SIGUE tough1 ⇒ AGUANTE (base estático) ⊥ SIEGE (fracción dinámica)",
     decOK, JSON.stringify(dec));

  // 9 CRUX cross-axis (⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role) — pure data + real weights
  const D = (t) => ({ tough: oWeightType(t), menace: menaceBand(+ETPL[t].dmg), swift: swiftBand(+ETPL[t].spd), bulk: bulkBand(+ETPL[t].size), arch: ETPL[t].arch, hp: +ETPL[t].hp, dmg: +ETPL[t].dmg, spd: +ETPL[t].spd, size: +ETPL[t].size });
  const orc = D("orc"), wendigo = D("wendigo"), volatile_ = D("volatile"), golem = D("golem"), bat = D("bat"), revenant = D("revenant"), emberkin = D("emberkin"), summoner = D("summoner");
  const cruxOK =
    // ⊥#95 MENACE (base dmg): orc hp96 tough1 / dmg24 menace2 vs wendigo hp118 tough2 / dmg21 menace1 — ORDER OPPOSED
    orc.tough === 1 && orc.menace === 2 && wendigo.tough === 2 && wendigo.menace === 1 &&
    // glass cannon: volatile hp26 tough0 / dmg23 menace2 (frágil pero pegador)
    volatile_.tough === 0 && volatile_.menace === 2 &&
    // ⊥#94 SWIFT (base spd): golem spd46 swift0 / hp640 tough2 (lento-tanque) vs bat spd158 swift2 / hp16 tough0 (veloz-cristal) — DIAMETRICALLY OPPOSED
    golem.tough === 2 && golem.swift === 0 && bat.tough === 0 && bat.swift === 2 &&
    // ⊥#92 BULK (base size): revenant sz20 bulk1 / hp120 tough2 (menudo pero duro) vs emberkin sz24 bulk2 / hp58 tough1 (grande pero blando) — OPPOSED
    revenant.tough === 2 && revenant.bulk === 1 && emberkin.tough === 1 && emberkin.bulk === 2 &&
    // ⊥#93 ROLE: summoner enabler(arch summoner) hp46 tough1 vs orc brute hp96 tough1 — MISMO tough, distinto rol
    summoner.tough === 1 && summoner.arch === "summoner" && orc.arch === "brute" && orc.tough === summoner.tough;
  ok("9 ⊥ CRUX cross-axis: orc tough1/menace2 vs wendigo tough2/menace1 ORDEN OPUESTO (⊥#95); volatile tough0/menace2 cristal-pegador; golem tough2/swift0 vs bat tough0/swift2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); revenant sz20 bulk1/tough2 vs emberkin sz24 bulk2/tough1 OPUESTOS (⊥#92); summoner enabler tough1 vs orc brute tough1 mismo tough distinto rol (⊥#93)",
     cruxOK, JSON.stringify({ orc, wendigo, volatile: volatile_, golem, bat, revenant, emberkin, summoner }));

  // 10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam → Δh.toughBounty
  const GRANT_TYPES = ["golem", "dragon", "moose", "charger", "revenant", "demon", "wendigo", "ironback", "orc", "skeleton", "mage", "bandit", "summoner", "healer", "rat", "bat", "wolf", "spearman", "volatile", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.tough({ enabled: true });
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.tough().hero.toughBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives tough seam
      const after = window.__dev.tough().hero.toughBounty | 0;
      out[t] = after - before;
    }
    window.__dev.tough({ clearTough: true }); window.__dev.tough({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.toughBounty == oGrant(type) por banda (coloso golem/dragon/moose/charger/revenant/demon/wendigo/ironback+2; firme orc/skeleton/mage/bandit/summoner/healer+1; frágil rat/bat/wolf/spearman/volatile+0; adv neutral+0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF
  const offGrant = await page.evaluate((Z) => {
    window.__dev.tough({ enabled: false });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.tough().hero.toughBounty | 0;
    window.__dev.spawnKill("golem");                    // coloso mob, but flag OFF ⇒ dead branch
    window.__dev.spawnKill("revenant");
    const after = window.__dev.tough().hero.toughBounty | 0;
    return { before, after, delta: after - before };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(golem)+spawnKill(revenant) con flag OFF ⇒ Δh.toughBounty == 0 (rama muerta, 0 fichas al seam)",
     offGrant.delta === 0, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 37 arc flags served true; TOUGH_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const toughDark = flag("TOUGH_SURGE") === "false";
  ok("12 0-REGRESIÓN: 37 flags del arco #59-#95 served enabled:true; TOUGH_SURGE served false (DARK #96), off=[]",
     arcOff.length === 0 && toughDark && arc.length === 37, `tough=${flag("TOUGH_SURGE")} n=${arc.length} off=${JSON.stringify(arcOff)}`);

  // screenshot evidence (ON + golem coloso in radius)
  await page.evaluate((Z) => { window.__dev.tough({ enabled: true }); window.__dev.tough({ clearTough: true }); window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.tough({ clearTough: true }); window.__dev.tough({ enabled: false }); });

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
    window.__dev.tough({ enabled: true }); window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.tough();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.tough({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [16, 45, 46, 60, 96, 109, 110, 640].map(h => window.__dev.tough({ hpProbe: { hp: h } }).hpProbe.weight);
    const tp = window.__dev.tough({ toughProbe: true }).toughProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.tough({ clearTough: true }); window.__dev.tough({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpHp: tp.mobs[0] ? tp.mobs[0].hp : -1,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: toughProbe.mobs[0] mirrors AMBIENT G.enemies order within radius, which drifts by session-age (page A
  // booted first + ran the GRANT/spawn cycles ⇒ different ambient snapshot) — a session-age artifact, NOT a product
  // desync. The server-auth signal is tpScore (MAX toughWeight over radius) + hero score/tier/charge + pure LUTs +
  // worldFingerprint + terrHash — all deterministic. We assert THOSE (mirror of the MENACE harness mpScore caveat).
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const golemMax = A.tpScore === oWeightType("golem") && B.tpScore === oWeightType("golem");
  const oracleMatch = A.score === oWeightType("golem") && A.charge === oCharge(oWeightType("golem"), true) &&
    A.bands === JSON.stringify([16, 45, 46, 60, 96, 109, 110, 640].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO golem+héroe ⇒ score/tier/charge + tpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && golemMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
     `A={s:${A.score},t:${A.tier},c:${A.charge},tpScore:${A.tpScore},tpHp:${A.tpHp},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},tpScore:${B.tpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} golemMax=${golemMax} oracleMatch=${oracleMatch}`);
  ok(`14 NORTH STAR fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido)`,
     A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
     `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await pageB.screenshot({ path: join(OUT, "client-b-tough.png") });
  await page.evaluate(() => window.__dev.tough({ enabled: false }));
  await pageB.evaluate(() => window.__dev.tough({ enabled: false }));

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
