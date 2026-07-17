// CAS-2549 — POST-FLIP QA (observable LIVE) para REMATE DE MOLE (BULK_SURGE, EVO#92, flag ON) @ served c2a7ab9cf1bb / master b623e83.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO importando los knobs CEO (BULK_SURGE) + templates (ETPL)
// DIRECTAMENTE de sim/config.js al nivel Node (porté el DARK cas2547 → LIVE; NO reusa el harness GE cas2546 selfverify).
// NO es byte-verify (ya hecho por CEO 2ª byte-verify LIVE 7/7) — es verificación del EFECTO REAL con el flag ENCENDIDO
// en producción, 2 clientes 0-desync. El served (gh-pages c2a7ab9cf1bb) == master HEAD b623e83 (CEO byte-verificó
// served game/render/sim/config/index blobs == HEAD) ⇒ sirvo el árbol local = el sitio servido.
//
// EJE LIVE: bulkWeight(e) = BANDA DE TAMAÑO/HITBOX FÍSICO del mob TYPE server-auth ESTÁTICO.
//   sz = ETPL[e.type].size (BASE INMUTABLE): sz≥hiSize(24) [moose/charger/golem/dragon] ⇒ large(2);
//   sz≥midSize(18) [wolf/skeleton/orc/mage/...] ⇒ mid(1); sz<midSize [rat15/bat14/volatile16] ⇒ 0.
//   Canal FRESCO bulkFind → h.bulkBounty (transitorio, fuera del save+fingerprint), sub-cap bulkBountyCap=2, badge ⬢.
//   CLAVE ⊥#74/⊥champion: lee ETPL[type].size BASE, NO e.tpl.size — afijo A.sizeMul/campeón C.sizeMul inflan el CLON,
//   jamás la fila base ⇒ mole desacoplada por construcción. El seam de killEnemy banca bulkForage(hero,tpl,_bulkPre)
//   donde _bulkPre=bulkWeight(VÍCTIMA) muestreado en el TOP de killEnemy.
//
// Cobertura (issue CAS-2549 — acceptance observable, flag ON):
//  L1 boot LIVE + build==version.json==c2a7ab9cf1bb (AVANZÓ de #91 db02ca6bb457) + hooks (bulk/spawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod: served config BULK_SURGE.enabled:true + channel bulkFind + params (hiSize24/midSize18/large2/mid1/cap2/radius300)
//  L3 LIVE default: __dev.bulk().enabled===TRUE + gExists false (STATELESS, G.bulkBounty null) + knobs servidos == oráculos re-derivados
//  L4 LUT sizeProbe pura size→weight == oráculo re-derivado (WORLD-INDEP) en cada banda + bordes (midSize/hiSize)
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap≤2
//  L6 ★ REAL server-auth spawnBulk sobre LAS filas de ETPL: browser bulkWeight == oWeight(ETPL[type].size) BASE
//  L6b ★★ ⊥#74/⊥champion CRUX: e.tpl.size inflado a 99 (afijo/campeón) ⇒ bulkOf lee ETPL[type].size BASE ⇒ rata SIGUE 0, orco SIGUE 1
//  L7 ★★ ⊥#91 ZONE-TIER CRUX LIVE: ALCE(sz26⇒mole2) en PRADO(zone0) ⇒ bulk2/zone0; RATA(sz15⇒mole0) en ABISMO(zone2) ⇒ bulk0/zone2 (entidad vs terreno, DISJUNTOS)
//  L8 DIFERENCIADOR ⊥ peers: ALCE MELEE SANO SUELTO OCIOSO a quemarropa en PRADO ⇒ bulk T2 mientras escaramuza/manada/siega/control/interrupt/reach/embestida/zona = 0
//  L9 ★ REAL GRANT (flag ON LIVE default): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.bulkBounty == oGrant(type) por banda (moose/golem/charger+2, wolf/orc/skeleton+1, rat/bat/volatile+0, adv neutral+0); sub-cap 2; flag OFF ⇒ Δ0
//  L10 STATELESS: h.bulkBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L11 0-regresión LIVE: 34 flags served enabled:true (33 previas #59-#91 + BULK_SURGE #92) + core loop fps≥55
//  L12 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + bulkProbe + LUT + worldFingerprint), fp esperado 15920977 / terrHash 2105484439
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2549-bulk-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { BULK_SURGE, ETPL } from "../sim/config.js";

const EXPECT_BUILD = "c2a7ab9cf1bb";     // served #92 (avanzó de #91 db02ca6bb457)
const PREV_LIVE = "db02ca6bb457";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from the GE harness) ----
const HI = (BULK_SURGE.hiSize != null ? +BULK_SURGE.hiSize : 24);
const MID = (BULK_SURGE.midSize != null ? +BULK_SURGE.midSize : 18);
const WLARGE = +(BULK_SURGE.weights && BULK_SURGE.weights.large) || 2;
const WMID = +(BULK_SURGE.weights && BULK_SURGE.weights.mid) || 1;
const TIERS = (BULK_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, BULK_SURGE.bulkBountyCap | 0);
const oWeight = (sz) => (sz >= HI ? WLARGE : sz >= MID ? WMID : 0);
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const tpl = ETPL[type]; if (!on || !tpl || tpl.neutral) return 0; return oCharge(oWeight(+tpl.size || 0), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2549-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// Zone tiles (deterministic 760×908 continent — same seed ⇒ same rects ⇒ same zone every client).
const Z = { forest: [192, 723], abyss: [192, 768] };
const SIZES = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 36, 44, 50];
const SCORES = [0, 1, 2, 3, 5, 9, 100];
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t].size === "number");

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  const line = `${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`;
  results.push(line); console.log("[step] " + line.slice(0, 120)); };
const bc = (m) => console.log("[bc] " + m);

console.log(`[QA oracle] hiSize=${HI} midSize=${MID} wLarge=${WLARGE} wMid=${WMID} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${BULK_SURGE.enabled}`);

// Robust scene advance: re-dispatch a keydown until the scene leaves `from` (headless boot on a loaded
// box can drop the first synthetic key before the menu handler is wired). Polls up to ~15s per transition.
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bulk && window.__dev.zonetier && window.__dev.heading &&
    window.__dev.interrupt && window.__dev.longshot && window.__dev.packHarvest && window.__dev.bloodHarvest &&
    window.__dev.controlHarvest && window.__dev.skirmishLine && window.__dev.apex && window.__dev.scarcity &&
    window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks bulk/spawnKill/save/fp/peers; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L2 flag ON en prod (served config) ----
  const cfgSrc = await (await fetch(base + "/sim/config.js")).text().catch(() => "");
  const bBlock = cfgSrc.match(/export const BULK_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const bt = bBlock ? bBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(bt);
  const chOk = /channel:\s*"bulkFind"/.test(bt);
  const paramsOk = /hiSize:\s*24/.test(bt) && /midSize:\s*18/.test(bt) && /large:\s*2/.test(bt) &&
    /mid:\s*1/.test(bt) && /bulkBountyCap:\s*2/.test(bt) && /radius:\s*300/.test(bt);
  ok("L2 flag ON en prod: served config BULK_SURGE.enabled:true + channel bulkFind + params (hiSize24/midSize18/large2/mid1/cap2/radius300)",
    enabledOn && chOk && paramsOk, `enabledOn=${enabledOn} channel=${chOk} params=${paramsOk}`);

  // ---- L3 LIVE default: VM enabled TRUE + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.bulk());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "bulkFind" &&
    d0.hiSize === HI && d0.midSize === MID && d0.tag === "" && d0.tier === 0 && d0.score === 0 && d0.charge === 0;
  ok("L3 LIVE default: __dev.bulk().enabled===TRUE (flip aplicado) + gExists false (STATELESS, G.bulkBounty null) + knobs servidos (hiSize/midSize/channel) == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} hiSize=${d0.hiSize} midSize=${d0.midSize} tier=${d0.tier} score=${d0.score} charge=${d0.charge} tag="${d0.tag}"`);

  // ---- L4 LUT sizeProbe pura size→weight == oráculo re-derivado (WORLD-INDEP) ----
  const szBrowser = await page.evaluate((sizes) => sizes.map(sz => window.__dev.bulk({ sizeProbe: { size: sz } }).sizeProbe.weight), SIZES);
  const szExpect = SIZES.map(oWeight);
  const szOK = SIZES.every((sz, i) => szBrowser[i] === szExpect[i]);
  ok("L4 LUT sizeProbe size→weight == oráculo re-derivado oWeight(size) (WORLD-INDEP) en cada banda + bordes (midSize18/hiSize24)",
    szOK, szOK ? `all ${SIZES.length} match` : JSON.stringify(SIZES.map((sz, i) => ({ sz, got: szBrowser[i], exp: szExpect[i] })).filter((x, i) => szBrowser[i] !== szExpect[i])));

  // ---- L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2 ----
  const scBrowser = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.bulk({ scoreProbe: { score: s } }).scoreProbe; return { tier: p.tier, charge: p.charge }; }), SCORES);
  const scOK = SCORES.every((s, i) => scBrowser[i].tier === oRank(s) && scBrowser[i].charge === oCharge(s, true));
  const capMax = Math.max(...scBrowser.map(x => x.charge));
  ok("L5 LUT scoreProbe score→tier→charge == oráculo oRank/oCharge(score) + sub-cap (max charge ≤ cap=2): 0→T0/0, 1→T1/1, 2/3/5/9/100→T2/2",
    scOK && capMax <= CAP, `capMax=${capMax} cap=${CAP} ` + (scOK ? "all match" : JSON.stringify(SCORES.map((s, i) => ({ s, gotT: scBrowser[i].tier, expT: oRank(s), gotC: scBrowser[i].charge, expC: oCharge(s, true) })).filter((x, i) => scBrowser[i].tier !== oRank(x.s) || scBrowser[i].charge !== oCharge(x.s, true)))));

  // ---- L6 REAL server-auth spawnBulk over EVERY ETPL type ----
  const spawn6 = await page.evaluate((args) => {
    const { types, Z } = args;
    const out = {};
    for (const t of types) {
      window.__dev.bulk({ clearBulk: true });
      window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sb = window.__dev.bulk({ spawnBulk: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnBulk;
      const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;
      out[t] = { size: sb.size, weight: sb.weight, valid: sb.valid, bpW: bp.mobs[0] ? bp.mobs[0].weight : -1, bpType: bp.mobs[0] ? bp.mobs[0].type : "" };
    }
    window.__dev.bulk({ clearBulk: true });
    return out;
  }, { types: ALL_TYPES, Z });
  const s6bad = ALL_TYPES.filter(t => {
    const b = spawn6[t], baseSize = +ETPL[t].size || 0, expW = oWeight(baseSize);
    return !b || !b.valid || b.size !== baseSize || b.weight !== expW || b.bpW !== expW || b.bpType !== t;
  });
  ok(`L6 ★ REAL spawnBulk sobre LAS ${ALL_TYPES.length} filas de ETPL: browser bulkWeight == oWeight(ETPL[type].size) BASE (server-auth, flag ON)`,
    s6bad.length === 0, s6bad.length ? JSON.stringify(s6bad.map(t => ({ t, base: ETPL[t].size, exp: oWeight(+ETPL[t].size), got: spawn6[t] && spawn6[t].weight }))) : `all ${ALL_TYPES.length} types match base band`);

  // ---- L6b ⊥#74/⊥champion CRUX: inflate e.tpl.size → 99 ⇒ still reads BASE band ----
  const infl = await page.evaluate((Z) => {
    const rd = (type, inflate) => { window.__dev.bulk({ clearBulk: true });
      window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sb = window.__dev.bulk({ spawnBulk: { type, tx: Z.forest[0], ty: Z.forest[1], inflate } }).spawnBulk;
      const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;
      return { tplSize: sb.tplSize, size: sb.size, weight: sb.weight, bpW: bp.mobs[0] ? bp.mobs[0].weight : -99 }; };
    const rat = rd("rat", 99);     // base 15 ⇒ 0 despite tpl 99
    const orc = rd("orc", 99);     // base 22 ⇒ 1 despite tpl 99 (NOT 2)
    window.__dev.bulk({ clearBulk: true });
    return { rat, orc };
  }, Z);
  const inflOK = infl.rat.tplSize === 99 && infl.rat.size === (+ETPL.rat.size) && infl.rat.weight === oWeight(+ETPL.rat.size) && infl.rat.bpW === oWeight(+ETPL.rat.size) &&
    infl.orc.tplSize === 99 && infl.orc.size === (+ETPL.orc.size) && infl.orc.weight === oWeight(+ETPL.orc.size) && infl.orc.bpW === oWeight(+ETPL.orc.size);
  ok("L6b ★★ ⊥#74/⊥champion CRUX: e.tpl.size inflado a 99 (mimetiza afijo A.sizeMul/campeón C.sizeMul) ⇒ bulkOf lee ETPL[type].size BASE ⇒ rata SIGUE 0, orco SIGUE 1 (desacople del clon)",
    inflOK, JSON.stringify(infl));

  // ---- L7 ⊥#91 ZONE-TIER CRUX LIVE: moose forest bulk2/zone0 vs rat abyss bulk0/zone2 ----
  const crux = await page.evaluate((Z) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const mooseForest = { bulk: window.__dev.bulk().score, zone: window.__dev.zonetier({ tierProbe: true }).tierProbe.score };
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.abyss[0], ty: Z.abyss[1] } });
    window.__dev.bulk({ spawnBulk: { type: "rat", tx: Z.abyss[0], ty: Z.abyss[1] } });
    const ratAbyss = { bulk: window.__dev.bulk().score, zone: window.__dev.zonetier({ tierProbe: true }).tierProbe.score };
    window.__dev.bulk({ clearBulk: true });
    return { mooseForest, ratAbyss };
  }, Z);
  const cruxOK = crux.mooseForest.bulk === oWeight(+ETPL.moose.size) && crux.mooseForest.bulk === 2 && crux.mooseForest.zone === 0 &&
    crux.ratAbyss.bulk === oWeight(+ETPL.rat.size) && crux.ratAbyss.bulk === 0 && crux.ratAbyss.zone === 2;
  ok("L7 ★★ ⊥#91 ZONE-TIER CRUX LIVE: ALCE(sz26⇒mole2) en PRADO(zone0) ⇒ bulk2/zone0; RATA(sz15⇒mole0) en ABISMO(zone2) ⇒ bulk0/zone2 (entidad vs terreno, DISJUNTOS — lee ETPL[type].size no zoneOf)",
    cruxOK, JSON.stringify(crux));

  // ---- L8 DIFFERENTIATOR ⊥ peers ----
  const diff = await page.evaluate((Z) => {
    window.__dev.bulk({ clearBulk: true });
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
    window.__dev.zonetier({ enabled: true }); const zoneScore = window.__dev.zonetier({ tierProbe: true }).tierProbe.score;
    window.__dev.bulk({ clearBulk: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, peers, zoneScore };
  }, Z);
  const diffOK = diff.score === 2 && diff.tier === 2 && diff.charge >= 1 &&
    diff.peers.ski === 0 && diff.peers.pak === 0 && diff.peers.blo === 0 && diff.peers.ctr === 0 &&
    diff.peers.int === 0 && diff.peers.reach === 0 && diff.peers.head === 0 && diff.zoneScore === 0;
  ok("L8 DIFERENCIADOR ⊥ peers: ALCE MELEE SANO SUELTO OCIOSO a quemarropa en PRADO ⇒ bulk T2 MIENTRAS escaramuza/manada/siega/control/interrupt/reach/embestida/zona = 0",
    diffOK, JSON.stringify(diff));

  // ---- L9 REAL GRANT (flag ON LIVE default): spawnKill drives REAL killEnemy seam ⇒ h.bulkBounty Δ == oGrant(type) ----
  const GRANT_TYPES = ["moose", "golem", "charger", "wolf", "orc", "skeleton", "rat", "bat", "volatile", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.bulk().hero.bulkBounty | 0;
      window.__dev.spawnKill(t);                       // REAL spawnEnemy + killEnemy at hero pos ⇒ drives bulk seam
      const after = window.__dev.bulk().hero.bulkBounty | 0;
      out[t] = after - before;
    }
    window.__dev.bulk({ clearBulk: true });
    // byte-neutral OFF: same big-mob kills with flag OFF ⇒ Δ0 (dead branch), then restore ON (LIVE default)
    window.__dev.bulk({ enabled: false });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const offBefore = window.__dev.bulk().hero.bulkBounty | 0;
    window.__dev.spawnKill("moose"); window.__dev.spawnKill("golem");
    const offDelta = (window.__dev.bulk().hero.bulkBounty | 0) - offBefore;
    window.__dev.bulk({ enabled: true }); window.__dev.bulk({ clearBulk: true });
    return { out, offDelta };
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant.out[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant.out[t]));
  ok("L9 ★ REAL GRANT (flag ON LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.bulkBounty == oGrant(type) por banda (moose/golem/charger+2, wolf/orc/skeleton+1, rat/bat/volatile+0, adv neutral+0); sub-cap 2; flag OFF ⇒ Δ0",
    grantBad.length === 0 && grantMax <= CAP && grant.offDelta === 0,
    grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant.out[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant.out)} max=${grantMax} offDelta=${grant.offDelta}`);

  // ---- L10 STATELESS: bounty banks via real kill, NOT in save, NOT in fp ----
  const stateless = await page.evaluate((Z) => {
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.spawnKill("moose");                   // banks bulkBounty via real kill
    const bounty = window.__dev.bulk().hero.bulkBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bulk({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bulk({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.bulk({ clearBulk: true });
    return { bounty, blobHasBounty: /bulkBounty|bulkFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 };
  }, Z);
  ok("L10 STATELESS: h.bulkBounty banca (>0) pero NO en save blob (bulkBounty/bulkFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido, 0 desync",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L11 0-regresión LIVE: 34 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const ARC = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE","SKIRMISH_LINE_SURGE","CONTROL_HARVEST_SURGE","BLOODHARVEST_SURGE","PACKHARVEST_SURGE","LONGSHOT_SURGE","INTERRUPT_SURGE","HEADING_SURGE","ZONETIER_SURGE","BULK_SURGE"];
  const off = ARC.filter(n => flag(n) !== "true");
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("L11 0-regresión LIVE: 34 flags served enabled:true (33 previas #59-#91 + BULK_SURGE #92) + core loop fps≥55",
    off.length === 0 && ARC.length === 34 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} BULK=${flag("BULK_SURGE")} fps=${fps}`);

  // shot evidencia (mob voluminoso en prado, badge ⬢ ON)
  await page.evaluate((Z) => { window.__dev.bulk({ clearBulk: true }); window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.bulk({ clearBulk: true }); });

  // ---- L12 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.bulk({ clearBulk: true });
    window.__dev.bulk({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.bulk({ spawnBulk: { type: "moose", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.bulk();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.bulk({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const sizes = [14, 15, 18, 22, 24, 26, 36].map(sz => window.__dev.bulk({ sizeProbe: { size: sz } }).sizeProbe.weight);
    const bp = window.__dev.bulk({ bulkProbe: true }).bulkProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.bulk({ clearBulk: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, bpScore: bp.score, bpCount: bp.count,
      lut: JSON.stringify(lut), sizes: JSON.stringify(sizes), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
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
  // NOTE: bp.count mirrors the AMBIENT G.enemies within radius, which drift by session-age (page A booted first) —
  // a session-age artifact, NOT a product desync. The server-auth signal is bpScore (MAX weight) + score/tier/charge
  // + pure LUTs + worldFingerprint — all deterministic. We assert THOSE.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.bpScore === B.bpScore &&
    A.lut === B.lut && A.sizes === B.sizes && A.fp === B.fp && A.terrHash === B.terrHash;
  const mooseMax = A.bpScore === oWeight(+ETPL.moose.size) && B.bpScore === oWeight(+ETPL.moose.size);
  const oracleMatch = A.score === oWeight(+ETPL.moose.size) && A.charge === oCharge(oWeight(+ETPL.moose.size), true) &&
    A.sizes === JSON.stringify([14, 15, 18, 22, 24, 26, 36].map(oWeight));
  ok("L12 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMO alce+héroe ⇒ score/tier/charge + bpScore(MAX) + LUT + sizes + worldFingerprint + terrHash IDÉNTICOS byte-a-byte, Y ambos == QA oracle (bp.count ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
    conv && mooseMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},bpScore:${A.bpScore},sizes:${A.sizes},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},bpScore:${B.bpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} mooseMax=${mooseMax} oracleMatch=${oracleMatch}`);
  ok(`L12b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-bulk.png") });

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
console.log(`\n=== CAS-2549 QA LIVE observable (BULK_SURGE #92): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
