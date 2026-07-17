// CAS-2547 — QA-OWNED INDEPENDENT DARK QA (Gate 2/2) for REMATE DE MOLE (BULK_SURGE, EVO#92, enabled:false).
// This is the QA counterpart to the GE self-verify (tools/cas2546-bulk-selfverify.mjs). It DOES NOT trust
// the GE oracle tables. Instead it RE-DERIVES every oracle in PURE JS by importing the CEO knobs
// (BULK_SURGE) and the real enemy templates (ETPL) DIRECTLY from sim/config.js at the Node level, then
// cross-checks the browser server-auth probes / REAL kill grants against those independently-computed
// expectations. Every value the browser reports is checked against a number QA computed itself.
//
// EJE (⊥33): BANDA DE TAMAÑO/HITBOX FÍSICO del mob TYPE, server-auth ESTÁTICO. bulkWeight(víctima) = banda
//   del TAMAÑO BASE INMUTABLE ETPL[e.type].size: sz≥hiSize(24)⇒2 (moose/charger/golem/dragon), sz≥midSize(18)⇒1
//   (wolf/skeleton/orc/mage), sz<midSize (rat15/bat14/volatile16)⇒0. Canal FRESCO bulkFind→h.bulkBounty
//   (transitorio, fuera del save + worldFingerprint), sub-cap bulkBountyCap:2, badge ⬢.
//   CLAVE ⊥#74/⊥champion: lee ETPL[e.type].size BASE, NO e.tpl.size — afijo (A.sizeMul)/campeón (C.sizeMul)
//   inflan el CLON, jamás la fila base ⇒ mole desacoplada por construcción.
//
// QA checks (Gate 2/2, DARK — flag OFF):
//   0  no JS errors
//   1  boot + __dev.bulk + arc peer hooks + __BUILD
//   2  byte-neutral OFF fresh boot: enabled false, gExists false, all-zero, tag ""
//   3  STATELESS: save blob has NO bulkBounty/bulkFind key (transient, 100% derived)
//   4  worldFingerprint byte-stable across enabled toggle (fichas NUNCA entran al fp; 0 RNG drift)
//   5  ORACLE sizeProbe LUT: browser weight == QA-re-derived oWeight(size) for every band + edges
//   6  ORACLE scoreProbe LUT: browser tier/charge == QA-re-derived oRank/oCharge(score) + sub-cap
//   7  ORACLE REAL spawnBulk: for EVERY ETPL type, browser bulkWeight == oWeight(ETPL[type].size) (QA imports ETPL)
//   7b ⊥#74/⊥champion CRUX: inflate e.tpl.size→99 (mimics affix/champion sizeMul) ⇒ weight still reads BASE band
//   8  ⊥#91 CRUX: moose(sz26⇒2) in PRADO zone-tier0 vs rat(sz15⇒0) in ABISMO zone-tier2 — DISJOINT (entity vs terrain)
//   9  DIFFERENTIATOR ⊥ peers: lone healthy idle point-blank forest MOOSE ⇒ bulk T2 while 8 peer hooks read 0
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ h.bulkBounty Δ == oCharge(oWeight(base))
//      per band (moose+2 / wolf+1 / rat+0 / neutral adv+0); sub-cap 2; single source ⇒ 0 double-dip
//   11 REAL GRANT byte-neutral OFF: same spawnKill(moose) with flag OFF ⇒ Δ h.bulkBounty == 0
//   12 0-REGRESSION: 33 arc flags served enabled:true; BULK_SURGE served false (DARK #92)
//   13 NORTH STAR 2-client convergence: same mob+hero ⇒ score/tier/charge + probes + worldFingerprint identical, 0-desync
//
// Run: node tools/cas2547-bulk-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { BULK_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from the GE harness) ----
const HI = (BULK_SURGE.hiSize != null ? +BULK_SURGE.hiSize : 24);
const MID = (BULK_SURGE.midSize != null ? +BULK_SURGE.midSize : 18);
const WLARGE = +(BULK_SURGE.weights && BULK_SURGE.weights.large) || 2;
const WMID = +(BULK_SURGE.weights && BULK_SURGE.weights.mid) || 1;
const TIERS = (BULK_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, BULK_SURGE.bulkBountyCap | 0);
// oWeight: band of a physical size. sz>=hiSize ⇒ large; sz>=midSize ⇒ mid; else 0.
const oWeight = (sz) => (sz >= HI ? WLARGE : sz >= MID ? WMID : 0);
// oRank: index (1-based) of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank (band of its BASE size → charge). neutral ⇒ 0.
const oGrant = (type, on) => { const tpl = ETPL[type]; if (!on || !tpl || tpl.neutral) return 0; return oCharge(oWeight(+tpl.size || 0), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2547");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

console.log(`[QA oracle] hiSize=${HI} midSize=${MID} wLarge=${WLARGE} wMid=${WMID} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${BULK_SURGE.enabled}`);

// Zone tiles (deterministic 760×908 continent — same seed ⇒ same rects ⇒ same zone every client).
const Z = { forest: [192, 723], abyss: [192, 768] };
// Sizes to probe: every band boundary + interior (QA picks these, independent of the GE list).
const SIZES = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 36, 44, 50];
// Scores to probe the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 9, 100];
// EVERY type in ETPL that carries a numeric size — REAL server-auth spawn coverage (QA enumerates ETPL itself).
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t].size === "number");

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play, __dev.bulk + arc hooks + spawnKill + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.bulk());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.bulkBounty nunca creado), all-zero, tag \"\"",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "bulkFind" && dark.tag === "" && dark.hiSize === HI && dark.midSize === MID,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" hiSize=${dark.hiSize} midSize=${dark.midSize} weights=${JSON.stringify(dark.weights)}`);

  // 3 STATELESS: save has no bulkBounty/bulkFind key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"bulkBounty"\s*:/.test(saveOff) && !/"bulkFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave bulkBounty/bulkFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint stable across toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const terrBefore = await page.evaluate(() => { const w = window.__dev.worldFingerprint(393); return (w && (w.terrHash != null ? w.terrHash : (w.terr != null ? w.terr : null))); });
  await page.evaluate(() => window.__dev.bulk({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.bulk({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} terrHash=${terrBefore}`);

  // 5 ORACLE sizeProbe LUT: browser weight == QA-re-derived oWeight(size)
  const szBrowser = await page.evaluate((sizes) => sizes.map(sz => window.__dev.bulk({ sizeProbe: { size: sz } }).sizeProbe.weight), SIZES);
  const szExpect = SIZES.map(oWeight);
  const szOK = SIZES.every((sz, i) => szBrowser[i] === szExpect[i]);
  ok("5 ORACLE sizeProbe LUT: browser weight == QA-re-derived oWeight(size) en cada banda + bordes (midSize/hiSize)",
     szOK, szOK ? `all ${SIZES.length} match` : JSON.stringify(SIZES.map((sz, i) => ({ sz, got: szBrowser[i], exp: szExpect[i] })).filter((x, i) => szBrowser[i] !== szExpect[i])));

  // 6 ORACLE scoreProbe LUT: browser tier/charge == QA-re-derived oRank/oCharge
  const scBrowser = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.bulk({ scoreProbe: { score: s } }).scoreProbe; return { tier: p.tier, charge: p.charge }; }), SCORES);
  const scOK = SCORES.every((s, i) => scBrowser[i].tier === oRank(s) && scBrowser[i].charge === oCharge(s, true));
  const capMax = Math.max(...scBrowser.map(x => x.charge));
  ok("6 ORACLE scoreProbe LUT: browser tier/charge == QA oRank/oCharge(score) + sub-cap (max charge ≤ cap)",
     scOK && capMax <= CAP, `capMax=${capMax} cap=${CAP} ` + (scOK ? "all match" : JSON.stringify(SCORES.map((s, i) => ({ s, gotT: scBrowser[i].tier, expT: oRank(s), gotC: scBrowser[i].charge, expC: oCharge(s, true) })).filter((x, i) => scBrowser[i].tier !== oRank(x.s) || scBrowser[i].charge !== oCharge(x.s, true)))));

  // 7 ORACLE REAL spawnBulk over EVERY ETPL type: browser bulkWeight == oWeight(ETPL[type].size)
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.bulk({ enabled: true });
    const out = {};
    for (const t of types) {
      window.__dev.bulk({ clearBulk: true });
      window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sb = window.__dev.bulk({ spawnBulk: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnBulk;
      const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;
      out[t] = { size: sb.size, weight: sb.weight, valid: sb.valid, bpW: bp.mobs[0] ? bp.mobs[0].weight : -1, bpType: bp.mobs[0] ? bp.mobs[0].type : "" };
    }
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => {
    const b = spawn7[t], baseSize = +ETPL[t].size || 0, expW = oWeight(baseSize);
    return !b || !b.valid || b.size !== baseSize || b.weight !== expW || b.bpW !== expW || b.bpType !== t;
  });
  ok(`7 ORACLE REAL spawnBulk sobre LAS ${ALL_TYPES.length} filas de ETPL: browser bulkWeight == oWeight(ETPL[type].size) BASE (server-auth)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, base: ETPL[t].size, exp: oWeight(+ETPL[t].size), got: spawn7[t] && spawn7[t].weight }))) : `all ${ALL_TYPES.length} types match base band`);

  // 7b ⊥#74/⊥champion CRUX: inflate e.tpl.size → 99 ⇒ still reads BASE band
  const infl = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
    const rd = (type, inflate) => { window.__dev.bulk({ clearBulk: true });
      window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sb = window.__dev.bulk({ spawnBulk: { type, tx: Z.forest[0], ty: Z.forest[1], inflate } }).spawnBulk;
      const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;
      return { tplSize: sb.tplSize, size: sb.size, weight: sb.weight, bpW: bp.mobs[0] ? bp.mobs[0].weight : -99 }; };
    const rat = rd("rat", 99);     // base 15 ⇒ 0 despite tpl 99
    const orc = rd("orc", 99);     // base 22 ⇒ 1 despite tpl 99 (NOT 2)
    window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ enabled: false });
    return { rat, orc };
  }, Z);
  const inflOK = infl.rat.tplSize === 99 && infl.rat.size === (+ETPL.rat.size) && infl.rat.weight === oWeight(+ETPL.rat.size) && infl.rat.bpW === oWeight(+ETPL.rat.size) &&
    infl.orc.tplSize === 99 && infl.orc.size === (+ETPL.orc.size) && infl.orc.weight === oWeight(+ETPL.orc.size) && infl.orc.bpW === oWeight(+ETPL.orc.size);
  ok("7b ⊥#74/⊥champion CRUX: e.tpl.size inflado a 99 (mimetiza afijo A.sizeMul/campeón C.sizeMul) ⇒ bulkOf lee ETPL[type].size BASE ⇒ rata SIGUE 0, orco SIGUE 1 (desacople del clon)",
     inflOK, JSON.stringify(infl));

  // 8 ⊥#91 CRUX: moose forest bulk2/zone0 vs rat abyss bulk0/zone2
  const crux = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true }); window.__dev.zonetier({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const mooseForest = { bulk: window.__dev.bulk().score, zone: window.__dev.zonetier({ tierProbe: true }).tierProbe.score };
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.bulk({ spawnBulk: { type: "rat", tx: Z.abyss[0], ty: Z.abyss[1] } });
    const ratAbyss = { bulk: window.__dev.bulk().score, zone: window.__dev.zonetier({ tierProbe: true }).tierProbe.score };
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ enabled: false }); window.__dev.zonetier({ enabled: false });
    return { mooseForest, ratAbyss };
  }, Z);
  const cruxOK = crux.mooseForest.bulk === oWeight(+ETPL.moose.size) && crux.mooseForest.zone === 0 &&
    crux.ratAbyss.bulk === oWeight(+ETPL.rat.size) && crux.ratAbyss.zone === 2;
  ok("8 ⊥#91 CRUX: ALCE(sz26⇒mole2) en PRADO(zone0) ⇒ bulk2/zone0; RATA(sz15⇒mole0) en ABISMO(zone2) ⇒ bulk0/zone2 (entidad vs terreno, DISJUNTOS)",
     cruxOK, JSON.stringify(crux));

  // 9 DIFFERENTIATOR ⊥ peers: lone healthy idle point-blank forest MOOSE ⇒ bulk T2 while peers read 0
  const diff = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true }); window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.bulk();
    const peers = {
      ski: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score,
      pak: window.__dev.packHarvest({ packProbe: true }).packProbe.score,
      blo: window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score,
      ctr: window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score,
      int: window.__dev.interrupt({ actProbe: true }).actProbe.score,
      reach: window.__dev.longshot({ reachProbe: true }).reachProbe.score,
      head: window.__dev.heading().score,
    };
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });
    window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, peers, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&
    diff.peers.ski === 0 && diff.peers.pak === 0 && diff.peers.blo === 0 && diff.peers.ctr === 0 &&
    diff.peers.int === 0 && diff.peers.reach === 0 && diff.peers.head === 0 && diff.zoneScore === 0;
  ok("9 DIFERENCIADOR ⊥ peers: ALCE MELEE SANO SUELTO OCIOSO a quemarropa en PRADO ⇒ bulk T2 MIENTRAS escaramuza/manada/siega/control/interrupt/reach/embestida/zona = 0",
     diffOK, JSON.stringify(diff));

  // 10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ h.bulkBounty Δ == oGrant(type)
  const GRANT_TYPES = ["moose", "golem", "charger", "wolf", "orc", "skeleton", "rat", "bat", "volatile", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.bulk({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.bulk().hero.bulkBounty | 0;
      window.__dev.spawnKill(t);                       // REAL spawnEnemy + killEnemy at hero pos ⇒ drives bulk seam
      const after = window.__dev.bulk().hero.bulkBounty | 0;
      out[t] = after - before;
    }
    window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.bulkBounty == oGrant(type) por banda (moose/golem/charger+2, wolf/orc/skeleton+1, rat/bat/volatile+0, adv neutral+0); sub-cap 2; 0 doble-dip",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF: same spawnKill(moose) with flag OFF ⇒ Δ == 0
  const offGrant = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: false });           // OFF
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.bulk().hero.bulkBounty | 0;
    window.__dev.spawnKill("moose");                 // big mob, but flag OFF ⇒ dead branch
    window.__dev.spawnKill("golem");
    const after = window.__dev.bulk().hero.bulkBounty | 0;
    return { before, after, delta: after - before };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(moose)+spawnKill(golem) con flag OFF ⇒ Δh.bulkBounty == 0 (rama muerta, 0 fichas al seam)",
     offGrant.delta === 0, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 33 arc flags served true; BULK_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const blkDark = flag("BULK_SURGE") === "false";
  ok("12 0-REGRESIÓN: 33 flags del arco #59-#91 served enabled:true; BULK_SURGE served false (DARK #92)",
     arcAllOn && blkDark && arc.length === 33, `bulk=${flag("BULK_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // screenshot evidence (ON + moose)
  await page.evaluate((Z) => { window.__dev.bulk({ enabled: true }); window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ enabled: false }); });

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
    window.__dev.bulk({ enabled: true }); window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.bulk();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.bulk({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, c: p.charge }; });
    const sizes = [14, 15, 18, 22, 24, 26, 36].map(sz => window.__dev.bulk({ sizeProbe: { size: sz } }).sizeProbe.weight);
    const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;
    const w = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(w);
    const terr = (w && (w.terrHash != null ? w.terrHash : (w.terr != null ? w.terr : null)));
    window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, bpScore: bp.score, bpCount: bp.count, bpW: bp.mobs[0] ? bp.mobs[0].weight : -1, bpType: bp.mobs[0] ? bp.mobs[0].type : "", lut, sizes, fp, terr };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: bp.mobs[]/bpCount mirror the AMBIENT G.enemies within radius, which drift by how many sim frames
  // each page has run (page A booted first ⇒ ambient mobs wandered farther) — a session-age artifact, NOT a
  // product desync (same lesson as CAS-2526). The MECHANIC's server-auth signal is bpScore (the MAX weight over
  // in-radio mobs) + score/tier/charge + the pure LUTs + worldFingerprint — all deterministic. We assert THOSE.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.bpScore === B.bpScore &&
    JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.sizes) === JSON.stringify(B.sizes) && A.fp === B.fp && A.terr === B.terr;
  // the injected moose (weight 2) must be the MAX on BOTH clients regardless of ambient ordering
  const mooseMax = A.bpScore === oWeight(+ETPL.moose.size) && B.bpScore === oWeight(+ETPL.moose.size);
  // also cross-check both clients against the QA oracle
  const oracleMatch = A.score === oWeight(+ETPL.moose.size) && A.charge === oCharge(oWeight(+ETPL.moose.size), true) && JSON.stringify(A.sizes) === JSON.stringify([14, 15, 18, 22, 24, 26, 36].map(oWeight));
  ok("13 NORTH STAR 2-CLIENTE: MISMO alce+héroe ⇒ score/tier/charge + bpScore(MAX) + LUT + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (bp.mobs[] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && mooseMax && oracleMatch, `fpMatch=${A.fp === B.fp} terrA=${A.terr} terrB=${B.terr} bpScoreA=${A.bpScore} bpScoreB=${B.bpScore} A={s:${A.score},t:${A.tier},c:${A.charge},sizes:${JSON.stringify(A.sizes)},fpLen:${A.fp.length}} B={s:${B.score},t:${B.tier},c:${B.charge},fpLen:${B.fp.length}} mooseMax=${mooseMax} oracleMatch=${oracleMatch}`);
  await page.evaluate(() => window.__dev.bulk({ enabled: false }));
  await pageB.evaluate(() => window.__dev.bulk({ enabled: false }));

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
