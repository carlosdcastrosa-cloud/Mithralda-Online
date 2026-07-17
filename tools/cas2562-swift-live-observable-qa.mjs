// CAS-2562 — POST-FLIP QA (observable LIVE) para REMATE DE PRESA VELOZ (SWIFT_SURGE, EVO#94, flag ON) @ served 3d3e8be4811b / master ef32b3d.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO importando los knobs CEO (SWIFT_SURGE) + templates (ETPL)
// DIRECTAMENTE de sim/config.js al nivel Node (porté el DARK cas2559 → LIVE; NO reusa el harness GE cas2556 selfverify).
// NO es byte-verify (ya hecho por CTO/CEO 2ª byte-verify LIVE 7/7) — es verificación del EFECTO REAL con el flag ENCENDIDO
// en producción, 2 clientes 0-desync. El served (gh-pages 3d3e8be4811b) == master HEAD ef32b3d (byte-verificado
// served game/render/sim byte-idénticos a base 1b15e28 + config flip +1/-1) ⇒ sirvo el árbol local = el sitio servido.
//
// EJE LIVE (⊥35): VELOCIDAD DE MOVIMIENTO BASE del mob TYPE server-auth ESTÁTICO. swiftWeight(víctima) = banda de
//   swiftOf(e)=ETPL[e.type].spd (fila base inmutable): spd≥hiSpd(120) ⇒ escurridiza ⇒ 2; spd≥midSpd(90) ⇒ ágil ⇒ 1;
//   spd<midSpd ⇒ plúmbeo ⇒ 0. Canal FRESCO swiftFind → h.swiftBounty (transitorio, STATELESS), sub-cap swiftBountyCap:2,
//   badge "Acoso" (⇶). Score muestreado en el TOP de killEnemy (_swiftPre). CLAVE ⊥#74/⊥zona/⊥CC: lee ETPL[type].spd
//   BASE, NO e.spd — afijo A.spdMul / z.spdMul / frost slow escalan el CLON e.spd VIVO, jamás la fila base.
//
// Cobertura (issue CAS-2562 — acceptance observable, flag ON):
//  L1 boot LIVE + build==version.json==3d3e8be4811b (AVANZÓ de #93 d3a276a13dc0) + hooks (swift/spawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod: served config SWIFT_SURGE.enabled:true + channel swiftFind + params (hiSpd120/midSpd90/swift2/brisk1/cap2/radius300)
//  L3 LIVE default: __dev.swift().enabled===TRUE + gExists false (STATELESS, G.swiftBounty null) + knobs servidos == oráculos re-derivados
//  L4 LUT spdProbe pura spd→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (89/90, 119/120)
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2
//  L6 ★ REAL server-auth spawnSwift sobre LAS filas de ETPL: browser swiftWeight == oWeightType(ETPL[type].spd) BASE
//  L7 ★★ ⊥#74/⊥zona/⊥CC CRUX: overrideSpd escala el CLON (e.spd/e.tpl.spd) ⇒ swiftOf lee ETPL[type].spd BASE ⇒ magmabrute base56 'Veloz'(clon79) SIGUE swift0; bat base158 frozen(clon40) SIGUE swift2; wolf base128 inflado(clon300) SIGUE swift2
//  L8 ★★ ⊥#93 role / ⊥#92 bulk-size / ⊥WORTH-xp / ⊥#84 reach: ejes DISJUNTOS (data real + weight)
//  L9 DIFERENCIADOR ⊥ peers: BAT escurridiza SANO SUELTO OCIOSO a quemarropa ⇒ swift T2 mientras role/bulk/skirmish/pack/blood/control/interrupt/reach/heading/zona=0(o eje distinto)
//  L10 ★ REAL GRANT (flag ON LIVE default): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.swiftBounty == oGrant(type) por banda (escurridiza+2, ágil+1, plúmbeo+0, adv+0); sub-cap 2; flag OFF ⇒ Δ0
//  L11 STATELESS: h.swiftBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L12 0-regresión LIVE: 36 flags served enabled:true (35 previas #59-#93 + SWIFT_SURGE #94) + core loop fps≥55
//  L13 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + swiftProbe MAX + LUT + worldFingerprint), fp esperado 15920977 / terrHash 2105484439
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2562-swift-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { SWIFT_SURGE, ETPL } from "../sim/config.js";

const EXPECT_BUILD = "3d3e8be4811b";     // served #94 (avanzó de #93 d3a276a13dc0)
const PREV_LIVE = "d3a276a13dc0";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (SWIFT_SURGE.hiSpd != null) ? +SWIFT_SURGE.hiSpd : 120;
const MID = (SWIFT_SURGE.midSpd != null) ? +SWIFT_SURGE.midSpd : 90;
const WSW = +(SWIFT_SURGE.weights && SWIFT_SURGE.weights.swift) || 0;
const WBR = +(SWIFT_SURGE.weights && SWIFT_SURGE.weights.brisk) || 0;
const TIERS = (SWIFT_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, SWIFT_SURGE.swiftBountyCap | 0);
const oBand = (spd) => (spd >= HI ? "swift" : spd >= MID ? "brisk" : "plodder");
const oWeight = (spd) => (spd >= HI ? WSW : spd >= MID ? WBR : 0);
const oSpd = (type) => { const t = ETPL[type]; return t && t.spd != null ? +t.spd : 0; };
const oWeightType = (type) => oWeight(oSpd(type));
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2562-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  const line = `${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`;
  results.push(line); console.log("[step] " + line.slice(0, 130)); };

console.log(`[QA oracle] hiSpd=${HI} midSpd=${MID} wSwift=${WSW} wBrisk=${WBR} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${SWIFT_SURGE.enabled} channel=${SWIFT_SURGE.channel}`);

const Z = { forest: [192, 723] };
const SPD_SWEEP = [0, 40, 56, 79, 82, 86, 89, 90, 91, 104, 112, 119, 120, 121, 128, 132, 152, 158, 200];
const SCORES = [0, 1, 2, 3, 5, 99];
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].spd != null);

async function advance(page, from, dispatch, timeoutMs = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const scene = await page.evaluate(() => window.__dev.scene());
    if (scene !== from) return scene;
    await page.evaluate(dispatch);
    await sleep(400);
  }
  const scene = await page.evaluate(() => window.__dev.scene());
  if (scene === from) throw new Error(`advance stuck at '${from}' after ${timeoutMs}ms`);
  return scene;
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await sleep(300);
  await advance(page, "menu", () => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALive";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 12000 });
  await advance(page, "classsel", () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 12000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await advance(page, s, () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 12000 });
  await sleep(400);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new", protocolTimeout: 300000 });
const errors = [], reqErr = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", (r) => reqErr.push(r.url()));
  page.on("response", (r) => { if (r.status() >= 400) reqErr.push(r.status() + " " + r.url()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // ---- L1 boot LIVE + build + hooks ----
  const build = await page.evaluate(() => window.__BUILD || null);
  const verJson = await (await fetch(base + "/version.json")).json().catch(() => ({}));
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier &&
    window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest &&
    window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks swift/spawnKill/save/fp/peers; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L2 flag ON en prod (served config) ----
  const cfgSrc = await (await fetch(base + "/sim/config.js")).text().catch(() => "");
  const sBlock = cfgSrc.match(/export const SWIFT_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const st = sBlock ? sBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(st);
  const chOk = /channel:\s*"swiftFind"/.test(st);
  const paramsOk = /hiSpd:\s*120/.test(st) && /midSpd:\s*90/.test(st) && /swiftBountyCap:\s*2/.test(st) &&
    /radius:\s*300/.test(st) && /swift:\s*2/.test(st) && /brisk:\s*1/.test(st);
  ok("L2 flag ON en prod: served config SWIFT_SURGE.enabled:true + channel swiftFind + params (hiSpd120/midSpd90/swift2/brisk1/cap2/radius300)",
    enabledOn && chOk && paramsOk, `enabledOn=${enabledOn} channel=${chOk} params=${paramsOk}`);

  // ---- L3 LIVE default: VM enabled TRUE + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.swift());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "swiftFind" &&
    d0.cap === CAP && d0.tag === "" && d0.tier === 0 && d0.score === 0 && d0.charge === 0;
  ok("L3 LIVE default: __dev.swift().enabled===TRUE (flip aplicado) + gExists false (STATELESS, G.swiftBounty null) + knobs servidos (channel/cap) == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} cap=${d0.cap} tier=${d0.tier} score=${d0.score} charge=${d0.charge} tag="${d0.tag}"`);

  // ---- L4 LUT spdProbe pura spd→band/weight/tier/charge == oráculo (WORLD-INDEP) ----
  const spd = await page.evaluate((sweep) => sweep.map(s => { const p = window.__dev.swift({ spdProbe: { spd: s } }).spdProbe; return { s, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), SPD_SWEEP);
  const spdBad = spd.filter(r => r.band !== oBand(r.s) || r.weight !== oWeight(r.s) || r.tier !== oRank(oWeight(r.s)) || r.charge !== oCharge(oWeight(r.s), true));
  ok(`L4 LUT spdProbe spd→band→weight→tier→charge == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (${SPD_SWEEP.length} pts: 89/90 y 119/120 fronteras)`,
    spdBad.length === 0, spdBad.length ? JSON.stringify(spdBad.map(r => ({ s: r.s, got: [r.band, r.weight, r.tier, r.charge], exp: [oBand(r.s), oWeight(r.s), oRank(oWeight(r.s)), oCharge(oWeight(r.s), true)] }))) : `all ${SPD_SWEEP.length} match`);

  // ---- L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2 ----
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.swift({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  const capMax = Math.max(...sc.map(r => r.charge));
  ok(`L5 LUT scoreProbe score→tier→charge == oráculo oRank/oCharge(score) + sub-cap (max charge ≤ cap=${CAP}): 0→T0/0, 1→T1/1, 2/3/5/99→T2/2`,
    scBad.length === 0 && capMax <= CAP, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `capMax=${capMax} sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // ---- L6 REAL server-auth spawnSwift over EVERY ETPL type ----
  const spawn6 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.swift({ clearSwift: true });
      const r = window.__dev.swift({ spawnSwift: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSwift;
      out[t] = { spd: r.spd, weight: r.weight, valid: r.valid };
    }
    window.__dev.swift({ clearSwift: true });
    return out;
  }, { types: ALL_TYPES, Z });
  const s6bad = ALL_TYPES.filter(t => !spawn6[t].valid || spawn6[t].spd !== oSpd(t) || spawn6[t].weight !== oWeightType(t));
  ok(`L6 ★ REAL spawnSwift sobre LAS ${ALL_TYPES.length} filas de ETPL: browser swiftWeight == oWeightType(ETPL[type].spd) BASE (server-auth, flag ON)`,
    s6bad.length === 0, s6bad.length ? JSON.stringify(s6bad.map(t => ({ t, spd: oSpd(t), exp: oWeightType(t), got: spawn6[t] }))) : `all ${ALL_TYPES.length} match (bat=${spawn6.bat.weight} wolf=${spawn6.wolf.weight} revenant=${spawn6.revenant.weight} summoner=${spawn6.summoner.weight} golem=${spawn6.golem.weight})`);

  // ---- L7 ⊥#74/⊥zona/⊥CC CRUX: overrideSpd on the CLONE must NOT move the band (swiftOf reads BASE) ----
  const dec = await page.evaluate((Z) => {
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.swift({ clearSwift: true });
      const r = window.__dev.swift({ spawnSwift: { type, tx: Z.forest[0], ty: Z.forest[1], overrideSpd: ov } }).spawnSwift;
      return { base: r.spd, clone: r.eSpd, tplClone: r.tplSpd, weight: r.weight }; };
    const magmaVeloz = run("magmabrute", 79);   // base 56, affix 'Veloz' ×1.42 ≈ 79 on the clone
    const batFrozen = run("bat", 40);           // base 158, frost-slowed to 40 on the clone
    const wolfZone = run("wolf", 300);          // base 128, absurd zone/affix inflation on the clone
    window.__dev.swift({ clearSwift: true });
    return { magmaVeloz, batFrozen, wolfZone };
  }, Z);
  const decOK = dec.magmaVeloz.base === 56 && dec.magmaVeloz.clone === 79 && dec.magmaVeloz.weight === 0 &&
    dec.batFrozen.base === 158 && dec.batFrozen.clone === 40 && dec.batFrozen.weight === WSW &&
    dec.wolfZone.base === 128 && dec.wolfZone.clone === 300 && dec.wolfZone.weight === WSW;
  ok("L7 ★★ ⊥#74/⊥zona/⊥CC CRUX: overrideSpd escala el CLON (e.spd/e.tpl.spd) mimetizando afijo 'Veloz'/z.spdMul/frost — swiftOf lee BASE ETPL[type].spd ⇒ magmabrute base56 'Veloz'(clon79) SIGUE swift0; bat base158 congelado(clon40) SIGUE swift2; wolf base128 inflado(clon300) SIGUE swift2",
    decOK, JSON.stringify(dec));

  // ---- L8 ⊥ cross-axis disjointness (role #93 / bulk-size #92 / xp-WORTH / reach #84) — pure data + real weights ----
  const bat = { swift: oWeightType("bat"), size: +ETPL.bat.size, xp: +ETPL.bat.xp, arch: ETPL.bat.arch };
  const wolf = { swift: oWeightType("wolf"), size: +ETPL.wolf.size, xp: +ETPL.wolf.xp, arch: ETPL.wolf.arch };
  const summoner = { swift: oWeightType("summoner"), size: +ETPL.summoner.size, xp: +ETPL.summoner.xp, arch: ETPL.summoner.arch };
  const moose = { swift: oWeightType("moose"), size: +ETPL.moose.size, xp: +ETPL.moose.xp };
  const revenant = { swift: oWeightType("revenant"), xp: +ETPL.revenant.xp };
  const orc = { swift: oWeightType("orc"), ranged: !!ETPL.orc.ranged };
  const mage = { swift: oWeightType("mage"), ranged: !!ETPL.mage.ranged };
  const cruxOK =
    wolf.swift === 2 && summoner.swift === 0 && wolf.arch === "rusher" && summoner.arch === "summoner" &&
    bat.swift === 2 && bat.size < moose.size && moose.swift === 0 &&
    wolf.xp < summoner.xp && wolf.swift > summoner.swift && revenant.swift === 1 && revenant.xp > summoner.xp &&
    orc.swift === 0 && mage.swift === 0 && orc.ranged === false && mage.ranged === true;
  ok("L8 ★★ ⊥ CRUX cross-axis: wolf swift2/rusher vs summoner swift0/enabler OPUESTOS (⊥#93); bat sz14 swift2 vs moose sz26 swift0 (⊥#92 tamaño invertido); wolf xp12 swift2 vs summoner xp34 swift0 + revenant swift1/xp64 (⊥WORTH); orc melee swift0 + mage ranged swift0 MISMA banda mezcla alcance (⊥#84)",
    cruxOK, JSON.stringify({ bat, wolf, summoner, moose, revenant, orc, mage }));

  // ---- L9 DIFFERENTIATOR ⊥ peers ----
  const diff = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true }); window.__dev.role({ enabled: true }); window.__dev.zonetier({ enabled: true });
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.swift();
    const peers = {
      role: window.__dev.role().score,
      bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score,
      ski: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score,
      pak: window.__dev.packHarvest({ packProbe: true }).packProbe.score,
      blo: window.__dev.bloodHarvest({ woundProbe: true }).woundProbe.score,
      ctr: window.__dev.controlHarvest({ controlProbe: true }).controlProbe.score,
      int: window.__dev.interrupt({ actProbe: true }).actProbe.score,
      reach: window.__dev.longshot({ reachProbe: true }).reachProbe.score,
      head: window.__dev.heading().score,
      zone: window.__dev.zonetier({ tierProbe: true }).tierProbe.score,
    };
    window.__dev.swift({ clearSwift: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, peers };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&
    diff.peers.role === 0 && diff.peers.bulk === 0 && diff.peers.ski === 0 && diff.peers.pak === 0 &&
    diff.peers.blo === 0 && diff.peers.ctr === 0 && diff.peers.int === 0 && diff.peers.reach === 0 &&
    diff.peers.head === 0 && diff.peers.zone === 0;
  ok("L9 DIFERENCIADOR ⊥ peers: BAT (escurridiza) SANO SUELTO OCIOSO a quemarropa en PRADO ⇒ swift T2 MIENTRAS role/bulk(size)/skirmish/pack/blood/control/interrupt/reach/heading/zona = 0 (velocidad-base es eje ÚNICO)",
    diffOK, JSON.stringify(diff));

  // ---- L10 REAL GRANT (flag ON LIVE default): spawnKill drives REAL killEnemy seam ⇒ h.swiftBounty Δ == oGrant(type) ----
  const GRANT_TYPES = ["bat", "volatile", "rat", "wolf", "mudlurker", "bandit", "revenant", "summoner", "mage", "golem", "orc", "moose", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.swift().hero.swiftBounty | 0;
      window.__dev.spawnKill(t);                       // REAL spawnEnemy + killEnemy at hero pos ⇒ drives swift seam
      const after = window.__dev.swift().hero.swiftBounty | 0;
      out[t] = after - before;
    }
    window.__dev.swift({ clearSwift: true });
    // byte-neutral OFF: same escurridiza kills with flag OFF ⇒ Δ0 (dead branch), then restore ON (LIVE default)
    window.__dev.swift({ enabled: false });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const offBefore = window.__dev.swift().hero.swiftBounty | 0;
    window.__dev.spawnKill("bat"); window.__dev.spawnKill("wolf");
    const offDelta = (window.__dev.swift().hero.swiftBounty | 0) - offBefore;
    window.__dev.swift({ enabled: true }); window.__dev.swift({ clearSwift: true });
    return { out, offDelta };
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant.out[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant.out[t]));
  ok("L10 ★ REAL GRANT (flag ON LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.swiftBounty == oGrant(type) por banda (escurridiza bat/volatile/rat/wolf+2; ágil mudlurker/bandit/revenant+1; plúmbeo summoner/mage/golem/orc/moose+0; adv neutral+0); sub-cap 2; flag OFF ⇒ Δ0",
    grantBad.length === 0 && grantMax <= CAP && grant.offDelta === 0,
    grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant.out[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant.out)} max=${grantMax} offDelta=${grant.offDelta}`);

  // ---- L11 STATELESS: bounty banks via real kill, NOT in save, NOT in fp ----
  const stateless = await page.evaluate((Z) => {
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.spawnKill("bat");                     // banks swiftBounty via real kill
    const bounty = window.__dev.swift().hero.swiftBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.swift({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.swift({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.swift({ clearSwift: true });
    return { bounty, blobHasBounty: /swiftBounty|swiftFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 };
  }, Z);
  ok("L11 STATELESS: h.swiftBounty banca (>0) pero NO en save blob (swiftBounty/swiftFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido, 0 desync",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L12 0-regresión LIVE: 36 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const ARC = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE","SKIRMISH_LINE_SURGE","CONTROL_HARVEST_SURGE","BLOODHARVEST_SURGE","PACKHARVEST_SURGE","LONGSHOT_SURGE","INTERRUPT_SURGE","HEADING_SURGE","ZONETIER_SURGE","BULK_SURGE","ROLE_SURGE","SWIFT_SURGE"];
  const off = ARC.filter(n => flag(n) !== "true");
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("L12 0-regresión LIVE: 36 flags served enabled:true (35 previas #59-#93 + SWIFT_SURGE #94) + core loop fps≥55",
    off.length === 0 && ARC.length === 36 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} SWIFT=${flag("SWIFT_SURGE")} fps=${fps}`);

  // shot evidencia (bat escurridiza en prado, badge ⇶ ON)
  await page.evaluate((Z) => { window.__dev.swift({ clearSwift: true }); window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.swift({ clearSwift: true }); });

  // ---- L13 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.swift({ clearSwift: true });
    window.__dev.swift({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.swift({ spawnSwift: { type: "bat", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.swift();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.swift({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [56, 82, 89, 90, 104, 119, 120, 158].map(sp => window.__dev.swift({ spdProbe: { spd: sp } }).spdProbe.weight);
    const sp = window.__dev.swift({ swiftProbe: true }).swiftProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.swift({ clearSwift: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spScore: sp.score, spCount: sp.count,
      lut: JSON.stringify(lut), bands: JSON.stringify(bands), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  }, Z);
  const A = await readVM(page);
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("B:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("B:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();   // 2ª pág DEBE estar al frente antes de bootear (headless throttla rAF en 2º plano ⇒ boot cuelga)
  await toPlay(page2);
  const B = await readVM(page2);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const batMax = A.spScore === oWeightType("bat") && B.spScore === oWeightType("bat");
  const oracleMatch = A.score === oWeightType("bat") && A.charge === oCharge(oWeightType("bat"), true) &&
    A.bands === JSON.stringify([56, 82, 89, 90, 104, 119, 120, 158].map(oWeight));
  ok("L13 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMO bat+héroe ⇒ score/tier/charge + spScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte, Y ambos == QA oracle (sp.count ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
    conv && batMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},spScore:${A.spScore},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},spScore:${B.spScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} batMax=${batMax} oracleMatch=${oracleMatch}`);
  ok(`L13b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-swift.png") });

  ok("L0 no JS errors / 0 req-fail durante el run (ambos clientes)", errors.length === 0 && reqErr.length === 0, `err=${errors.length} reqErr=${reqErr.length}${errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""}`);

  console.log("\n" + results.join("\n"));
  console.log(`\nfp observado=${A.fpLen} (esperado ${EXPECT_FP}) · terrHash=${A.terrHash} (esperado ${EXPECT_TERRHASH}) · 2-cli fpMatch=${A.fp === B.fp} · served build=${build} · flag ON=${d0.enabled} · grants=${JSON.stringify(grant.out)}`);
} catch (e) {
  FAIL++;
  results.push("❌ harness exception — " + String(e && e.stack || e));
  console.log("\n" + results.join("\n"));
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n=== CAS-2562 QA LIVE observable (SWIFT_SURGE #94): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
