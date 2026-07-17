// CAS-2558 — QA-OWNED INDEPENDENT DARK QA (Gate 2/2) for REMATE DE PRESA VELOZ (SWIFT_SURGE, EVO#94, enabled:false).
// QA counterpart to the GE self-verify (tools/cas2556-swift-selfverify.mjs). It DOES NOT trust the GE oracle
// tables. It RE-DERIVES every oracle in PURE JS by importing the CEO knobs (SWIFT_SURGE) and the real enemy
// templates (ETPL) DIRECTLY from sim/config.js at the Node level, then cross-checks the browser server-auth
// probes / REAL kill grants against those independently-computed expectations. Every number the browser
// reports is checked against a value QA computed itself. Grants are driven through the REAL killEnemy seam
// (spawnKill), NOT the forageChargePreview — the strongest available proof that the flip will bank correctly.
//
// EJE (⊥35): VELOCIDAD DE MOVIMIENTO BASE del mob TYPE, server-auth ESTÁTICO. swiftWeight(víctima) = banda de
//   swiftOf(e)=ETPL[e.type].spd BASE INMUTABLE: spd≥hiSpd(120)⇒escurridiza⇒2, spd≥midSpd(90)⇒ágil⇒1, spd<mid⇒0.
//   Canal FRESCO swiftFind→h.swiftBounty (transitorio, fuera del save + worldFingerprint), sub-cap swiftBountyCap:2,
//   badge ⇶. CLAVE ⊥#74/⊥#85/⊥zona: lee ETPL[e.type].spd BASE, NO e.spd/e.tpl.spd — el afijo A.spdMul
//   ('Veloz'/'Acorazado'), la zona z.spdMul y el frost-slow CC escalan el CLON/entidad viva, jamás la fila base
//   ⇒ velocidad desacoplada por construcción.
//
// QA checks (Gate 2/2, DARK — flag OFF):
//   0  no JS errors
//   1  boot + __dev.swift + arc peer hooks + spawnKill + __BUILD
//   2  byte-neutral OFF fresh boot: enabled false, gExists false (G.swiftBounty nunca creado), all-zero, tag ""
//   3  STATELESS: save blob has NO swiftBounty/swiftFind key (transient, 100% derived)
//   4  worldFingerprint byte-stable across enabled toggle (fichas NUNCA entran al fp; 0 RNG drift)
//   5  ORACLE spdProbe LUT: browser band/weight/tier/charge == QA-re-derived for a sweep of spd thresholds
//   6  ORACLE scoreProbe LUT: browser tier/charge == QA-re-derived oRank/oCharge(score) + sub-cap
//   7  ORACLE REAL spawnSwift: for EVERY ETPL type, browser swiftWeight == oWeightType(ETPL[type].spd BASE)
//   7b ⊥#74/⊥#85/⊥zona CRUX: overrideSpd inflates/deflates the CLON e.spd/e.tpl.spd ⇒ swiftOf STILL reads BASE spd
//      (magmabrute base56 + overrideSpd200 STILL swift0; bat base158 + overrideSpd10 STILL swift2)
//   8  ⊥#93 CRUX: wolf(rusher rol0, spd128 swift2) vs summoner(enabler rol2, spd60 swift0) — DIAMETRICALLY OPPOSITE
//   8b ⊥#92 CRUX: bat(size14 bulk0, spd158 swift2) vs moose(size26 bulk2, spd82 swift0) — OPPOSITE
//   9  DIFFERENTIATOR ⊥ peers: lone bat ⇒ swift T2 while bulk/role/skirmish/pack/blood/control/interrupt/reach/heading/zone read their own axes
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ h.swiftBounty Δ == oGrant(type)
//      per band (bat/volatile/rat/wolf+2 / mudlurker/bandit/revenant+1 / casters/brutes+0 / adv neutral+0); sub-cap 2
//   11 REAL GRANT byte-neutral OFF: same spawnKill(bat)+spawnKill(wolf) with flag OFF ⇒ Δ h.swiftBounty == 0
//   12 0-REGRESSION: 35 arc flags served enabled:true; SWIFT_SURGE served false (DARK #94)
//   13 NORTH STAR 2-client convergence: same mob+hero ⇒ score/tier/charge + probes + worldFingerprint identical, 0-desync
//
// Run: node tools/cas2558-swift-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { SWIFT_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from the GE harness) ----
const HI = (SWIFT_SURGE.hiSpd != null) ? +SWIFT_SURGE.hiSpd : 120;
const MID = (SWIFT_SURGE.midSpd != null) ? +SWIFT_SURGE.midSpd : 90;
const WSW = +(SWIFT_SURGE.weights && SWIFT_SURGE.weights.swift) || 2;
const WBR = +(SWIFT_SURGE.weights && SWIFT_SURGE.weights.brisk) || 1;
const TIERS = (SWIFT_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, SWIFT_SURGE.swiftBountyCap | 0);
// oBand: spd → band string.
const oBand = (spd) => (spd >= HI ? "swift" : spd >= MID ? "brisk" : "plodder");
// oWeightSpd: band of a base speed. swift⇒WSW(2); brisk⇒WBR(1); plodder⇒0.
const oWeightSpd = (spd) => { const b = oBand(spd); return b === "swift" ? WSW : b === "brisk" ? WBR : 0; };
// oWeightType: BASE spd of a real ETPL type → weight.
const oWeightType = (type) => { const tpl = ETPL[type]; return tpl && tpl.spd != null ? oWeightSpd(+tpl.spd) : 0; };
// oRank: index (1-based) of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank (weight of its BASE spd → charge). neutral ⇒ 0.
const oGrant = (type, on) => { const tpl = ETPL[type]; if (!on || !tpl || tpl.neutral) return 0; return oCharge(oWeightType(type), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2558");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

console.log(`[QA oracle] hiSpd=${HI} midSpd=${MID} wSwift=${WSW} wBrisk=${WBR} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${SWIFT_SURGE.enabled}`);

// Zone tiles (deterministic 760×908 continent — same seed ⇒ same rects ⇒ same zone every client).
const Z = { forest: [192, 723] };
// spd values to probe the UMBRAL LUT: bracket both thresholds + boundaries + zero.
const SPDS = [0, 45, 89, 90, 91, 104, 119, 120, 121, 158, 300];
// Scores to probe the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 12, 100];
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play, __dev.swift + arc peer hooks + spawnKill + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.swift());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.swiftBounty nunca creado), all-zero, tag \"\"",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "swiftFind" && dark.tag === "" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" cap=${dark.cap} hiSpd=${dark.hiSpd} midSpd=${dark.midSpd}`);

  // 3 STATELESS: save has no swiftBounty/swiftFind key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"swiftBounty"\s*:/.test(saveOff) && !/"swiftFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave swiftBounty/swiftFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint stable across toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const terrBefore = await page.evaluate(() => { const w = window.__dev.worldFingerprint(393); return (w && (w.terrHash != null ? w.terrHash : (w.terr != null ? w.terr : null))); });
  await page.evaluate(() => window.__dev.swift({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.swift({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} terrHash=${terrBefore}`);

  // 5 ORACLE spdProbe LUT: browser band/weight/tier/charge == QA-re-derived
  const spBrowser = await page.evaluate((spds) => spds.map(s => { const p = window.__dev.swift({ spdProbe: { spd: s } }).spdProbe; return { spd: s, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), SPDS);
  const spBad = SPDS.filter((s, i) => {
    const b = spBrowser[i], eB = oBand(s), eW = oWeightSpd(s), eT = oRank(eW), eC = oCharge(eW, true);
    return !b || b.band !== eB || b.weight !== eW || b.tier !== eT || b.charge !== eC;
  });
  ok("5 ORACLE spdProbe LUT: browser band/weight/tier/charge == QA-re-derived para cada spd (bracket hiSpd/midSpd + fronteras 89/90/119/120 + 0)",
     spBad.length === 0, spBad.length ? JSON.stringify(spBad.map(s => ({ s, got: spBrowser[SPDS.indexOf(s)], expB: oBand(s), expW: oWeightSpd(s) }))) : `all ${SPDS.length} match`);

  // 6 ORACLE scoreProbe LUT: browser tier/charge == QA-re-derived oRank/oCharge
  const scBrowser = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.swift({ scoreProbe: { score: s } }).scoreProbe; return { tier: p.tier, charge: p.charge }; }), SCORES);
  const scOK = SCORES.every((s, i) => scBrowser[i].tier === oRank(s) && scBrowser[i].charge === oCharge(s, true));
  const capMax = Math.max(...scBrowser.map(x => x.charge));
  ok("6 ORACLE scoreProbe LUT: browser tier/charge == QA oRank/oCharge(score) + sub-cap (max charge ≤ cap)",
     scOK && capMax <= CAP, `capMax=${capMax} cap=${CAP} ` + (scOK ? "all match" : JSON.stringify(SCORES.map((s, i) => ({ s, gotT: scBrowser[i].tier, expT: oRank(s), gotC: scBrowser[i].charge, expC: oCharge(s, true) })).filter((x, i) => scBrowser[i].tier !== oRank(x.s) || scBrowser[i].charge !== oCharge(x.s, true)))));

  // 7 ORACLE REAL spawnSwift over EVERY ETPL type: browser swiftWeight == oWeightType(ETPL[type].spd BASE)
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.swift({ enabled: true });
    const out = {};
    for (const t of types) {
      window.__dev.swift({ clearSwift: true });
      window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.swift({ spawnSwift: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSwift;
      const sp = window.__dev.swift({ swiftProbe: true }).swiftProbe;
      out[t] = { spd: sr.spd, weight: sr.weight, valid: sr.valid, spW: (sp.mobs[0] ? sp.mobs[0].weight : -1), spSpd: (sp.mobs[0] ? sp.mobs[0].spd : -1) };
    }
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => {
    const b = spawn7[t], expW = oWeightType(t), expSpd = +ETPL[t].spd;
    return !b || !b.valid || b.spd !== expSpd || b.weight !== expW || b.spW !== expW;
  });
  ok(`7 ORACLE REAL spawnSwift sobre LAS ${ALL_TYPES.length} filas de ETPL: browser swiftWeight == oWeightType(ETPL[type].spd) BASE (server-auth)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, spd: ETPL[t].spd, exp: oWeightType(t), got: spawn7[t] && spawn7[t].weight }))) : `all ${ALL_TYPES.length} types match base band`);

  // 7b ⊥#74/⊥#85/⊥zona CRUX: overrideSpd inflates/deflates the CLON ⇒ swiftOf still reads BASE spd
  const ovr = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true });
    const rd = (type, overrideSpd) => { window.__dev.swift({ clearSwift: true });
      window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.swift({ spawnSwift: { type, tx: Z.forest[0], ty: Z.forest[1], overrideSpd } }).spawnSwift;
      const sp = window.__dev.swift({ swiftProbe: true }).swiftProbe;
      return { spd: sr.spd, eSpd: sr.eSpd, tplSpd: sr.tplSpd, weight: sr.weight, spW: (sp.mobs[0] ? sp.mobs[0].weight : -99) }; };
    const magma = rd("magmabrute", 200);   // 'Veloz'-mimic: clone e.spd=200 but BASE stays 56 ⇒ still 0
    const bat = rd("bat", 10);              // 'Acorazado'/frost-mimic: clone e.spd=10 but BASE stays 158 ⇒ still 2
    window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false });
    return { magma, bat };
  }, Z);
  const ovrOK = ovr.magma.eSpd === 200 && ovr.magma.spd === +ETPL["magmabrute"].spd && ovr.magma.weight === 0 && ovr.magma.spW === 0 &&
    ovr.bat.eSpd === 10 && ovr.bat.spd === +ETPL["bat"].spd && ovr.bat.weight === 2 && ovr.bat.spW === 2;
  ok("7b ⊥#74/⊥#85/⊥zona CRUX: e.spd/e.tpl.spd sobrescrito en el CLON (magmabrute→200 mimetiza afijo 'Veloz'/zona; bat→10 mimetiza 'Acorazado'/frost-slow) ⇒ swiftOf lee ETPL[type].spd BASE ⇒ magmabrute SIGUE swift0, bat SIGUE swift2 (desacople del clon)",
     ovrOK, JSON.stringify(ovr));

  // 8 ⊥#93 CRUX: wolf(rusher rol0, spd128 swift2) vs summoner(enabler rol2, spd60 swift0) — DIAMETRICALLY OPPOSITE
  const crux93 = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true }); window.__dev.role({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "wolf", tx: Z.forest[0], ty: Z.forest[1] } });
    const wolf = { swift: window.__dev.swift({ swiftProbe: true }).swiftProbe.score, role: window.__dev.role({ roleProbe: true }).roleProbe.score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ spawnSwift: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const summoner = { swift: window.__dev.swift({ swiftProbe: true }).swiftProbe.score, role: window.__dev.role({ roleProbe: true }).roleProbe.score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false }); window.__dev.role({ enabled: false });
    return { wolf, summoner };
  }, Z);
  const crux93OK = crux93.wolf.swift === oWeightType("wolf") && crux93.wolf.swift === 2 && crux93.wolf.role === 0 &&
    crux93.summoner.swift === oWeightType("summoner") && crux93.summoner.swift === 0 && crux93.summoner.role === 2;
  ok("8 ⊥#93 CRUX: WOLF (rusher rol0, spd128 ⇒ swift2) vs SUMMONER (enabler rol2, spd60 ⇒ swift0) — DIAMETRALMENTE OPUESTOS (swift lee spd/MAGNITUD de rapidez, role lee arch/FUNCIÓN de IA)",
     crux93OK, JSON.stringify(crux93));

  // 8b ⊥#92 CRUX: bat(size14 bulk0, spd158 swift2) vs moose(size26 bulk2, spd82 swift0) — OPPOSITE
  const crux92 = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true }); window.__dev.bulk({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const bat = { swift: window.__dev.swift({ swiftProbe: true }).swiftProbe.score, bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ spawnSwift: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const moose = { swift: window.__dev.swift({ swiftProbe: true }).swiftProbe.score, bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score };
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { bat, moose };
  }, Z);
  const crux92OK = crux92.bat.swift === oWeightType("bat") && crux92.bat.swift === 2 && crux92.bat.bulk === 0 &&
    crux92.moose.swift === oWeightType("moose") && crux92.moose.swift === 0 && crux92.moose.bulk === 2;
  ok("8b ⊥#92 CRUX: BAT (size14 ⇒ bulk0, spd158 ⇒ swift2) vs MOOSE (size26 ⇒ bulk2, spd82 ⇒ swift0) — OPUESTOS (swift lee spd/RAPIDEZ, bulk lee size/TAMAÑO físico)",
     crux92OK, JSON.stringify(crux92));

  // 9 DIFFERENTIATOR ⊥ peers: lone bat ⇒ swift T2 while peers read their own distinct axes
  const diff = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: true }); window.__dev.bulk({ enabled: true }); window.__dev.role({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.swift();
    const peers = {
      bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score,
      role: window.__dev.role({ roleProbe: true }).roleProbe.score,
      ski: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score,
      pak: window.__dev.packHarvest({ packProbe: true }).packProbe.score,
      blo: window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score,
      ctr: window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score,
      int: window.__dev.interrupt({ actProbe: true }).actProbe.score,
      reach: window.__dev.longshot({ reachProbe: true }).reachProbe.score,
      head: window.__dev.heading().score,
    };
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });
    window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false }); window.__dev.bulk({ enabled: false }); window.__dev.role({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, peers, zoneScore };
  }, Z);
  // bat: swift2 (spd158), bulk0 (size14 small), role0 (brute/flyer). skirmish/pack/blood/control/interrupt/reach/heading/zone read their own axes (bat idle/lone/full-hp ⇒ 0).
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&
    diff.peers.bulk === 0 &&   // bat size14 ⇒ smallest bulk band 0 (a DISTINCT axis, not the velocity signal)
    diff.peers.role === 0 &&
    diff.peers.ski === 0 && diff.peers.pak === 0 && diff.peers.blo === 0 && diff.peers.ctr === 0 &&
    diff.peers.int === 0 && diff.peers.reach === 0 && diff.peers.head === 0 && diff.zoneScore === 0;
  ok("9 DIFERENCIADOR ⊥ peers: BAT (escurridiza spd158) SANO SUELTO OCIOSO a quemarropa en PRADO ⇒ swift T2 MIENTRAS role/escaramuza/manada/siega/control/interrupt/reach/embestida/zona = 0 (bulk=0 por tamaño pequeño, ejes ⊥ NO la velocidad)",
     diffOK, JSON.stringify(diff));

  // 10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ h.swiftBounty Δ == oGrant(type)
  const GRANT_TYPES = ["bat", "volatile", "rat", "wolf", "mudlurker", "bandit", "revenant", "orc", "mage", "summoner", "golem", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.swift({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.swift().hero.swiftBounty | 0;
      window.__dev.spawnKill(t);                       // REAL spawnEnemy + killEnemy at hero pos ⇒ drives swift seam
      const after = window.__dev.swift().hero.swiftBounty | 0;
      out[t] = after - before;
    }
    window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.swiftBounty == oGrant(type) por banda (bat/volatile/rat/wolf+2, mudlurker/bandit/revenant+1, orc/mage/summoner/golem+0, adv neutral+0); sub-cap 2; 0 doble-dip",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0
  const offGrant = await page.evaluate((Z) => {
    window.__dev.swift({ enabled: false });           // OFF
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.swift().hero.swiftBounty | 0;
    window.__dev.spawnKill("bat");                    // escurridiza mob, but flag OFF ⇒ dead branch
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
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const swiftDark = flag("SWIFT_SURGE") === "false";
  ok("12 0-REGRESIÓN: 35 flags del arco #59-#93 served enabled:true; SWIFT_SURGE served false (DARK #94)",
     arcAllOn && swiftDark && arc.length === 35, `swift=${flag("SWIFT_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // screenshot evidence (ON + bat escurridiza)
  await page.evaluate((Z) => { window.__dev.swift({ enabled: true }); window.__dev.swift({ clearSwift: true }); window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false }); });

  // 13 NORTH STAR — 2-client convergence
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
    window.__dev.swift({ enabled: true }); window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.swift();
    const lut = [0, 1, 2, 12].map(s => { const p = window.__dev.swift({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, c: p.charge }; });
    const spd = [0, 89, 90, 119, 120, 158].map(sp => window.__dev.swift({ spdProbe: { spd: sp } }).spdProbe.weight);
    const sp = window.__dev.swift({ swiftProbe: true }).swiftProbe;
    const w = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(w);
    const terr = (w && (w.terrHash != null ? w.terrHash : (w.terr != null ? w.terr : null)));
    window.__dev.swift({ clearSwift: true }); window.__dev.swift({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spScore: sp.score, spCount: sp.count, lut, spd, fp, terr };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: sp.mobs[]/spCount mirror the AMBIENT G.enemies within radius, which drift by how many sim frames each
  // page has run (page A booted first ⇒ ambient mobs wandered farther) — a session-age artifact, NOT a product
  // desync (same lesson as CAS-2549/CAS-2552). The MECHANIC's server-auth signal is spScore (MAX weight over
  // in-radio mobs) + score/tier/charge + the pure LUTs + worldFingerprint — all deterministic. We assert THOSE.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore &&
    JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.spd) === JSON.stringify(B.spd) && A.fp === B.fp && A.terr === B.terr;
  // the injected bat (weight 2) must be the MAX on BOTH clients regardless of ambient ordering
  const batMax = A.spScore === oWeightType("bat") && B.spScore === oWeightType("bat");
  // also cross-check both clients against the QA oracle
  const oracleMatch = A.score === oWeightType("bat") && A.charge === oCharge(oWeightType("bat"), true) &&
    JSON.stringify(A.spd) === JSON.stringify([0, 89, 90, 119, 120, 158].map(oWeightSpd));
  ok("13 NORTH STAR 2-CLIENTE: MISMO bat+héroe ⇒ score/tier/charge + spScore(MAX) + LUT spd/score + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (sp.mobs[] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && batMax && oracleMatch, `fpMatch=${A.fp === B.fp} terrA=${A.terr} terrB=${B.terr} spScoreA=${A.spScore} spScoreB=${B.spScore} A={s:${A.score},t:${A.tier},c:${A.charge},spd:${JSON.stringify(A.spd)},fpLen:${A.fp.length}} B={s:${B.score},t:${B.tier},c:${B.charge},fpLen:${B.fp.length}} batMax=${batMax} oracleMatch=${oracleMatch}`);
  await page.evaluate(() => window.__dev.swift({ enabled: false }));
  await pageB.evaluate(() => window.__dev.swift({ enabled: false }));

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
