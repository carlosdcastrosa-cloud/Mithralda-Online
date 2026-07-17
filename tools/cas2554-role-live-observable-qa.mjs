// CAS-2554 — POST-FLIP QA (observable LIVE) para REMATE DE CABECILLA (ROLE_SURGE, EVO#93, flag ON) @ served d3a276a13dc0 / master 7cc64d7.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO importando los knobs CEO (ROLE_SURGE) + templates (ETPL)
// DIRECTAMENTE de sim/config.js al nivel Node (porté el DARK cas2552 → LIVE; NO reusa el harness GE cas2551 selfverify).
// NO es byte-verify (ya hecho por CEO 2ª byte-verify LIVE 7/7) — es verificación del EFECTO REAL con el flag ENCENDIDO
// en producción, 2 clientes 0-desync. El served (gh-pages d3a276a13dc0) == master HEAD 7cc64d7 ⇒ sirvo el árbol local = el sitio servido.
//
// EJE LIVE: roleWeight(e) = BANDA DE ROL/ARQUETIPO DE COMBATE del mob TYPE server-auth ESTÁTICO.
//   arch = ETPL[e.type].arch (BASE INMUTABLE): roleTier[arch]==="enabler" (summoner/healer, dmg:0) ⇒ 2;
//   ==="disruptor" (warlock/volatile/punisher) ⇒ 1; else (brute/charger/rusher/caster, o sin arch) ⇒ 0.
//   Canal FRESCO roleFind → h.roleBounty (transitorio, fuera del save+fingerprint), sub-cap roleBountyCap=2, badge ❖.
//   CLAVE ⊥#73/⊥champion: lee ETPL[type].arch BASE, NO e.tpl.arch — la promoción a campeón LIMPIA el CLON (arch=undefined),
//   jamás la fila base ⇒ rol desacoplado por construcción.
//
// Cobertura (issue CAS-2554 — acceptance observable, flag ON):
//  L1 boot LIVE + build==version.json==d3a276a13dc0 (AVANZÓ de #92 c2a7ab9cf1bb) + hooks (role/spawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod: served config ROLE_SURGE.enabled:true + channel roleFind + params (enabler2/disruptor1/cap2/radius300)
//  L3 LIVE default: __dev.role().enabled===TRUE + gExists false (STATELESS, G.roleBounty null) + knobs servidos == oráculos re-derivados
//  L4 LUT archProbe pura arch→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) en cada banda + no-listado→brawler
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap≤2
//  L6 ★ REAL server-auth spawnRole sobre LAS filas de ETPL: browser roleWeight == oWeightType(ETPL[type].arch) BASE
//  L6b ★★ ⊥#73/⊥champion CRUX: overrideArch clona e.tpl.arch (healer→'brute', orc→'summoner') ⇒ roleOf lee BASE ⇒ healer SIGUE 2, orco SIGUE 0
//  L7 ★★ ⊥#92 BULK CRUX LIVE: SUMMONER(enabler rol2, sz20⇒mole1) vs MOOSE(brute rol0, sz26⇒mole2) — DISJUNTOS (arch/IA vs size/físico)
//  L7b ⊥#84 CRUX: SPEARMAN(caster ranged rol0/skirmish>0) vs HEALER(enabler NO-ranged rol2/skirmish0) — OPUESTOS
//  L8 DIFERENCIADOR ⊥ peers: SUMMONER sano suelto ocioso a quemarropa en PRADO ⇒ rol T2 mientras bulk(=1 por size)/skirmish/pack/blood/control/interrupt/reach/heading/zona = 0
//  L9 ★ REAL GRANT (flag ON LIVE default): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.roleBounty == oGrant(type) por banda (summoner/healer+2, volatile/revenant/demon+1, orc/wolf/moose+0, adv neutral+0); sub-cap 2; flag OFF ⇒ Δ0
//  L10 STATELESS: h.roleBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L11 0-regresión LIVE: 35 flags served enabled:true (34 previas #59-#92 + ROLE_SURGE #93) + core loop fps≥55
//  L12 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + roleProbe + LUT + worldFingerprint), fp esperado 15920977 / terrHash 2105484439
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2554-role-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { ROLE_SURGE, ETPL } from "../sim/config.js";

const EXPECT_BUILD = "d3a276a13dc0";     // served #93 (avanzó de #92 c2a7ab9cf1bb)
const PREV_LIVE = "c2a7ab9cf1bb";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from the GE harness) ----
const LUT = ROLE_SURGE.roleTier || {};
const WEN = +(ROLE_SURGE.weights && ROLE_SURGE.weights.enabler) || 2;
const WDI = +(ROLE_SURGE.weights && ROLE_SURGE.weights.disruptor) || 1;
const TIERS = (ROLE_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, ROLE_SURGE.roleBountyCap | 0);
const oBand = (arch) => (LUT[arch] ? String(LUT[arch]) : "brawler");
const oWeightArch = (arch) => { const b = oBand(arch); return b === "enabler" ? WEN : b === "disruptor" ? WDI : 0; };
const oWeightType = (type) => { const tpl = ETPL[type]; return tpl ? oWeightArch(String(tpl.arch || "")) : 0; };
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const tpl = ETPL[type]; if (!on || !tpl || tpl.neutral) return 0; return oCharge(oWeightType(type), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2554-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const Z = { forest: [192, 723] };
// Arches to probe: every listed band + unlisted (⇒ brawler) + bogus (⇒ brawler).
const ARCHES = ["summoner", "healer", "warlock", "volatile", "punisher", "brute", "charger", "rusher", "caster", "", "__nope__"];
const SCORES = [0, 1, 2, 3, 5, 12, 100];
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && "arch" in ETPL[t]);

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  const line = `${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`;
  results.push(line); console.log("[step] " + line.slice(0, 120)); };

console.log(`[QA oracle] roleTier=${JSON.stringify(LUT)} wEnabler=${WEN} wDisruptor=${WDI} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${ROLE_SURGE.enabled}`);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.role && window.__dev.bulk && window.__dev.zonetier &&
    window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest &&
    window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks role/spawnKill/save/fp/peers; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L2 flag ON en prod (served config) ----
  const cfgSrc = await (await fetch(base + "/sim/config.js")).text().catch(() => "");
  const bBlock = cfgSrc.match(/export const ROLE_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const bt = bBlock ? bBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(bt);
  const chOk = /channel:\s*"roleFind"/.test(bt);
  const paramsOk = /enabler:\s*2/.test(bt) && /disruptor:\s*1/.test(bt) && /roleBountyCap:\s*2/.test(bt) && /radius:\s*300/.test(bt);
  ok("L2 flag ON en prod: served config ROLE_SURGE.enabled:true + channel roleFind + params (enabler2/disruptor1/cap2/radius300)",
    enabledOn && chOk && paramsOk, `enabledOn=${enabledOn} channel=${chOk} params=${paramsOk}`);

  // ---- L3 LIVE default: VM enabled TRUE + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.role());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "roleFind" &&
    d0.cap === CAP && d0.tag === "" && d0.tier === 0 && d0.score === 0 && d0.charge === 0;
  ok("L3 LIVE default: __dev.role().enabled===TRUE (flip aplicado) + gExists false (STATELESS, G.roleBounty null) + knobs servidos (channel/cap) == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} cap=${d0.cap} tier=${d0.tier} score=${d0.score} charge=${d0.charge} tag="${d0.tag}"`);

  // ---- L4 LUT archProbe pura arch→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) ----
  const arBrowser = await page.evaluate((arches) => arches.map(a => { const p = window.__dev.role({ archProbe: { arch: a } }).archProbe; return { band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), ARCHES);
  const arBad = ARCHES.filter((a, i) => {
    const b = arBrowser[i], eB = oBand(a), eW = oWeightArch(a), eT = oRank(eW), eC = oCharge(eW, true);
    return !b || b.band !== eB || b.weight !== eW || b.tier !== eT || b.charge !== eC;
  });
  ok("L4 LUT archProbe arch→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) para cada arch (listado + no-listado→brawler + bogus→brawler)",
    arBad.length === 0, arBad.length ? JSON.stringify(arBad.map(a => ({ a, got: arBrowser[ARCHES.indexOf(a)], expB: oBand(a), expW: oWeightArch(a) }))) : `all ${ARCHES.length} match`);

  // ---- L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2 ----
  const scBrowser = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.role({ scoreProbe: { score: s } }).scoreProbe; return { tier: p.tier, charge: p.charge }; }), SCORES);
  const scOK = SCORES.every((s, i) => scBrowser[i].tier === oRank(s) && scBrowser[i].charge === oCharge(s, true));
  const capMax = Math.max(...scBrowser.map(x => x.charge));
  ok("L5 LUT scoreProbe score→tier→charge == oráculo oRank/oCharge(score) + sub-cap (max charge ≤ cap=2): 0→T0/0, 1→T1/1, ≥2→T2/2",
    scOK && capMax <= CAP, `capMax=${capMax} cap=${CAP} ` + (scOK ? "all match" : JSON.stringify(SCORES.map((s, i) => ({ s, gotT: scBrowser[i].tier, expT: oRank(s), gotC: scBrowser[i].charge, expC: oCharge(s, true) })).filter((x, i) => scBrowser[i].tier !== oRank(x.s) || scBrowser[i].charge !== oCharge(x.s, true)))));

  // ---- L6 REAL server-auth spawnRole over EVERY ETPL type ----
  const spawn6 = await page.evaluate((args) => {
    const { types, Z } = args;
    const out = {};
    for (const t of types) {
      window.__dev.role({ clearRole: true });
      window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.role({ spawnRole: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnRole;
      const rp = window.__dev.role({ roleProbe: true }).roleProbe;
      out[t] = { arch: sr.arch, band: sr.band, weight: sr.weight, valid: sr.valid, rpW: (rp.mobs[0] ? rp.mobs[0].weight : -1) };
    }
    window.__dev.role({ clearRole: true });
    return out;
  }, { types: ALL_TYPES, Z });
  const s6bad = ALL_TYPES.filter(t => {
    const b = spawn6[t], expW = oWeightType(t), expArch = String(ETPL[t].arch || "");
    return !b || !b.valid || b.arch !== expArch || b.weight !== expW || b.rpW !== expW;
  });
  ok(`L6 ★ REAL spawnRole sobre LAS ${ALL_TYPES.length} filas de ETPL: browser roleWeight == oWeightType(ETPL[type].arch) BASE (server-auth, flag ON)`,
    s6bad.length === 0, s6bad.length ? JSON.stringify(s6bad.map(t => ({ t, arch: ETPL[t].arch, exp: oWeightType(t), got: spawn6[t] && spawn6[t].weight }))) : `all ${ALL_TYPES.length} types match base band`);

  // ---- L6b ⊥#73/⊥champion CRUX: overrideArch clones e.tpl.arch ⇒ roleOf still reads BASE arch ----
  const ovr = await page.evaluate((Z) => {
    const rd = (type, overrideArch) => { window.__dev.role({ clearRole: true });
      window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.role({ spawnRole: { type, tx: Z.forest[0], ty: Z.forest[1], overrideArch } }).spawnRole;
      const rp = window.__dev.role({ roleProbe: true }).roleProbe;
      return { arch: sr.arch, tplArch: sr.tplArch, band: sr.band, weight: sr.weight, rpW: (rp.mobs[0] ? rp.mobs[0].weight : -99) }; };
    const healer = rd("healer", "brute");     // champion-clean mimic: clone arch='brute' but BASE stays 'healer' ⇒ 2
    const orc = rd("orc", "summoner");         // inflate clone to 'summoner' but BASE 'brute' ⇒ still 0
    window.__dev.role({ clearRole: true });
    return { healer, orc };
  }, Z);
  const ovrOK = ovr.healer.tplArch === "brute" && ovr.healer.arch === "healer" && ovr.healer.weight === oWeightType("healer") && ovr.healer.rpW === oWeightType("healer") &&
    ovr.orc.tplArch === "summoner" && ovr.orc.arch === "brute" && ovr.orc.weight === oWeightType("orc") && ovr.orc.rpW === oWeightType("orc");
  ok("L6b ★★ ⊥#73/⊥champion CRUX: e.tpl.arch sobrescrito en el CLON (healer→'brute', orc→'summoner', mimetiza campeón sim.js:6318) ⇒ roleOf lee ETPL[type].arch BASE ⇒ healer SIGUE rol2, orco SIGUE rol0 (desacople del clon)",
    ovrOK, JSON.stringify(ovr));

  // ---- L7 ⊥#92 BULK CRUX LIVE: summoner(enabler rol2, sz20 mole1) vs moose(brute rol0, sz26 mole2) — DISJOINT ----
  const crux = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const summoner = { role: window.__dev.role().score, bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score };
    window.__dev.role({ clearRole: true });
    window.__dev.role({ spawnRole: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const moose = { role: window.__dev.role().score, bulk: window.__dev.bulk({ bulkProbe: true }).bulkProbe.score };
    window.__dev.role({ clearRole: true });
    return { summoner, moose };
  }, Z);
  const cruxOK = crux.summoner.role === oWeightType("summoner") && crux.summoner.role === 2 && crux.summoner.bulk === 1 &&
    crux.moose.role === oWeightType("moose") && crux.moose.role === 0 && crux.moose.bulk === 2;
  ok("L7 ★★ ⊥#92 BULK CRUX LIVE: SUMMONER(enabler rol2, sz20⇒mole1) vs MOOSE(brute rol0, sz26⇒mole2) — DISJUNTOS (rol lee arch/FUNCIÓN de IA, mole lee size/TAMAÑO físico)",
    cruxOK, JSON.stringify(crux));

  // ---- L7b ⊥#84 CRUX: spearman(caster ranged rol0/skirmish>0) vs healer(enabler rol2/skirmish0) ----
  const crux84 = await page.evaluate((Z) => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "spearman", tx: Z.forest[0], ty: Z.forest[1] } });
    const spearman = { role: window.__dev.role().score, skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score };
    window.__dev.role({ clearRole: true });
    window.__dev.role({ spawnRole: { type: "healer", tx: Z.forest[0], ty: Z.forest[1] } });
    const healer = { role: window.__dev.role().score, skirmish: window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe.score };
    window.__dev.role({ clearRole: true });
    return { spearman, healer };
  }, Z);
  const crux84OK = crux84.spearman.role === 0 && crux84.spearman.skirmish > 0 && crux84.healer.role === 2 && crux84.healer.skirmish === 0;
  ok("L7b ⊥#84 CRUX: SPEARMAN(caster ranged) ⇒ rol0/skirmish>0; HEALER(enabler NO-ranged) ⇒ rol2/skirmish0 — OPUESTOS (rol lee arch/FUNCIÓN, escaramuza lee ranged/ALCANCE)",
    crux84OK, JSON.stringify(crux84));

  // ---- L8 DIFFERENTIATOR ⊥ peers ----
  const diff = await page.evaluate((Z) => {
    window.__dev.bulk({ enabled: true });
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
    window.__dev.role({ clearRole: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, peers, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&
    diff.peers.bulk === 1 &&   // summoner sz20 ⇒ mole mid band 1 (NOT the role signal — a distinct axis)
    diff.peers.ski === 0 && diff.peers.pak === 0 && diff.peers.blo === 0 && diff.peers.ctr === 0 &&
    diff.peers.int === 0 && diff.peers.reach === 0 && diff.peers.head === 0 && diff.zoneScore === 0;
  ok("L8 DIFERENCIADOR ⊥ peers: SUMMONER(enabler) SANO SUELTO OCIOSO a quemarropa en PRADO ⇒ rol T2 MIENTRAS escaramuza/manada/siega/control/interrupt/reach/embestida/zona = 0 (mole=1 por tamaño, eje ⊥ NO el rol)",
    diffOK, JSON.stringify(diff));

  // ---- L9 REAL GRANT (flag ON LIVE default): spawnKill drives REAL killEnemy seam ⇒ h.roleBounty Δ == oGrant(type) ----
  const GRANT_TYPES = ["summoner", "healer", "volatile", "revenant", "demon", "orc", "wolf", "moose", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.role().hero.roleBounty | 0;
      window.__dev.spawnKill(t);                       // REAL spawnEnemy + killEnemy at hero pos ⇒ drives role seam
      const after = window.__dev.role().hero.roleBounty | 0;
      out[t] = after - before;
    }
    window.__dev.role({ clearRole: true });
    // byte-neutral OFF: same enabler kills with flag OFF ⇒ Δ0 (dead branch), then restore ON (LIVE default)
    window.__dev.role({ enabled: false });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const offBefore = window.__dev.role().hero.roleBounty | 0;
    window.__dev.spawnKill("summoner"); window.__dev.spawnKill("healer");
    const offDelta = (window.__dev.role().hero.roleBounty | 0) - offBefore;
    window.__dev.role({ enabled: true }); window.__dev.role({ clearRole: true });
    return { out, offDelta };
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant.out[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant.out[t]));
  ok("L9 ★ REAL GRANT (flag ON LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.roleBounty == oGrant(type) por banda (summoner/healer+2, volatile/revenant/demon+1, orc/wolf/moose+0, adv neutral+0); sub-cap 2; flag OFF ⇒ Δ0",
    grantBad.length === 0 && grantMax <= CAP && grant.offDelta === 0,
    grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant.out[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant.out)} max=${grantMax} offDelta=${grant.offDelta}`);

  // ---- L10 STATELESS: bounty banks via real kill, NOT in save, NOT in fp ----
  const stateless = await page.evaluate((Z) => {
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.spawnKill("summoner");                // banks roleBounty via real kill
    const bounty = window.__dev.role().hero.roleBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.role({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.role({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.role({ clearRole: true });
    return { bounty, blobHasBounty: /roleBounty|roleFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 };
  }, Z);
  ok("L10 STATELESS: h.roleBounty banca (>0) pero NO en save blob (roleBounty/roleFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido, 0 desync",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L11 0-regresión LIVE: 35 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const ARC = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE","SKIRMISH_LINE_SURGE","CONTROL_HARVEST_SURGE","BLOODHARVEST_SURGE","PACKHARVEST_SURGE","LONGSHOT_SURGE","INTERRUPT_SURGE","HEADING_SURGE","ZONETIER_SURGE","BULK_SURGE","ROLE_SURGE"];
  const off = ARC.filter(n => flag(n) !== "true");
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("L11 0-regresión LIVE: 35 flags served enabled:true (34 previas #59-#92 + ROLE_SURGE #93) + core loop fps≥55",
    off.length === 0 && ARC.length === 35 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} ROLE=${flag("ROLE_SURGE")} fps=${fps}`);

  // shot evidencia (summoner enabler en prado, badge ❖ ON)
  await page.evaluate((Z) => { window.__dev.role({ clearRole: true }); window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.role({ spawnRole: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.role({ clearRole: true }); });

  // ---- L12 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.role({ clearRole: true });
    window.__dev.role({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.role({ spawnRole: { type: "summoner", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.role();
    const lut = [0, 1, 2, 12].map(s => { const p = window.__dev.role({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const arch = ["summoner", "healer", "warlock", "volatile", "punisher", "brute", "caster", ""].map(a => window.__dev.role({ archProbe: { arch: a } }).archProbe.weight);
    const rp = window.__dev.role({ roleProbe: true }).roleProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.role({ clearRole: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, rpScore: rp.score, rpCount: rp.count,
      lut: JSON.stringify(lut), arch: JSON.stringify(arch), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
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
  // NOTE: rp.mobs[]/rpCount mirror the AMBIENT G.enemies within radius, which drift by session-age (page A booted
  // first) — a session-age artifact, NOT a product desync. The server-auth signal is rpScore (MAX weight) +
  // score/tier/charge + pure LUTs + worldFingerprint — all deterministic. We assert THOSE.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.rpScore === B.rpScore &&
    A.lut === B.lut && A.arch === B.arch && A.fp === B.fp && A.terrHash === B.terrHash;
  const summMax = A.rpScore === oWeightType("summoner") && B.rpScore === oWeightType("summoner");
  const oracleMatch = A.score === oWeightType("summoner") && A.charge === oCharge(oWeightType("summoner"), true) &&
    A.arch === JSON.stringify(["summoner", "healer", "warlock", "volatile", "punisher", "brute", "caster", ""].map(oWeightArch));
  ok("L12 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMO summoner+héroe ⇒ score/tier/charge + rpScore(MAX) + LUT + arch + worldFingerprint + terrHash IDÉNTICOS byte-a-byte, Y ambos == QA oracle (rp.mobs[] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
    conv && summMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},rpScore:${A.rpScore},arch:${A.arch},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},rpScore:${B.rpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} summMax=${summMax} oracleMatch=${oracleMatch}`);
  ok(`L12b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-role.png") });

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
console.log(`\n=== CAS-2554 QA LIVE observable (ROLE_SURGE #93): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
