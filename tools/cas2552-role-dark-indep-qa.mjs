// CAS-2552 — QA-OWNED INDEPENDENT DARK QA (Gate 2/2) for REMATE DE CABECILLA (ROLE_SURGE, EVO#93, enabled:false).
// QA counterpart to the GE self-verify (tools/cas2551-role-selfverify.mjs). It DOES NOT trust the GE oracle
// tables. It RE-DERIVES every oracle in PURE JS by importing the CEO knobs (ROLE_SURGE) and the real enemy
// templates (ETPL) DIRECTLY from sim/config.js at the Node level, then cross-checks the browser server-auth
// probes / REAL kill grants against those independently-computed expectations. Every number the browser
// reports is checked against a value QA computed itself. Grants are driven through the REAL killEnemy seam
// (spawnKill), NOT the forageChargePreview — the strongest available proof that the flip will bank correctly.
//
// EJE (⊥34): ROL/ARQUETIPO DE COMBATE del mob TYPE, server-auth ESTÁTICO. roleWeight(víctima) = banda de
//   roleBand(roleOf(e)=ETPL[e.type].arch BASE INMUTABLE): enabler(summoner/healer, dmg:0)⇒2, disruptor
//   (warlock/volatile/punisher)⇒1, brawler(brute/charger/rusher/caster, o sin arch)⇒0. Canal FRESCO
//   roleFind→h.roleBounty (transitorio, fuera del save + worldFingerprint), sub-cap roleBountyCap:2, badge ❖.
//   CLAVE ⊥#73/⊥champion: lee ETPL[e.type].arch BASE, NO e.tpl.arch — la promoción a campeón LIMPIA el CLON
//   (arch=undefined sim.js:6318), jamás la fila base ⇒ rol desacoplado por construcción.
//
// QA checks (Gate 2/2, DARK — flag OFF):
//   0  no JS errors
//   1  boot + __dev.role + arc peer hooks + spawnKill + __BUILD
//   2  byte-neutral OFF fresh boot: enabled false, gExists false (G.roleBounty nunca creado), all-zero, tag ""
//   3  STATELESS: save blob has NO roleBounty/roleFind key (transient, 100% derived)
//   4  worldFingerprint byte-stable across enabled toggle (fichas NUNCA entran al fp; 0 RNG drift)
//   5  ORACLE archProbe LUT: browser band/weight/tier/charge == QA-re-derived for every arch (listed + unlisted→brawler)
//   6  ORACLE scoreProbe LUT: browser tier/charge == QA-re-derived oRank/oCharge(score) + sub-cap
//   7  ORACLE REAL spawnRole: for EVERY ETPL type, browser roleWeight == oWeightType(ETPL[type].arch BASE)
//   7b ⊥#73/⊥champion CRUX: overrideArch clones e.tpl.arch (healer→'brute') ⇒ roleWeight still reads BASE arch (rol 2)
//   8  ⊥#92 CRUX: summoner(enabler rol2, sz20⇒bulk1) vs moose(brute rol0, sz26⇒bulk2) — DISJOINT (IA-función vs tamaño)
//   8b ⊥#84 CRUX: healer(enabler rol2, ranged:false skirmish0) vs spearman(caster rol0, ranged:true skirmish>0) — OPPOSITE
//   9  DIFFERENTIATOR ⊥ peers: lone summoner ⇒ role T2 while bulk/skirmish/pack/blood/control/interrupt/reach/heading/zone read 0
//   10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ h.roleBounty Δ == oGrant(type)
//      per band (summoner/healer+2 / volatile/revenant/demon+1 / orc/wolf/moose+0 / adv neutral+0); sub-cap 2; 0 double-dip
//   11 REAL GRANT byte-neutral OFF: same spawnKill(summoner)+spawnKill(healer) with flag OFF ⇒ Δ h.roleBounty == 0
//   12 0-REGRESSION: 34 arc flags served enabled:true; ROLE_SURGE served false (DARK #93)
//   13 NORTH STAR 2-client convergence: same mob+hero ⇒ score/tier/charge + probes + worldFingerprint identical, 0-desync
//
// Run: node tools/cas2552-role-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { ROLE_SURGE, ETPL } from "../sim/config.js";

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from the GE harness) ----
const LUT = ROLE_SURGE.roleTier || {};
const WEN = +(ROLE_SURGE.weights && ROLE_SURGE.weights.enabler) || 2;
const WDI = +(ROLE_SURGE.weights && ROLE_SURGE.weights.disruptor) || 1;
const TIERS = (ROLE_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, ROLE_SURGE.roleBountyCap | 0);
// oBand: LUT arch→band; unlisted ⇒ "brawler".
const oBand = (arch) => (LUT[arch] ? String(LUT[arch]) : "brawler");
// oWeightArch: band of a role. enabler⇒WEN(2); disruptor⇒WDI(1); brawler⇒0.
const oWeightArch = (arch) => { const b = oBand(arch); return b === "enabler" ? WEN : b === "disruptor" ? WDI : 0; };
// oWeightType: BASE arch of a real ETPL type → weight.
const oWeightType = (type) => { const tpl = ETPL[type]; return tpl ? oWeightArch(String(tpl.arch || "")) : 0; };
// oRank: index (1-based) of the most-intense tier whose min is satisfied; 0 if none.
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
// oCharge: sub-capped charge for a score; OFF ⇒ 0.
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
// oGrant: what a REAL kill of a mob TYPE should bank (weight of its BASE arch → charge). neutral ⇒ 0.
const oGrant = (type, on) => { const tpl = ETPL[type]; if (!on || !tpl || tpl.neutral) return 0; return oCharge(oWeightType(type), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2552");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

console.log(`[QA oracle] roleTier=${JSON.stringify(LUT)} wEnabler=${WEN} wDisruptor=${WDI} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${ROLE_SURGE.enabled}`);

// Zone tiles (deterministic 760×908 continent — same seed ⇒ same rects ⇒ same zone every client).
const Z = { forest: [192, 723] };
// Arches to probe: every listed band + unlisted (⇒ brawler) + bogus (⇒ brawler).
const ARCHES = ["summoner", "healer", "warlock", "volatile", "punisher", "brute", "charger", "rusher", "caster", "", "__nope__"];
// Scores to probe the tier/charge LUT + sub-cap headroom.
const SCORES = [0, 1, 2, 3, 5, 12, 100];
// EVERY type in ETPL — REAL server-auth spawn coverage (QA enumerates ETPL itself).
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object");

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.role && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest && window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok("1 boots to play, __dev.role + arc peer hooks + spawnKill + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.role());
  ok("2 byte-neutral OFF (fresh boot): enabled false, gExists false (G.roleBounty nunca creado), all-zero, tag \"\"",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "roleFind" && dark.tag === "" && dark.cap === CAP,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}" cap=${dark.cap} roleTier=${JSON.stringify(dark.roleTier)}`);

  // 3 STATELESS: save has no roleBounty/roleFind key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const statelessOK = !/"roleBounty"\s*:/.test(saveOff) && !/"roleFind[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS: save blob SIN clave roleBounty/roleFind (moneda transitoria, 100% derivada)", statelessOK, `len=${saveOff.length}`);

  // 4 worldFingerprint stable across toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  const terrBefore = await page.evaluate(() => { const w = window.__dev.worldFingerprint(393); return (w && (w.terrHash != null ? w.terrHash : (w.terr != null ? w.terr : null))); });
  await page.evaluate(() => window.__dev.role({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.role({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (fichas NO entran al fp; 0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter} terrHash=${terrBefore}`);

  // 5 ORACLE archProbe LUT: browser band/weight/tier/charge == QA-re-derived
  const arBrowser = await page.evaluate((arches) => arches.map(a => { const p = window.__dev.role({ archProbe: { arch: a } }).archProbe; return { arch: a, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), ARCHES);
  const arBad = ARCHES.filter((a, i) => {
    const b = arBrowser[i], eB = oBand(a), eW = oWeightArch(a), eT = oRank(eW), eC = oCharge(eW, true);
    return !b || b.band !== eB || b.weight !== eW || b.tier !== eT || b.charge !== eC;
  });
  ok("5 ORACLE archProbe LUT: browser band/weight/tier/charge == QA-re-derived para cada arch (listado + no-listado→brawler + bogus→brawler)",
     arBad.length === 0, arBad.length ? JSON.stringify(arBad.map(a => ({ a, got: arBrowser[ARCHES.indexOf(a)], expB: oBand(a), expW: oWeightArch(a) }))) : `all ${ARCHES.length} match`);

  // 6 ORACLE scoreProbe LUT: browser tier/charge == QA-re-derived oRank/oCharge
  const scBrowser = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.role({ scoreProbe: { score: s } }).scoreProbe; return { tier: p.tier, charge: p.charge }; }), SCORES);
  const scOK = SCORES.every((s, i) => scBrowser[i].tier === oRank(s) && scBrowser[i].charge === oCharge(s, true));
  const capMax = Math.max(...scBrowser.map(x => x.charge));
  ok("6 ORACLE scoreProbe LUT: browser tier/charge == QA oRank/oCharge(score) + sub-cap (max charge ≤ cap)",
     scOK && capMax <= CAP, `capMax=${capMax} cap=${CAP} ` + (scOK ? "all match" : JSON.stringify(SCORES.map((s, i) => ({ s, gotT: scBrowser[i].tier, expT: oRank(s), gotC: scBrowser[i].charge, expC: oCharge(s, true) })).filter((x, i) => scBrowser[i].tier !== oRank(x.s) || scBrowser[i].charge !== oCharge(x.s, true)))));

  // 7 ORACLE REAL spawnRole over EVERY ETPL type: browser roleWeight == oWeightType(ETPL[type].arch BASE)
  const spawn7 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.role({ enabled: true });
    const out = {};
    for (const t of types) {
      window.__dev.role({ clearRole: true });
      window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.role({ spawnRole: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnRole;
      const rp = window.__dev.role({ roleProbe: true }).roleProbe;
      out[t] = { arch: sr.arch, band: sr.band, weight: sr.weight, valid: sr.valid, rpW: (rp.mobs[0] ? rp.mobs[0].weight : -1), rpArch: (rp.mobs[0] ? rp.mobs[0].arch : "") };
    }
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false });
    return out;
  }, { types: ALL_TYPES, Z });
  const s7bad = ALL_TYPES.filter(t => {
    const b = spawn7[t], expW = oWeightType(t), expArch = String(ETPL[t].arch || "");
    return !b || !b.valid || b.arch !== expArch || b.weight !== expW || b.rpW !== expW;
  });
  ok(`7 ORACLE REAL spawnRole sobre LAS ${ALL_TYPES.length} filas de ETPL: browser roleWeight == oWeightType(ETPL[type].arch) BASE (server-auth)`,
     s7bad.length === 0, s7bad.length ? JSON.stringify(s7bad.map(t => ({ t, arch: ETPL[t].arch, exp: oWeightType(t), got: spawn7[t] && spawn7[t].weight }))) : `all ${ALL_TYPES.length} types match base band`);

  // 7b ⊥#73/⊥champion CRUX: overrideArch clones e.tpl.arch ⇒ roleOf still reads BASE arch
  const ovr = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true });
    const rd = (type, overrideArch) => { window.__dev.role({ clearRole: true });
      window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.role({ spawnRole: { type, tx: Z.forest[0], ty: Z.forest[1], overrideArch } }).spawnRole;
      const rp = window.__dev.role({ roleProbe: true }).roleProbe;
      return { arch: sr.arch, tplArch: sr.tplArch, band: sr.band, weight: sr.weight, rpW: (rp.mobs[0] ? rp.mobs[0].weight : -99) }; };
    const healer = rd("healer", "brute");     // champion-clean mimic: clone arch='brute' but BASE stays 'healer' ⇒ 2
    const orc = rd("orc", "summoner");         // inflate clone to 'summoner' but BASE 'brute' ⇒ still 0
    window.__dev.role({ clearRole: true }); window.__dev.role({ enabled: false });
    return { healer, orc };
  }, Z);
  const ovrOK = ovr.healer.tplArch === "brute" && ovr.healer.arch === "healer" && ovr.healer.weight === oWeightType("healer") && ovr.healer.rpW === oWeightType("healer") &&
    ovr.orc.tplArch === "summoner" && ovr.orc.arch === "brute" && ovr.orc.weight === oWeightType("orc") && ovr.orc.rpW === oWeightType("orc");
  ok("7b ⊥#73/⊥champion CRUX: e.tpl.arch sobrescrito en el CLON (healer→'brute', orc→'summoner', mimetiza campeón sim.js:6318) ⇒ roleOf lee ETPL[type].arch BASE ⇒ healer SIGUE rol2, orco SIGUE rol0 (desacople del clon)",
     ovrOK, JSON.stringify(ovr));

  // 8 ⊥#92 CRUX: summoner(enabler rol2, sz20⇒bulk1) vs moose(brute rol0, sz26⇒bulk2) — DISJOINT
  const crux92 = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true }); window.__dev.bulk({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const summoner = { role: window.__dev.role().score, bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score };
    window.__dev.role({ clearRole: true });
    window.__dev.role({ spawnRole: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const moose = { role: window.__dev.role().score, bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score };
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { summoner, moose };
  }, Z);
  const crux92OK = crux92.summoner.role === oWeightType("summoner") && crux92.summoner.role === 2 && crux92.summoner.bulk === 1 &&
    crux92.moose.role === oWeightType("moose") && crux92.moose.role === 0 && crux92.moose.bulk === 2;
  ok("8 ⊥#92 CRUX: SUMMONER (enabler rol2, sz20⇒mole1) vs MOOSE (brute rol0, sz26⇒mole2) — DISJUNTOS (rol lee arch/FUNCIÓN de IA, mole lee size/TAMAÑO físico)",
     crux92OK, JSON.stringify(crux92));

  // 8b ⊥#84 CRUX: healer(enabler rol2, ranged:false skirmish0) vs spearman(caster rol0, ranged:true skirmish>0)
  const crux84 = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true }); window.__dev.skirmishLine({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "spearman", tx: Z.forest[0], ty: Z.forest[1] } });
    const spearman = { role: window.__dev.role().score, skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score };
    window.__dev.role({ clearRole: true });
    window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } });
    const healer = { role: window.__dev.role().score, skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score };
    window.__dev.role({ clearRole: true });
    window.__dev.role({ enabled: false }); window.__dev.skirmishLine({ enabled: false });
    return { spearman, healer };
  }, Z);
  const crux84OK = crux84.spearman.role === 0 && crux84.spearman.skirmish > 0 && crux84.healer.role === 2 && crux84.healer.skirmish === 0;
  ok("8b ⊥#84 CRUX: SPEARMAN (caster ranged) ⇒ rol0/skirmish>0; HEALER (enabler NO-ranged) ⇒ rol2/skirmish0 — OPUESTOS (rol lee arch/FUNCIÓN, escaramuza lee ranged/ALCANCE)",
     crux84OK, JSON.stringify(crux84));

  // 9 DIFFERENTIATOR ⊥ peers: lone summoner ⇒ role T2 while peers read 0
  const diff = await page.evaluate((Z) => {
    window.__dev.role({ enabled: true }); window.__dev.bulk({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.role();
    const peers = {
      bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score,
      ski: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score,
      pak: window.__dev.packHarvest({ packProbe: true }).packProbe.score,
      blo: window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score,
      ctr: window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score,
      int: window.__dev.interrupt({ actProbe: true }).actProbe.score,
      reach: window.__dev.longshot({ reachProbe: true }).reachProbe.score,
      head: window.__dev.heading().score,
    };
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score; window.__dev.zonetier({ enabled: false });
    window.__dev.role({ clearRole: true }); window.__dev.role({ enabled: false }); window.__dev.bulk({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, peers, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&
    diff.peers.bulk === 1 &&   // summoner sz20 ⇒ mole mid band 1 (NOT the role signal — a distinct axis)
    diff.peers.ski === 0 && diff.peers.pak === 0 && diff.peers.blo === 0 && diff.peers.ctr === 0 &&
    diff.peers.int === 0 && diff.peers.reach === 0 && diff.peers.head === 0 && diff.zoneScore === 0;
  ok("9 DIFERENCIADOR ⊥ peers: SUMMONER (enabler) SANO SUELTO OCIOSO a quemarropa en PRADO ⇒ rol T2 MIENTRAS escaramuza/manada/siega/control/interrupt/reach/embestida/zona = 0 (mole=1 por tamaño, eje ⊥ NO el rol)",
     diffOK, JSON.stringify(diff));

  // 10 REAL GRANT (flag ON): spawnKill drives the REAL killEnemy seam ⇒ h.roleBounty Δ == oGrant(type)
  const GRANT_TYPES = ["summoner", "healer", "volatile", "revenant", "demon", "orc", "wolf", "moose", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.role({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.role().hero.roleBounty | 0;
      window.__dev.spawnKill(t);                       // REAL spawnEnemy + killEnemy at hero pos ⇒ drives role seam
      const after = window.__dev.role().hero.roleBounty | 0;
      out[t] = after - before;
    }
    window.__dev.role({ clearRole: true }); window.__dev.role({ enabled: false });
    return out;
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant[t]));
  ok("10 REAL GRANT (flag ON): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.roleBounty == oGrant(type) por banda (summoner/healer+2, volatile/revenant/demon+1, orc/wolf/moose+0, adv neutral+0); sub-cap 2; 0 doble-dip",
     grantBad.length === 0 && grantMax <= CAP, grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant)} max=${grantMax}`);

  // 11 REAL GRANT byte-neutral OFF: same spawnKill with flag OFF ⇒ Δ == 0
  const offGrant = await page.evaluate((Z) => {
    window.__dev.role({ enabled: false });           // OFF
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.role().hero.roleBounty | 0;
    window.__dev.spawnKill("summoner");              // enabler mob, but flag OFF ⇒ dead branch
    window.__dev.spawnKill("healer");
    const after = window.__dev.role().hero.roleBounty | 0;
    return { before, after, delta: after - before };
  }, Z);
  ok("11 REAL GRANT byte-neutral OFF: spawnKill(summoner)+spawnKill(healer) con flag OFF ⇒ Δh.roleBounty == 0 (rama muerta, 0 fichas al seam)",
     offGrant.delta === 0, JSON.stringify(offGrant));

  // 12 0-REGRESSION: 34 arc flags served true; ROLE_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const roleDark = flag("ROLE_SURGE") === "false";
  ok("12 0-REGRESIÓN: 34 flags del arco #59-#92 served enabled:true; ROLE_SURGE served false (DARK #93)",
     arcAllOn && roleDark && arc.length === 34, `role=${flag("ROLE_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // screenshot evidence (ON + summoner enabler)
  await page.evaluate((Z) => { window.__dev.role({ enabled: true }); window.__dev.role({ clearRole: true }); window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.role({ spawnRole: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.role({ clearRole: true }); window.__dev.role({ enabled: false }); });

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
    window.__dev.role({ enabled: true }); window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.role();
    const lut = [0, 1, 2, 12].map(s => { const p = window.__dev.role({ scoreProbe: { score: s } }).scoreProbe; return { s, t: p.tier, c: p.charge }; });
    const arch = ["summoner", "healer", "warlock", "volatile", "punisher", "brute", "caster", ""].map(a => window.__dev.role({ archProbe: { arch: a } }).archProbe.weight);
    const rp = window.__dev.role({ roleProbe: true }).roleProbe;
    const w = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(w);
    const terr = (w && (w.terrHash != null ? w.terrHash : (w.terr != null ? w.terr : null)));
    window.__dev.role({ clearRole: true }); window.__dev.role({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, rpScore: rp.score, rpCount: rp.count, lut, arch, fp, terr };
  }, Z);
  const A = await readVM(page);
  const B = await readVM(pageB);
  // NOTE: rp.mobs[]/rpCount mirror the AMBIENT G.enemies within radius, which drift by how many sim frames each
  // page has run (page A booted first ⇒ ambient mobs wandered farther) — a session-age artifact, NOT a product
  // desync (same lesson as CAS-2549/CAS-2526). The MECHANIC's server-auth signal is rpScore (MAX weight over
  // in-radio mobs) + score/tier/charge + the pure LUTs + worldFingerprint — all deterministic. We assert THOSE.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.rpScore === B.rpScore &&
    JSON.stringify(A.lut) === JSON.stringify(B.lut) && JSON.stringify(A.arch) === JSON.stringify(B.arch) && A.fp === B.fp && A.terr === B.terr;
  // the injected summoner (weight 2) must be the MAX on BOTH clients regardless of ambient ordering
  const summMax = A.rpScore === oWeightType("summoner") && B.rpScore === oWeightType("summoner");
  // also cross-check both clients against the QA oracle
  const oracleMatch = A.score === oWeightType("summoner") && A.charge === oCharge(oWeightType("summoner"), true) &&
    JSON.stringify(A.arch) === JSON.stringify(["summoner", "healer", "warlock", "volatile", "punisher", "brute", "caster", ""].map(oWeightArch));
  ok("13 NORTH STAR 2-CLIENTE: MISMO summoner+héroe ⇒ score/tier/charge + rpScore(MAX) + LUT arch/score + worldFingerprint + terrHash IDÉNTICOS byte-a-byte (0 desync) Y ambos == QA oracle (rp.mobs[] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
     conv && summMax && oracleMatch, `fpMatch=${A.fp === B.fp} terrA=${A.terr} terrB=${B.terr} rpScoreA=${A.rpScore} rpScoreB=${B.rpScore} A={s:${A.score},t:${A.tier},c:${A.charge},arch:${JSON.stringify(A.arch)},fpLen:${A.fp.length}} B={s:${B.score},t:${B.tier},c:${B.charge},fpLen:${B.fp.length}} summMax=${summMax} oracleMatch=${oracleMatch}`);
  await page.evaluate(() => window.__dev.role({ enabled: false }));
  await pageB.evaluate(() => window.__dev.role({ enabled: false }));

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
