// CAS-2566 — EVO#95 MENACE_SURGE (Remate de Matón) DARK QA (Gate 2/2 input) — 37º flag candidate. Base master HEAD 59049ef.
// INDEPENDENT QA harness: re-derives every oracle at the Node level from the imported knobs
// (MENACE_SURGE + ETPL) — it does NOT copy the GE seam's math nor the GE selfverify harness. It then
// cross-checks the browser server-auth probes (__dev.menace / __dev.spawnKill) against those re-derived oracles.
//
// AXIS (⊥36): BASE DAMAGE-OUTPUT of the mob TYPE, server-auth STATIC. menaceWeight(victim) = band of
//   menaceOf(e)=ETPL[e.type].dmg (immutable base row): dmg≥hiDmg(22) ⇒ matón/heavy ⇒ 2; dmg≥midDmg(14) ⇒
//   moderate ⇒ 1; dmg<midDmg ⇒ feeble (or dmg:0 enabler) ⇒ 0. Fresh channel menaceFind → h.menaceBounty
//   (transient, STATELESS), sub-cap menaceBountyCap:2, badge "Amenaza" (⤬). Score sampled at TOP of killEnemy (_menacePre).
//
// GATES (map to the 7 task QA gates):
//   1  boot + menace + arc peer hooks + spawnKill + __BUILD, 0 err
//   2  byte-neutral OFF (fresh boot): enabled false, gExists false (G.menaceBounty never created), all-zero, tag ""
//   3  STATELESS: save blob has NO menaceBounty/menaceFind key (task gate 7)
//   4  worldFingerprint byte-stable across enabled toggle (tokens NOT in fp; 0 RNG drift) (task gate 7)
//   5  dmgProbe LUT: dmg→band→weight→tier→charge == oracle across 22/14/13 boundaries (task gate 3)
//   6  scoreProbe LUT: score→tier→charge == oracle table + sub-cap headroom (task gate 3)
//   7  REAL spawnMenace over ALL ETPL dmg rows: browser menaceWeight == oWeightType(ETPL[type].dmg) BASE (task gate 2)
//   8  ⊥ DECOUPLING (task gate 4): spawnMenace overrideDmg (mimics affix A.dmgMul / zone z.dmgMul / champion C.dmgMul on the CLONE)
//        ⇒ menaceOf reads BASE ETPL[type].dmg, IGNORES the clone: wolf base10 inflated(→200) stays menace0; orc base24 deflated(→0) stays menace2
//   9  CRUX ⊥#94 SWIFT / ⊥#93 role / ⊥#92 bulk: axes DIAMETRICALLY opposed / disjoint (data + real weights) (task gate 5)
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ Δh.menaceBounty == oGrant(type)
//        heavy(orc/moose/volatile/revenant/charger/demon)+2, moderate(skeleton/mage/bandit/mudlurker/wendigo/wraith)+1,
//        feeble(rat/bat/wolf/spearman/summoner/healer)+0, adv neutral+0; sub-cap 2 (task gate 2/7)
//   11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0 (task gate 6)
//   12 0-REGRESSION: 36 arc flags #59-#94 served enabled:true; MENACE_SURGE served false (DARK #95), off=[] (task gate 6)
//   13 NORTH STAR 2-client: A==B (score/tier/charge + menaceProbe MAX + LUTs + worldFingerprint + terrHash) + oracle (task gate 1)
//   14 NORTH STAR fp==15920977 + terrHash==2105484439, A==B (shared deterministic world) (task gate 1)
//   0  no JS errors during the run

import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { MENACE_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (MENACE_SURGE.hiDmg != null) ? +MENACE_SURGE.hiDmg : 22;
const MID = (MENACE_SURGE.midDmg != null) ? +MENACE_SURGE.midDmg : 14;
const WHV = +(MENACE_SURGE.weights && MENACE_SURGE.weights.heavy) || 0;
const WMD = +(MENACE_SURGE.weights && MENACE_SURGE.weights.moderate) || 0;
const TIERS = (MENACE_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, MENACE_SURGE.menaceBountyCap | 0);
// oBand: dmg → band label.
const oBand = (d) => (d >= HI ? "heavy" : d >= MID ? "moderate" : "feeble");
// oWeight: dmg → weight. matón⇒WHV(2); moderado⇒WMD(1); alfeñique⇒0.
const oWeight = (d) => (d >= HI ? WHV : d >= MID ? WMD : 0);
// oDmg/oWeightType: BASE dmg of a real ETPL type → weight.
const oDmg = (type) => { const t = ETPL[type]; return t && t.dmg != null ? +t.dmg : 0; };
const oWeightType = (type) => oWeight(oDmg(type));
// oRank: 1-based index of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank. neutral ⇒ 0.
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2566");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash of the shared deterministic world

console.log(`[QA oracle] hiDmg=${HI} midDmg=${MID} wHeavy=${WHV} wModerate=${WMD} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${MENACE_SURGE.enabled} channel=${MENACE_SURGE.channel}`);

// Deterministic forest tile (760×908 continent — same seed ⇒ same rects every client).
const Z = { forest: [192, 723] };
// dmg sweep around both thresholds (independent of any real type). Covers 22/14/13 exact boundaries.
const DMG_SWEEP = [0, 6, 7, 10, 13, 14, 15, 16, 18, 21, 22, 23, 24, 26, 30, 34, 38];
// score sweep for the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 99];
// EVERY dmg row in ETPL — REAL server-auth spawn coverage (QA enumerates ETPL itself: 31 rows ≥ the 15 required).
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].dmg != null);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play; __dev.menace + arc peer hooks + spawnKill + __BUILD present; 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.menace());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.menaceBounty nunca creado), score/tier/charge/preview 0, tag \"\", channel menaceFind, cap 2",
     dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0 &&
     dark.forageChargePreview === 0 && dark.tag === "" && dark.channel === "menaceFind" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" channel=${dark.channel} cap=${dark.cap} hiDmg=${dark.hiDmg} midDmg=${dark.midDmg}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"menaceBounty"\s*:/.test(saveOff) && !/"menaceFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave menaceBounty/menaceFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.menace({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.menace({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // 5 dmgProbe LUT sweep (thresholds 22/14/13)
  const dp = await page.evaluate((sweep) => sweep.map(d => { const p = window.__dev.menace({ dmgProbe: { dmg: d } }).dmgProbe; return { d, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), DMG_SWEEP);
  const dpBad = dp.filter(r => r.band !== oBand(r.d) || r.weight !== oWeight(r.d) || (r.tier != null && r.tier !== oRank(oWeight(r.d))) || (r.charge != null && r.charge !== oCharge(oWeight(r.d), true)));
  ok(`5 dmgProbe LUT: dmg→band→weight == oracle en el sweep de umbral (${DMG_SWEEP.length} pts: bordes exactos 13/14 y 21/22)`,
     dpBad.length === 0, dpBad.length ? JSON.stringify(dpBad.map(r => ({ d: r.d, got: [r.band, r.weight], exp: [oBand(r.d), oWeight(r.d)] }))) : `all ${DMG_SWEEP.length} match`);

  // 6 scoreProbe LUT table
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.menace({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  ok(`6 scoreProbe LUT: score→tier→charge == oracle table + sub-cap (${SCORES.length} pts; charge≤cap ${CAP})`,
     scBad.length === 0, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `all match; sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // 7 REAL spawnMenace over ALL ETPL dmg rows
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.menace({ clearMenace: true });
      const r = window.__dev.menace({ spawnMenace: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnMenace;
      const mp = window.__dev.menace({ menaceProbe: true }).menaceProbe;
      out[t] = { dmg: r.dmg, weight: r.weight, valid: r.valid, mpW: mp.mobs[0] ? mp.mobs[0].weight : -1, mpDmg: mp.mobs[0] ? mp.mobs[0].dmg : -1 };
    }
    window.__dev.menace({ clearMenace: true }); window.__dev.menace({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => !spawn7[t].valid || spawn7[t].dmg !== oDmg(t) || spawn7[t].weight !== oWeightType(t) || spawn7[t].mpW !== oWeightType(t) || spawn7[t].mpDmg !== oDmg(t));
  ok(`7 REAL spawnMenace sobre LAS ${ALL_TYPES.length} filas dmg de ETPL: browser menaceWeight == oWeightType(ETPL[type].dmg) BASE (server-auth, ≥15 requeridas)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, dmg: oDmg(t), exp: oWeightType(t), got: spawn7[t] }))) : `all ${ALL_TYPES.length} types match base band (orc=${spawn7.orc.weight} bat=${spawn7.bat.weight} summoner=${spawn7.summoner.weight} skeleton=${spawn7.skeleton.weight} moose=${spawn7.moose.weight})`);

  // 8 ⊥ DECOUPLING: overrideDmg on the CLONE must NOT move the band (menaceOf reads BASE)
  const dec = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.menace({ clearMenace: true });
      const r = window.__dev.menace({ spawnMenace: { type, tx: Z.forest[0], ty: Z.forest[1], overrideDmg: ov } }).spawnMenace;
      const mp = window.__dev.menace({ menaceProbe: true }).menaceProbe;
      return { base: r.dmg, clone: r.eDmg, weight: r.weight, mpW: mp.mobs[0] ? mp.mobs[0].weight : -99 }; };
    const wolfFeroz = run("wolf", 200);   // base 10, affix 'Feroz'/champion inflates clone to 200
    const orcDefl = run("orc", 0);        // base 24, clone deflated to 0
    const batZone = run("bat", 300);      // base 7, absurd zone/affix inflation on the clone
    window.__dev.menace({ clearMenace: true }); window.__dev.menace({ enabled: false });
    return { wolfFeroz, orcDefl, batZone };
  }, Z);
  const decOK = dec.wolfFeroz.base === 10 && dec.wolfFeroz.clone === 200 && dec.wolfFeroz.weight === 0 && dec.wolfFeroz.mpW === 0 &&
    dec.orcDefl.base === 24 && dec.orcDefl.clone === 0 && dec.orcDefl.weight === WHV && dec.orcDefl.mpW === WHV &&
    dec.batZone.base === 7 && dec.batZone.clone === 300 && dec.batZone.weight === 0 && dec.batZone.mpW === 0;
  ok("8 ⊥ DESACOPLE (task gate 4): overrideDmg escala el CLON (e.dmg/e.tpl.dmg) mimetizando afijo 'Feroz'/zona/campeón — menaceOf lee BASE ETPL[type].dmg ⇒ wolf base10 inflado(clon200) SIGUE menace0; orc base24 deflactado(clon0) SIGUE menace2; bat base7 inflado(clon300) SIGUE menace0",
     decOK, JSON.stringify(dec));

  // 9 CRUX cross-axis (⊥#94 swift / ⊥#93 role / ⊥#92 bulk) — pure data + real weights
  const bat = { menace: oWeightType("bat"), spd: +ETPL.bat.spd, size: +ETPL.bat.size, arch: ETPL.bat.arch };
  const orc = { menace: oWeightType("orc"), spd: +ETPL.orc.spd, size: +ETPL.orc.size, arch: ETPL.orc.arch };
  const summoner = { menace: oWeightType("summoner"), spd: +ETPL.summoner.spd, size: +ETPL.summoner.size, arch: ETPL.summoner.arch };
  const volatile_ = { menace: oWeightType("volatile"), spd: +ETPL.volatile.spd, size: +ETPL.volatile.size, arch: ETPL.volatile.arch };
  const revenant = { menace: oWeightType("revenant"), spd: +ETPL.revenant.spd };
  // swift bands (⊥#94): spd≥120⇒2, ≥90⇒1, <90⇒0. Re-derive independently to prove diametric opposition.
  const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
  const cruxOK =
    // ⊥#94 SWIFT: orc spd64 swift0 / menace2 (matón lento) vs bat spd158 swift2 / menace0 (veloz alfeñique) — DIAMETRICALLY OPPOSED
    orc.menace === 2 && swiftBand(orc.spd) === 0 && bat.menace === 0 && swiftBand(bat.spd) === 2 &&
    // ⊥#93 ROLE: summoner enabler(arch summoner) menace0 (dmg:0) vs orc brute menace2 — OPPOSED
    summoner.menace === 0 && summoner.arch === "summoner" && orc.arch === "brute" && orc.menace === 2 &&
    // ⊥#92 BULK-size: volatile sz16 menace2 (menudo pegador) vs summoner sz20 menace0 (mediano inofensivo) — size ordering OPPOSITE to menace
    volatile_.menace === 2 && volatile_.size < summoner.size && summoner.menace === 0 &&
    // extra: volatile swift2/menace2 vs revenant swift1/menace2 — same menace, different swift ⇒ menace ≠ swift
    volatile_.menace === revenant.menace && swiftBand(volatile_.spd) !== swiftBand(revenant.spd);
  ok("9 ⊥ CRUX cross-axis: orc menace2/swift0 vs bat menace0/swift2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); summoner enabler menace0/dmg0 vs orc brute menace2 (⊥#93); volatile sz16 menace2 vs summoner sz20 menace0 (⊥#92 tamaño invertido); volatile swift2/menace2 vs revenant swift1/menace2 (mismo menace distinto swift)",
     cruxOK, JSON.stringify({ bat, orc, summoner, volatile: volatile_, revenant }));

  // 10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam → Δh.menaceBounty
  const GRANT_TYPES = ["orc", "moose", "volatile", "revenant", "charger", "demon", "skeleton", "mage", "bandit", "mudlurker", "wendigo", "wraith", "rat", "bat", "wolf", "spearman", "summoner", "healer", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.menace({ enabled: true });
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.menace().hero.menaceBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives menace seam
      const after = window.__dev.menace().hero.menaceBounty | 0;
      out[t] = after - before;
    }
    window.__dev.menace({ clearMenace: true }); window.__dev.menace({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.menaceBounty == oGrant(type) por banda (matón orc/moose/volatile/revenant/charger/demon+2; moderado skeleton/mage/bandit/mudlurker/wendigo/wraith+1; alfeñique rat/bat/wolf/spearman/summoner/healer+0; adv neutral+0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF
  const offGrant = await page.evaluate((Z) => {
    window.__dev.menace({ enabled: false });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.menace().hero.menaceBounty | 0;
    window.__dev.spawnKill("orc");                      // matón mob, but flag OFF ⇒ dead branch
    window.__dev.spawnKill("moose");
    const after = window.__dev.menace().hero.menaceBounty | 0;
    return { before, after, delta: after - before };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(orc)+spawnKill(moose) con flag OFF ⇒ Δh.menaceBounty == 0 (rama muerta, 0 fichas al seam)",
     offGrant.delta === 0, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 36 arc flags served true; MENACE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const menaceDark = flag("MENACE_SURGE") === "false";
  ok("12 0-REGRESIÓN: 36 flags del arco #59-#94 served enabled:true; MENACE_SURGE served false (DARK #95), off=[]",
     arcOff.length === 0 && menaceDark && arc.length === 36, `menace=${flag("MENACE_SURGE")} n=${arc.length} off=${JSON.stringify(arcOff)}`);

  // screenshot evidence (ON + orc matón in radius)
  await page.evaluate((Z) => { window.__dev.menace({ enabled: true }); window.__dev.menace({ clearMenace: true }); window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.menace({ clearMenace: true }); window.__dev.menace({ enabled: false }); });

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
    window.__dev.menace({ enabled: true }); window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.menace();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.menace({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [6, 13, 14, 16, 21, 22, 24, 26].map(d => window.__dev.menace({ dmgProbe: { dmg: d } }).dmgProbe.weight);
    const mp = window.__dev.menace({ menaceProbe: true }).menaceProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.menace({ clearMenace: true }); window.__dev.menace({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, mpScore: mp.score, mpW: mp.mobs[0] ? mp.mobs[0].weight : -1, mpDmg: mp.mobs[0] ? mp.mobs[0].dmg : -1,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: menaceProbe.mobs[0] mirrors AMBIENT G.enemies order within radius, which drifts by session-age (page A
  // booted first + ran the GRANT/spawn cycles ⇒ different ambient snapshot) — a session-age artifact, NOT a product
  // desync. The server-auth signal is mpScore (MAX menaceWeight over radius) + hero score/tier/charge + pure LUTs +
  // worldFingerprint + terrHash — all deterministic. We assert THOSE (mirror of the SWIFT harness sp.count caveat).
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.mpScore === B.mpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const orcMax = A.mpScore === oWeightType("orc") && B.mpScore === oWeightType("orc");
  const oracleMatch = A.score === oWeightType("orc") && A.charge === oCharge(oWeightType("orc"), true) &&
    A.bands === JSON.stringify([6, 13, 14, 16, 21, 22, 24, 26].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO orc+héroe ⇒ score/tier/charge + mpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && orcMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
     `A={s:${A.score},t:${A.tier},c:${A.charge},mpScore:${A.mpScore},mpDmg:${A.mpDmg},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},mpScore:${B.mpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} orcMax=${orcMax} oracleMatch=${oracleMatch}`);
  ok(`14 NORTH STAR fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido)`,
     A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
     `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await pageB.screenshot({ path: join(OUT, "client-b-menace.png") });
  await page.evaluate(() => window.__dev.menace({ enabled: false }));
  await pageB.evaluate(() => window.__dev.menace({ enabled: false }));

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
