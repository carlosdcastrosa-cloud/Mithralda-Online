// CAS-2559 — EVO#94 SWIFT_SURGE (Remate de Presa Veloz) DARK QA (Gate 2/2) — 36º flag candidate.
// INDEPENDENT QA harness: re-derives every oracle at the Node level from the imported knobs
// (SWIFT_SURGE + ETPL) — it does NOT copy the GE seam's math nor the GE selfverify harness. It then
// cross-checks the browser server-auth probes against those re-derived oracles.
//
// AXIS (⊥35): BASE MOVEMENT SPEED of the mob TYPE, server-auth STATIC. swiftWeight(victim) = band of
//   swiftOf(e)=ETPL[e.type].spd (immutable base row): spd≥hiSpd(120) ⇒ escurridiza ⇒ 2; spd≥midSpd(90) ⇒
//   ágil ⇒ 1; spd<midSpd ⇒ plúmbeo ⇒ 0. Fresh channel swiftFind → h.swiftBounty (transient, STATELESS),
//   sub-cap swiftBountyCap:2, badge "Acoso" (⇶). Score sampled at TOP of killEnemy (_swiftPre).
//
// GATES (map to the 6 task gates):
//   1  boot + swift + arc peer hooks + spawnKill + __BUILD, 0 err
//   2  byte-neutral OFF (fresh boot): enabled false, gExists false (G.swiftBounty never created), all-zero, tag ""
//   3  STATELESS: save blob has NO swiftBounty/swiftFind key (gate 5)
//   4  worldFingerprint byte-stable across enabled toggle (bounty NOT in fp; 0 RNG drift) (gate 5)
//   5  spdProbe LUT: spd→band→weight→tier→charge == oracle across the hiSpd/midSpd threshold sweep
//   6  scoreProbe LUT: score→tier→charge == oracle table + sub-cap headroom
//   7  REAL spawnSwift over ALL ETPL rows: browser swiftWeight == oWeightType(ETPL[type].spd) BASE (gate 2)
//   8  ⊥ DECOUPLING (crux 3): spawnSwift overrideSpd (mimics affix A.spdMul / zone z.spdMul / CC slow on the CLONE)
//        ⇒ swiftOf reads BASE ETPL[type].spd, IGNORES the clone: magmabrute base56 'Veloz'(→79) stays swift0;
//        bat base158 frozen(→40) stays swift2
//   9  ⊥#93 role / ⊥#92 bulk-size / ⊥ WORTH-xp / ⊥#84 reach: axes DISJOINT (data + real weight)
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ Δh.swiftBounty == oGrant(type)
//        escurridiza(bat/volatile/rat/wolf)+2, ágil(mudlurker/bandit/revenant)+1, plúmbeo(casters/brutes/summoner)+0,
//        adv neutral+0; sub-cap 2 (gate 2)
//   11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0
//   12 0-REGRESSION: 35 arc flags #59-#93 served enabled:true; SWIFT_SURGE served false (DARK #94), off=[] (gate 6)
//   13 NORTH STAR 2-client: A==B (score/tier/charge + swiftProbe MAX + LUTs + worldFingerprint + terrHash) + oracle
//   14 NORTH STAR fp==15920977 + terrHash==2105484439, A==B (shared deterministic world) (gate 4)
//   0  no JS errors during the run

import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { SWIFT_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (SWIFT_SURGE.hiSpd != null) ? +SWIFT_SURGE.hiSpd : 120;
const MID = (SWIFT_SURGE.midSpd != null) ? +SWIFT_SURGE.midSpd : 90;
const WSW = +(SWIFT_SURGE.weights && SWIFT_SURGE.weights.swift) || 0;
const WBR = +(SWIFT_SURGE.weights && SWIFT_SURGE.weights.brisk) || 0;
const TIERS = (SWIFT_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, SWIFT_SURGE.swiftBountyCap | 0);
// oBand: spd → band label.
const oBand = (spd) => (spd >= HI ? "swift" : spd >= MID ? "brisk" : "plodder");
// oWeight: spd → weight. escurridiza⇒WSW(2); ágil⇒WBR(1); plúmbeo⇒0.
const oWeight = (spd) => (spd >= HI ? WSW : spd >= MID ? WBR : 0);
// oSpd/oWeightType: BASE spd of a real ETPL type → weight.
const oSpd = (type) => { const t = ETPL[type]; return t && t.spd != null ? +t.spd : 0; };
const oWeightType = (type) => oWeight(oSpd(type));
// oRank: 1-based index of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank. neutral ⇒ 0.
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2559");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash of the shared deterministic world

console.log(`[QA oracle] hiSpd=${HI} midSpd=${MID} wSwift=${WSW} wBrisk=${WBR} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${SWIFT_SURGE.enabled} channel=${SWIFT_SURGE.channel}`);

// Deterministic forest tile (760×908 continent — same seed ⇒ same rects every client).
const Z = { forest: [192, 723] };
// spd sweep around both thresholds (independent of any real type).
const SPD_SWEEP = [0, 40, 56, 79, 82, 86, 89, 90, 91, 104, 112, 119, 120, 121, 128, 132, 152, 158, 200];
// score sweep for the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 99];
// EVERY type in ETPL — REAL server-auth spawn coverage (QA enumerates ETPL itself).
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].spd != null);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play; __dev.swift + arc peer hooks + spawnKill + __BUILD present; 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.swift());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.swiftBounty nunca creado), score/tier/charge/preview 0, tag \"\", channel swiftFind, cap 2",
     dark.enabled === false && dark.gExists === false && dark.score === 0 && dark.tier === 0 && dark.charge === 0 &&
     dark.forageChargePreview === 0 && dark.tag === "" && dark.channel === "swiftFind" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" channel=${dark.channel} cap=${dark.cap}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"swiftBounty"\s*:/.test(saveOff) && !/"swiftFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave swiftBounty/swiftFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.swift({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.swift({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} len=${fpBefore.length}`);

  // 5 spdProbe LUT sweep
  const spd = await page.evaluate((sweep) => sweep.map(s => { const p = window.__dev.swift({ spdProbe: { spd: s } }).spdProbe; return { s, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), SPD_SWEEP);
  const spdBad = spd.filter(r => r.band !== oBand(r.s) || r.weight !== oWeight(r.s) || r.tier !== oRank(oWeight(r.s)) || r.charge !== oCharge(oWeight(r.s), true));
  ok(`5 spdProbe LUT: spd→band→weight→tier→charge == oracle en el sweep de umbral (${SPD_SWEEP.length} pts: 89/90 y 119/120 fronteras)`,
     spdBad.length === 0, spdBad.length ? JSON.stringify(spdBad.map(r => ({ s: r.s, got: [r.band, r.weight, r.tier, r.charge], exp: [oBand(r.s), oWeight(r.s), oRank(oWeight(r.s)), oCharge(oWeight(r.s), true)] }))) : `all ${SPD_SWEEP.length} match`);

  // 6 scoreProbe LUT table
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.swift({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  ok(`6 scoreProbe LUT: score→tier→charge == oracle table + sub-cap (${SCORES.length} pts; charge≤cap ${CAP})`,
     scBad.length === 0, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `all match; sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // 7 REAL spawnSwift over ALL ETPL types
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.swift({ clearSwift: true });
      const r = window.__dev.swift({ spawnSwift: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSwift;
      out[t] = { spd: r.spd, weight: r.weight, valid: r.valid };
    }
    window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => !spawn7[t].valid || spawn7[t].spd !== oSpd(t) || spawn7[t].weight !== oWeightType(t));
  ok(`7 REAL spawnSwift sobre LAS ${ALL_TYPES.length} filas de ETPL: browser swiftWeight == oWeightType(ETPL[type].spd) BASE (server-auth)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, spd: oSpd(t), exp: oWeightType(t), got: spawn7[t] }))) : `all ${ALL_TYPES.length} types match base band (bat=${spawn7.bat.weight} wolf=${spawn7.wolf.weight} revenant=${spawn7.revenant.weight} summoner=${spawn7.summoner.weight} golem=${spawn7.golem.weight})`);

  // 8 ⊥ DECOUPLING: overrideSpd on the CLONE must NOT move the band (swiftOf reads BASE)
  const dec = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.swift({ clearSwift: true });
      const r = window.__dev.swift({ spawnSwift: { type, tx: Z.forest[0], ty: Z.forest[1], overrideSpd: ov } }).spawnSwift;
      return { base: r.spd, clone: r.eSpd, tplClone: r.tplSpd, weight: r.weight }; };
    const magmaVeloz = run("magmabrute", 79);   // base 56, affix 'Veloz' ×1.42 ≈ 79 on the clone
    const batFrozen = run("bat", 40);           // base 158, frost-slowed to 40 on the clone
    const wolfZone = run("wolf", 300);          // base 128, absurd zone/affix inflation on the clone
    window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false });
    return { magmaVeloz, batFrozen, wolfZone };
  }, Z);
  const decOK = dec.magmaVeloz.base === 56 && dec.magmaVeloz.clone === 79 && dec.magmaVeloz.weight === 0 &&
    dec.batFrozen.base === 158 && dec.batFrozen.clone === 40 && dec.batFrozen.weight === WSW &&
    dec.wolfZone.base === 128 && dec.wolfZone.clone === 300 && dec.wolfZone.weight === WSW;
  ok("8 ⊥ DESACOPLE (crux 3): overrideSpd escala el CLON (e.spd/e.tpl.spd) mimetizando afijo 'Veloz'/zona/CC — swiftOf lee BASE ETPL[type].spd ⇒ magmabrute base56 'Veloz'(clon79) SIGUE swift0; bat base158 congelado(clon40) SIGUE swift2; wolf base128 inflado(clon300) SIGUE swift2",
     decOK, JSON.stringify(dec));

  // 9 ⊥ cross-axis disjointness (role #93 / bulk-size #92 / xp-WORTH / reach #84) — pure data + real weights
  const bat = { swift: oWeightType("bat"), size: +ETPL.bat.size, xp: +ETPL.bat.xp, arch: ETPL.bat.arch, ranged: !!ETPL.bat.ranged };
  const wolf = { swift: oWeightType("wolf"), size: +ETPL.wolf.size, xp: +ETPL.wolf.xp, arch: ETPL.wolf.arch };
  const summoner = { swift: oWeightType("summoner"), size: +ETPL.summoner.size, xp: +ETPL.summoner.xp, arch: ETPL.summoner.arch };
  const moose = { swift: oWeightType("moose"), size: +ETPL.moose.size, xp: +ETPL.moose.xp };
  const revenant = { swift: oWeightType("revenant"), xp: +ETPL.revenant.xp };
  const orc = { swift: oWeightType("orc"), ranged: !!ETPL.orc.ranged };
  const mage = { swift: oWeightType("mage"), ranged: !!ETPL.mage.ranged };
  const cruxOK =
    // ⊥#93 role: wolf rusher swift2 vs summoner enabler swift0 — DIAMETRICALLY OPPOSITE
    wolf.swift === 2 && summoner.swift === 0 && wolf.arch === "rusher" && summoner.arch === "summoner" &&
    // ⊥#92 bulk-size: bat sz14 swift2 vs moose sz26 swift0 — size ordering OPPOSITE to swift
    bat.swift === 2 && bat.size < moose.size && moose.swift === 0 &&
    // ⊥ WORTH xp: wolf xp12 swift2 vs summoner xp34 swift0 (faster is worth LESS); revenant swift1/xp64 disjoint
    wolf.xp < summoner.xp && wolf.swift > summoner.swift && revenant.swift === 1 && revenant.xp > summoner.xp &&
    // ⊥#84 reach: orc melee swift0 and mage ranged swift0 — SAME band mixes reach classes ⇒ band ≠ reach
    orc.swift === 0 && mage.swift === 0 && orc.ranged === false && mage.ranged === true;
  ok("9 ⊥ CRUX cross-axis: wolf swift2/role rusher vs summoner swift0/role enabler OPUESTOS (⊥#93); bat sz14 swift2 vs moose sz26 swift0 (⊥#92 tamaño invertido); wolf xp12 swift2 vs summoner xp34 swift0 + revenant swift1/xp64 (⊥WORTH); orc melee swift0 + mage ranged swift0 MISMA banda mezcla alcance (⊥#84)",
     cruxOK, JSON.stringify({ bat, wolf, summoner, moose, revenant, orc, mage }));

  // 10 REAL GRANT (flag ON): spawnKill → REAL killEnemy seam → Δh.swiftBounty
  const GRANT_TYPES = ["bat", "volatile", "rat", "wolf", "mudlurker", "bandit", "revenant", "summoner", "mage", "golem", "orc", "moose", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.swift().hero.swiftBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives swift seam
      const after = window.__dev.swift().hero.swiftBounty | 0;
      out[t] = after - before;
    }
    window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.swiftBounty == oGrant(type) por banda (escurridiza bat/volatile/rat/wolf+2; ágil mudlurker/bandit/revenant+1; plúmbeo summoner/mage/golem/orc/moose+0; adv neutral+0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF
  const offGrant = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: false });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.swift().hero.swiftBounty | 0;
    window.__dev.spawnKill("bat");                      // escurridiza mob, but flag OFF ⇒ dead branch
    window.__dev.spawnKill("wolf");
    const after = window.__dev.swift().hero.swiftBounty | 0;
    return { before, after, delta: after - before };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(bat)+spawnKill(wolf) con flag OFF ⇒ Δh.swiftBounty == 0 (rama muerta, 0 fichas al seam)",
     offGrant.delta === 0, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 35 arc flags served true; SWIFT_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const swiftDark = flag("SWIFT_SURGE") === "false";
  ok("12 0-REGRESIÓN: 35 flags del arco #59-#93 served enabled:true; SWIFT_SURGE served false (DARK #94), off=[]",
     arcOff.length === 0 && swiftDark && arc.length === 35, `swift=${flag("SWIFT_SURGE")} n=${arc.length} off=${JSON.stringify(arcOff)}`);

  // screenshot evidence (ON + bat escurridiza in radius)
  await page.evaluate((Z) => { window.__dev.swift({ enabled: true }); window.__dev.swift({ clearSwift: true }); window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false }); });

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
    window.__dev.swift({ enabled: true }); window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.swift();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.swift({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [56, 82, 89, 90, 104, 119, 120, 158].map(sp => window.__dev.swift({ spdProbe: { spd: sp } }).spdProbe.weight);
    const sp = window.__dev.swift({ swiftProbe: true }).swiftProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spScore: sp.score, spCount: sp.count,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: sp.count mirrors AMBIENT G.enemies within radius, which drift by session-age (page A booted first) —
  // a session-age artifact, NOT a product desync. The server-auth signal is spScore (MAX weight) + score/tier/charge
  // + pure LUTs + worldFingerprint — all deterministic. We assert THOSE.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const batMax = A.spScore === oWeightType("bat") && B.spScore === oWeightType("bat");
  const oracleMatch = A.score === oWeightType("bat") && A.charge === oCharge(oWeightType("bat"), true) &&
    A.bands === JSON.stringify([56, 82, 89, 90, 104, 119, 120, 158].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO bat+héroe ⇒ score/tier/charge + spScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (sp.count ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && batMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
     `A={s:${A.score},t:${A.tier},c:${A.charge},spScore:${A.spScore},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},spScore:${B.spScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} batMax=${batMax} oracleMatch=${oracleMatch}`);
  ok(`14 NORTH STAR fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido)`,
     A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
     `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await pageB.screenshot({ path: join(OUT, "client-b-swift.png") });
  await page.evaluate(() => window.__dev.swift({ enabled: false }));
  await pageB.evaluate(() => window.__dev.swift({ enabled: false }));

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
