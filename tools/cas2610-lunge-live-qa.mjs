// CAS-2610 — EVO#101 LUNGE_SURGE (Remate de Acometida) POST-FLIP LIVE QA — 43º flag LIVE. Served fed1aac601f6/815.
// INDEPENDENT LIVE QA: ported from DARK cas2601 (INDEP oracle harness). Re-derives EVERY oracle at the Node level from the
// imported knobs (LUNGE_SURGE + ETPL + peer surges) — it does NOT copy the GE seam math. It cross-checks the browser
// server-auth probes (__dev.lunge / __dev.spawnKill) against those re-derived oracles.
// HEAD config.js == served config.js BYTE-IDENTICAL (sha256 confirmed) ⇒ this local observable == LIVE build.
//
// LIVE deltas vs DARK cas2601:
//   • gate 2  : fresh boot now enabled TRUE (served default = LIVE flip landed); gExists still false (no kill yet).
//   • gate 12 : 43 arc flags #59-#101 served enabled:true INCL LUNGE_SURGE (0-regression), off=[]; + _SURGE per-block 29/29 true.
//   All behavioral checks (crux/decoupling/grant/north-star) toggle enabled explicitly ⇒ flag-independent, unchanged.
//
// AXIS (⊥42): BASE LUNGE / POUNCE DISTANCE of the mob TYPE, server-auth STATIC. lungeWeight(victim)=band of
//   lungeOf(e)=ETPL[e.type].lunge (immutable base row): lunge≥hiLunge(130)⇒pouncer⇒2 (bandit132); lunge≥midLunge(110)⇒
//   lunger⇒1 (wolf118/mudlurker126); lunge<mid⇒0 (bat96 + every melee-static). Only 4 types carry lunge (all arch:"rusher").
//   ONLY reader of .lunge = AI MOVEMENT machine (lspd=(e.tpl.lunge||110)/0.2) — never a kill reward. Fresh channel
//   lungeFind→h.lungeBounty (transient, STATELESS), sub-cap 2, badge "Acometida" (↠).
//
// Run: node tools/cas2610-lunge-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { LUNGE_SURGE, ETPL, SWIFT_SURGE, RAM_SURGE, WINDUP_SURGE, RECOVER_SURGE } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (LUNGE_SURGE.hiLunge != null) ? +LUNGE_SURGE.hiLunge : 130;
const MID = (LUNGE_SURGE.midLunge != null) ? +LUNGE_SURGE.midLunge : 110;
const WP = +(LUNGE_SURGE.weights && LUNGE_SURGE.weights.pouncer) || 0;
const WL = +(LUNGE_SURGE.weights && LUNGE_SURGE.weights.lunger) || 0;
const TIERS = (LUNGE_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, LUNGE_SURGE.lungeBountyCap | 0);
const oBand = (l) => (l >= HI ? "pouncer" : l >= MID ? "lunger" : "short");
const oWeight = (l) => (l >= HI ? WP : l >= MID ? WL : 0);
const oLunge = (type) => { const t = ETPL[type]; return t && t.lunge != null ? +t.lunge : 0; };
const oWeightType = (type) => oWeight(oLunge(type));
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
const band3 = (v, hi, mid) => (v >= hi ? 2 : v >= mid ? 1 : 0);
const swiftBand = (s) => band3(s, +SWIFT_SURGE.hiSpd, +SWIFT_SURGE.midSpd);
const ramBand = (k) => band3(k, +RAM_SURGE.hiKnock, +RAM_SURGE.midKnock);
const windBand = (w) => band3(w, +WINDUP_SURGE.hiWind, +WINDUP_SURGE.midWind);
const recoverBand = (r) => band3(r, +RECOVER_SURGE.hiRecover, +RECOVER_SURGE.midRecover);

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2610-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const EXPECT_FP = 15920977;
const EXPECT_TERRHASH = 2105484439;
const EXPECT_BUILD = "fed1aac601f6";

console.log(`[QA oracle] hiLunge=${HI} midLunge=${MID} wPouncer=${WP} wLunger=${WL} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${LUNGE_SURGE.enabled} channel=${LUNGE_SURGE.channel} radius=${LUNGE_SURGE.radius}`);

const Z = { forest: [192, 723] };
const LUNGE_SWEEP = [0, 96, 109, 110, 111, 118, 126, 129, 130, 131, 132, 200];
const SCORES = [0, 1, 2, 3, 5, 99];
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

  // 1 boot + hooks + served build matches expected LIVE build
  const build = await page.evaluate(() => window.__BUILD || null);
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.lunge && window.__dev.swift && window.__dev.ram && window.__dev.wind && window.__dev.recover && window.__dev.role && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`1 boots to play; __dev.lunge + peer hooks (swift/ram/wind/recover/role) + spawnKill + saveBlob + worldFingerprint present; __BUILD==${EXPECT_BUILD}; 0 err`,
     hooks && errors.length === 0 && build === EXPECT_BUILD, `build=${build} err=${errors.length} hooks=${hooks}`);

  // 2 LIVE fresh boot: LUNGE_SURGE.enabled TRUE (served default = flip landed); gExists still false (seam de kill)
  const live = await page.evaluate(() => window.__dev.lunge());
  ok("2 LIVE (fresh boot): LUNGE_SURGE.enabled TRUE (served default) AND sin kill score/tier/charge 0 + gExists false (canal transitorio en seam de kill), tag \"\", channel lungeFind, cap 2",
     live.enabled === true && live.gExists === false && live.score === 0 && live.tier === 0 && live.charge === 0 &&
     live.forageChargePreview === 0 && live.tag === "" && live.channel === "lungeFind" && live.cap === CAP,
     `enabled=${live.enabled} gExists=${live.gExists} score=${live.score} tier=${live.tier} charge=${live.charge} preview=${live.forageChargePreview} tag="${live.tag}" channel=${live.channel} cap=${live.cap} hiLunge=${live.hiLunge} midLunge=${live.midLunge} weights=${JSON.stringify(live.weights)}`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"lungeBounty"\s*:/.test(saveOff) && !/"lungeFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave lungeBounty/lungeFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint byte-stable across enabled toggle (from LIVE ON default)
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.lunge({ enabled: false }));
  const fpOff = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.lunge({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  ok("4 worldFingerprint byte-estable a través del toggle enabled ON→OFF→ON (fichas de acometida NO entran al fp; 0 RNG drift)", fpBefore === fpOff && fpOff === fpAfter, `on0=${fpBefore.length} off=${fpOff.length} on1=${fpAfter.length} match=${fpBefore === fpOff && fpOff === fpAfter}`);

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
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: true });
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
    const banditElite = run("bandit", 50);
    const wolfElite = run("wolf", 200);
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: true });
    return { banditElite, wolfElite };
  }, Z);
  const decOK = dec.banditElite.base === 132 && dec.banditElite.cloneLunge === 50 && dec.banditElite.weight === WP && dec.banditElite.lpW === WP &&
    dec.wolfElite.base === 118 && dec.wolfElite.cloneLunge === 200 && dec.wolfElite.weight === WL && dec.wolfElite.lpW === WL;
  ok("8 ⊥ DESACOPLE (⊥override/⊥#74/⊥campeón/⊥élite): overrideLunge escala el CLON e.tpl.lunge — lungeOf lee BASE ETPL[type].lunge ⇒ bandit base132 clon50 SIGUE lunge2; wolf base118 clon200 SIGUE lunge1",
     decOK, JSON.stringify(dec));

  // 9 CRUX cross-axis (⊥#93 role / ⊥#94 swift / ⊥#100 recover / ⊥#99 windup / ⊥#98 ram) — pure data re-derived from peer knobs
  const D = (t) => ({ lunge: oWeightType(t), swift: swiftBand(+ETPL[t].spd), ram: ramBand(+ETPL[t].knock), wind: windBand(+ETPL[t].windup), recover: recoverBand(+ETPL[t].recover), arch: ETPL[t].arch, spd: +ETPL[t].spd, lungeRaw: oLunge(t) });
  const bat = D("bat"), wolf = D("wolf"), mudlurker = D("mudlurker"), bandit = D("bandit"), golem = D("golem"), moose = D("moose");
  const cruxOK =
    bat.arch === "rusher" && wolf.arch === "rusher" && mudlurker.arch === "rusher" && bandit.arch === "rusher" &&
    bat.lunge === 0 && wolf.lunge === 1 && mudlurker.lunge === 1 && bandit.lunge === 2 &&
    bat.swift === 2 && bat.lunge === 0 && wolf.swift === 2 && wolf.lunge === 1 &&
    bandit.recover === 0 && bandit.lunge === 2 && golem.recover === 2 && golem.lunge === 0 &&
    bandit.wind === 0 && bandit.lunge === 2 && golem.wind === 2 && golem.lunge === 0 &&
    moose.ram === 2 && moose.lunge === 0 && bandit.ram === 1 && bandit.lunge === 2;
  ok("9 ⊥ CRUX cross-axis: 4 lunge-carriers TODOS arch:\"rusher\" pero lunge 0/1/1/2 (⊥#93 ROLE); bat swift2/lunge0 vs wolf swift2/lunge1 (⊥#94); bandit recov0/lunge2 vs golem recov2/lunge0 (⊥#100); bandit wind0/lunge2 vs golem wind2/lunge0 (⊥#99); moose ram2/lunge0 vs bandit ram1/lunge2 (⊥#98)",
     cruxOK, JSON.stringify({ bat, wolf, mudlurker, bandit, golem, moose }));

  // 10 REAL GRANT (flag ON = LIVE default): spawnKill → REAL killEnemy seam → Δh.lungeBounty
  const GRANT_TYPES = ["bandit", "wolf", "mudlurker", "bat", "golem", "moose", "summoner", "skeleton", "orc", "charger", "rat"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.lunge({ enabled: true });
    window.__dev.lunge({ clearLunge: true });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.lunge().hero.lungeBounty | 0;
      window.__dev.spawnKill(t);
      const after = window.__dev.lunge().hero.lungeBounty | 0;
      out[t] = after - before;
    }
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: true });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON=LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.lungeBounty == oGrant(type) por banda (pouncer bandit+2; estocada media wolf/mudlurker+1; corto/sin lunge +0); sub-cap 2",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF — THE byte-neutral killEnemy proof (explicit OFF, independent of LIVE default)
  const offGrant = await page.evaluate((Z) => {
    window.__dev.lunge({ enabled: false });
    window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.lunge().hero.lungeBounty | 0;
    window.__dev.spawnKill("bandit");
    window.__dev.spawnKill("wolf");
    const after = window.__dev.lunge().hero.lungeBounty | 0;
    const gExists = window.__dev.lunge().gExists;
    window.__dev.lunge({ enabled: true });
    return { before, after, delta: after - before, gExists };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(bandit)+spawnKill(wolf) con flag OFF ⇒ Δh.lungeBounty == 0 Y gExists false (rama muerta, 0 fichas al seam ⇒ killEnemy byte-idéntico al HEAD)",
     offGrant.delta === 0 && offGrant.gExists === false, JSON.stringify(offGrant));

  // 12 0-REGRESSION LIVE: 43 arc flags served true INCL LUNGE_SURGE (43º flag LIVE); + _SURGE per-block 29/29 true
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcOff = arcLive.filter(([, v]) => v !== "true");
  const lungeLive = flag("LUNGE_SURGE") === "true";
  // _SURGE per-block tally over served config (matches CEO byte-verify: 29 true, 0 false)
  const surgeRe = /export const ([A-Z0-9_]*_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g;
  let sT = 0, sF = 0; const sOff = []; let mm;
  while ((mm = surgeRe.exec(cfgSrc))) { if (mm[2] === "true") sT++; else { sF++; sOff.push(mm[1]); } }
  ok("12 ★ 0-REGRESIÓN LIVE: 43 flags del arco #59-#101 served enabled:true INCL LUNGE_SURGE (43º flag LIVE), off=[]; + _SURGE per-block 29 true / 0 false",
     arcOff.length === 0 && lungeLive && arc.length === 43 && sT === 29 && sF === 0,
     `lunge=${flag("LUNGE_SURGE")} arcN=${arc.length} arcOff=${JSON.stringify(arcOff)} | _SURGE true=${sT} false=${sF} off=${JSON.stringify(sOff)}`);

  // screenshot evidence (ON + bandit pouncer in radius)
  await page.evaluate((Z) => { window.__dev.lunge({ enabled: true }); window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.lunge({ spawnLunge: { type: "bandit", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: true }); });

  // 13/14 NORTH STAR — 2-client convergence
  await sleep(400);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
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
    window.__dev.lunge({ clearLunge: true }); window.__dev.lunge({ enabled: true });
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
  await page.evaluate(() => window.__dev.lunge({ enabled: true }));
  await pageB.evaluate(() => window.__dev.lunge({ enabled: true }));

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
