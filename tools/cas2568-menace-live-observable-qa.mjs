// CAS-2568 — POST-FLIP QA (observable LIVE) para REMATE DE MATÓN (MENACE_SURGE, EVO#95, flag ON) @ served 81c189900aa9 / master 2905664.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO importando los knobs CEO (MENACE_SURGE) + templates (ETPL)
// DIRECTAMENTE de sim/config.js al nivel Node (porté el DARK cas2566 → LIVE; NO reusa el harness GE/selfverify cas2563/2565).
// NO es byte-verify (ya hecho por CTO/CEO 2ª byte-verify LIVE 7/7) — es verificación del EFECTO REAL con el flag ENCENDIDO
// en producción, 2 clientes 0-desync. El served (gh-pages 836e936e9a93 / version.json 81c189900aa9) == master HEAD 2905664
// (byte-verificado served game/render/sim byte-idénticos + config flip +1/-1) ⇒ sirvo el árbol local = el sitio servido.
// Además: se golpea el HOST SERVIDO REAL (carlosdcastrosa-cloud.github.io/Mithralda-Online) para version.json + config +
// rutas core HTTP 200 (task gate 5).
//
// EJE LIVE (⊥36): POTENCIA DE DAÑO BASE del mob TYPE server-auth ESTÁTICO. menaceWeight(víctima) = banda de
//   menaceOf(e)=ETPL[e.type].dmg (fila base inmutable): dmg≥hiDmg(22) ⇒ matón/heavy ⇒ 2; dmg≥midDmg(14) ⇒ moderado ⇒ 1;
//   dmg<midDmg ⇒ alfeñique (o dmg:0 habilitador) ⇒ 0. Canal FRESCO menaceFind → h.menaceBounty (transitorio, STATELESS),
//   sub-cap menaceBountyCap:2, badge "Amenaza" (⤬). Score muestreado en el TOP de killEnemy (_menacePre). CLAVE ⊥#74/⊥zona/
//   ⊥campeón: lee ETPL[type].dmg BASE, NO e.dmg — afijo A.dmgMul / z.dmgMul / campeón C.dmgMul escalan el CLON e.dmg VIVO,
//   jamás la fila base.
//
// Cobertura (issue CAS-2568 — acceptance observable, flag ON):
//  L1 boot LIVE + build==version.json==81c189900aa9 (AVANZÓ de #94 3d3e8be4811b) + hooks (menace/spawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod (SERVED HOST REAL): served config MENACE_SURGE.enabled:true@3312 + channel menaceFind + params (hiDmg22/midDmg14/heavy2/moderate1/cap2/radius300)
//  L3 LIVE default: __dev.menace().enabled===TRUE (SIN toggle) + gExists false (STATELESS, G.menaceBounty null) + knobs servidos == oráculos re-derivados
//  L4 LUT dmgProbe pura dmg→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (13/14, 21/22)
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2
//  L6 ★ REAL server-auth spawnMenace sobre LAS filas de ETPL: browser menaceWeight == oWeightType(ETPL[type].dmg) BASE
//  L7 ★★ ⊥#74/⊥zona/⊥campeón CRUX: overrideDmg escala el CLON (e.dmg) ⇒ menaceOf lee ETPL[type].dmg BASE ⇒ wolf base10 inflado(clon200) SIGUE menace0; orc base24 deflactado(clon0) SIGUE menace2; bat base7 inflado(clon300) SIGUE menace0
//  L8 ★★ ⊥#94 swift / ⊥#93 role / ⊥#92 bulk-size: ejes DIAMÉTRICAMENTE OPUESTOS / DISJUNTOS (data real + weight)
//  L10 ★ REAL GRANT (flag ON LIVE default): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.menaceBounty == oGrant(type) por banda (matón+2, moderado+1, alfeñique+0, adv+0); sub-cap 2; flag OFF ⇒ Δ0
//  L11 STATELESS: h.menaceBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L12 0-regresión LIVE (SERVED HOST REAL): 37 flags served enabled:true (36 previas #59-#94 + MENACE_SURGE #95) + core loop fps≥55
//  L13 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + menaceProbe MAX + LUT + worldFingerprint + terrHash), fp esperado 15920977 / terrHash 2105484439
//  L14 ★ SERVED HOST rutas core HTTP 200 (index.html/game.js/render/render.js/sim/sim.js/sim/config.js/version.json)
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2568-menace-live-observable-qa.mjs  [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { MENACE_SURGE, ETPL } from "../sim/config.js";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "81c189900aa9";     // served #95 (avanzó de #94 3d3e8be4811b)
const PREV_LIVE = "3d3e8be4811b";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (MENACE_SURGE.hiDmg != null) ? +MENACE_SURGE.hiDmg : 22;
const MID = (MENACE_SURGE.midDmg != null) ? +MENACE_SURGE.midDmg : 14;
const WHV = +(MENACE_SURGE.weights && MENACE_SURGE.weights.heavy) || 0;
const WMD = +(MENACE_SURGE.weights && MENACE_SURGE.weights.moderate) || 0;
const TIERS = (MENACE_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, MENACE_SURGE.menaceBountyCap | 0);
const oBand = (d) => (d >= HI ? "heavy" : d >= MID ? "moderate" : "feeble");
const oWeight = (d) => (d >= HI ? WHV : d >= MID ? WMD : 0);
const oDmg = (type) => { const t = ETPL[type]; return t && t.dmg != null ? +t.dmg : 0; };
const oWeightType = (type) => oWeight(oDmg(type));
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2568-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  const line = `${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`;
  results.push(line); console.log("[step] " + line.slice(0, 130)); };

console.log(`[QA oracle] hiDmg=${HI} midDmg=${MID} wHeavy=${WHV} wModerate=${WMD} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${MENACE_SURGE.enabled} channel=${MENACE_SURGE.channel}`);

const Z = { forest: [192, 723] };
const DMG_SWEEP = [0, 6, 7, 10, 13, 14, 15, 16, 18, 21, 22, 23, 24, 26, 30, 34, 38];
const SCORES = [0, 1, 2, 3, 5, 99];
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].dmg != null);
// 37 flags del arco #59-#95: 36 previas (#59-#94) + MENACE_SURGE (#95). Todas deben seguir served:true.
const ARC = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE"];
const CORE_ROUTES = ["/index.html", "/game.js", "/render/render.js", "/sim/sim.js", "/sim/config.js", "/version.json"];

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

// ---- SERVED HOST fetch (real gh-pages) with cache-buster ----
async function fetchLive(path) {
  const url = LIVE + path + (path.includes("?") ? "&" : "?") + "t=" + (99999 + PASS + FAIL);
  try { const r = await fetch(url); return { status: r.status, text: r.ok ? await r.text() : "" }; }
  catch (e) { return { status: -1, text: "", err: String(e) }; }
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new", protocolTimeout: 300000 });
const errors = [], reqErr = [];
try {
  // ---- L14 SERVED HOST core routes HTTP 200 (real gh-pages) + served version.json ----
  const routeStatus = {};
  for (const r of CORE_ROUTES) routeStatus[r] = (await fetchLive(r)).status;
  const routesOK = CORE_ROUTES.every(r => routeStatus[r] === 200);
  const verLive = await fetchLive("/version.json");
  let verBuild = "?"; try { verBuild = JSON.parse(verLive.text).build; } catch (e) {}
  ok(`L14 ★ SERVED HOST (${LIVE}) rutas core HTTP 200 (${CORE_ROUTES.length}) + version.json.build==${EXPECT_BUILD} (avanzó de #94 ${PREV_LIVE})`,
    routesOK && verBuild === EXPECT_BUILD, `routes=${JSON.stringify(routeStatus)} servedBuild=${verBuild}`);

  // ---- L2 flag ON en prod (SERVED HOST config real) ----
  const cfgLiveResp = await fetchLive("/sim/config.js");
  const cfgLive = cfgLiveResp.text;
  const mBlock = cfgLive.match(/export const MENACE_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const mt = mBlock ? mBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(mt);
  const chOk = /channel:\s*"menaceFind"/.test(mt);
  const paramsOk = /hiDmg:\s*22/.test(mt) && /midDmg:\s*14/.test(mt) && /menaceBountyCap:\s*2/.test(mt) &&
    /radius:\s*300/.test(mt) && /heavy:\s*2/.test(mt) && /moderate:\s*1/.test(mt);
  ok("L2 flag ON en prod (SERVED HOST config): MENACE_SURGE.enabled:true + channel menaceFind + params (hiDmg22/midDmg14/heavy2/moderate1/cap2/radius300)",
    enabledOn && chOk && paramsOk, `enabledOn=${enabledOn} channel=${chOk} params=${paramsOk} blockFound=${!!mBlock}`);

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("requestfailed", (r) => reqErr.push(r.url()));
  page.on("response", (r) => { if (r.status() >= 400) reqErr.push(r.status() + " " + r.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // ---- L1 boot LIVE + build + hooks ----
  const build = await page.evaluate(() => window.__BUILD || null);
  const verJson = await (await fetch(base + "/version.json")).json().catch(() => ({}));
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier &&
    window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks menace/spawnKill/save/fp/peers; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L3 LIVE default: VM enabled TRUE (SIN toggle) + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.menace());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "menaceFind" &&
    d0.cap === CAP && d0.tag === "" && d0.tier === 0 && d0.score === 0 && d0.charge === 0 &&
    d0.hiDmg === HI && d0.midDmg === MID;
  ok("L3 LIVE default: __dev.menace().enabled===TRUE (flip aplicado, SIN toggle) + gExists false (STATELESS, G.menaceBounty null) + knobs servidos (channel/cap/hiDmg/midDmg) == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} cap=${d0.cap} tier=${d0.tier} score=${d0.score} charge=${d0.charge} tag="${d0.tag}" hiDmg=${d0.hiDmg} midDmg=${d0.midDmg}`);

  // ---- L4 LUT dmgProbe pura dmg→band/weight/tier/charge == oráculo (WORLD-INDEP) ----
  const dp = await page.evaluate((sweep) => sweep.map(d => { const p = window.__dev.menace({ dmgProbe: { dmg: d } }).dmgProbe; return { d, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), DMG_SWEEP);
  const dpBad = dp.filter(r => r.band !== oBand(r.d) || r.weight !== oWeight(r.d) || (r.tier != null && r.tier !== oRank(oWeight(r.d))) || (r.charge != null && r.charge !== oCharge(oWeight(r.d), true)));
  ok(`L4 LUT dmgProbe dmg→band→weight == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (${DMG_SWEEP.length} pts: bordes exactos 13/14 y 21/22)`,
    dpBad.length === 0, dpBad.length ? JSON.stringify(dpBad.map(r => ({ d: r.d, got: [r.band, r.weight], exp: [oBand(r.d), oWeight(r.d)] }))) : `all ${DMG_SWEEP.length} match`);

  // ---- L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2 ----
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.menace({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  const capMax = Math.max(...sc.map(r => r.charge));
  ok(`L5 LUT scoreProbe score→tier→charge == oráculo oRank/oCharge(score) + sub-cap (max charge ≤ cap=${CAP})`,
    scBad.length === 0 && capMax <= CAP, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `capMax=${capMax} sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // ---- L6 REAL server-auth spawnMenace over EVERY ETPL dmg row ----
  const spawn6 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.menace({ clearMenace: true });
      const r = window.__dev.menace({ spawnMenace: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnMenace;
      const mp = window.__dev.menace({ menaceProbe: true }).menaceProbe;
      out[t] = { dmg: r.dmg, weight: r.weight, valid: r.valid, mpW: mp.mobs[0] ? mp.mobs[0].weight : -1, mpDmg: mp.mobs[0] ? mp.mobs[0].dmg : -1 };
    }
    window.__dev.menace({ clearMenace: true });
    return out;
  }, { types: ALL_TYPES, Z });
  const s6bad = ALL_TYPES.filter(t => !spawn6[t].valid || spawn6[t].dmg !== oDmg(t) || spawn6[t].weight !== oWeightType(t) || spawn6[t].mpW !== oWeightType(t) || spawn6[t].mpDmg !== oDmg(t));
  ok(`L6 ★ REAL spawnMenace sobre LAS ${ALL_TYPES.length} filas dmg de ETPL: browser menaceWeight == oWeightType(ETPL[type].dmg) BASE (server-auth, flag ON, ≥15 requeridas)`,
    s6bad.length === 0, s6bad.length ? JSON.stringify(s6bad.map(t => ({ t, dmg: oDmg(t), exp: oWeightType(t), got: spawn6[t] }))) : `all ${ALL_TYPES.length} match (orc=${spawn6.orc.weight} bat=${spawn6.bat.weight} summoner=${spawn6.summoner.weight} skeleton=${spawn6.skeleton.weight} moose=${spawn6.moose.weight})`);

  // ---- L7 ⊥#74/⊥zona/⊥campeón CRUX: overrideDmg on the CLONE must NOT move the band (menaceOf reads BASE) ----
  const dec = await page.evaluate((Z) => {
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.menace({ clearMenace: true });
      const r = window.__dev.menace({ spawnMenace: { type, tx: Z.forest[0], ty: Z.forest[1], overrideDmg: ov } }).spawnMenace;
      const mp = window.__dev.menace({ menaceProbe: true }).menaceProbe;
      return { base: r.dmg, clone: r.eDmg, weight: r.weight, mpW: mp.mobs[0] ? mp.mobs[0].weight : -99 }; };
    const wolfFeroz = run("wolf", 200);   // base 10, affix 'Feroz'/champion inflates clone to 200
    const orcDefl = run("orc", 0);        // base 24, clone deflated to 0
    const batZone = run("bat", 300);      // base 7, absurd zone/affix inflation on the clone
    window.__dev.menace({ clearMenace: true });
    return { wolfFeroz, orcDefl, batZone };
  }, Z);
  const decOK = dec.wolfFeroz.base === 10 && dec.wolfFeroz.clone === 200 && dec.wolfFeroz.weight === 0 && dec.wolfFeroz.mpW === 0 &&
    dec.orcDefl.base === 24 && dec.orcDefl.clone === 0 && dec.orcDefl.weight === WHV && dec.orcDefl.mpW === WHV &&
    dec.batZone.base === 7 && dec.batZone.clone === 300 && dec.batZone.weight === 0 && dec.batZone.mpW === 0;
  ok("L7 ★★ ⊥#74/⊥zona/⊥campeón CRUX: overrideDmg escala el CLON (e.dmg/e.tpl.dmg) mimetizando afijo 'Feroz'/zona/campeón — menaceOf lee BASE ETPL[type].dmg ⇒ wolf base10 inflado(clon200) SIGUE menace0; orc base24 deflactado(clon0) SIGUE menace2; bat base7 inflado(clon300) SIGUE menace0",
    decOK, JSON.stringify(dec));

  // ---- L8 ⊥ cross-axis (⊥#94 swift / ⊥#93 role / ⊥#92 bulk) — pure data + real weights ----
  const bat = { menace: oWeightType("bat"), spd: +ETPL.bat.spd, size: +ETPL.bat.size, arch: ETPL.bat.arch };
  const orc = { menace: oWeightType("orc"), spd: +ETPL.orc.spd, size: +ETPL.orc.size, arch: ETPL.orc.arch };
  const summoner = { menace: oWeightType("summoner"), spd: +ETPL.summoner.spd, size: +ETPL.summoner.size, arch: ETPL.summoner.arch };
  const volatile_ = { menace: oWeightType("volatile"), spd: +ETPL.volatile.spd, size: +ETPL.volatile.size, arch: ETPL.volatile.arch };
  const revenant = { menace: oWeightType("revenant"), spd: +ETPL.revenant.spd };
  const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
  const cruxOK =
    orc.menace === 2 && swiftBand(orc.spd) === 0 && bat.menace === 0 && swiftBand(bat.spd) === 2 &&
    summoner.menace === 0 && summoner.arch === "summoner" && orc.arch === "brute" && orc.menace === 2 &&
    volatile_.menace === 2 && volatile_.size < summoner.size && summoner.menace === 0 &&
    volatile_.menace === revenant.menace && swiftBand(volatile_.spd) !== swiftBand(revenant.spd);
  ok("L8 ★★ ⊥ CRUX cross-axis: orc menace2/swift0 vs bat menace0/swift2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); summoner enabler menace0/dmg0 vs orc brute menace2 (⊥#93); volatile sz16 menace2 vs summoner sz20 menace0 (⊥#92 tamaño invertido); volatile swift2/menace2 vs revenant swift1/menace2 (mismo menace distinto swift)",
    cruxOK, JSON.stringify({ bat, orc, summoner, volatile: volatile_, revenant }));

  // ---- L10 REAL GRANT (flag ON LIVE default): spawnKill drives REAL killEnemy seam ⇒ Δh.menaceBounty ----
  const GRANT_TYPES = ["orc", "moose", "volatile", "revenant", "charger", "demon", "skeleton", "mage", "bandit", "mudlurker", "wendigo", "wraith", "rat", "bat", "wolf", "spearman", "summoner", "healer", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.menace().hero.menaceBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives menace seam
      const after = window.__dev.menace().hero.menaceBounty | 0;
      out[t] = after - before;
    }
    window.__dev.menace({ clearMenace: true });
    // byte-neutral OFF: same matón kills with flag OFF ⇒ Δ0 (dead branch), then restore ON (LIVE default)
    window.__dev.menace({ enabled: false });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const offBefore = window.__dev.menace().hero.menaceBounty | 0;
    window.__dev.spawnKill("orc"); window.__dev.spawnKill("moose");
    const offDelta = (window.__dev.menace().hero.menaceBounty | 0) - offBefore;
    window.__dev.menace({ enabled: true }); window.__dev.menace({ clearMenace: true });
    return { out, offDelta };
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant.out[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant.out[t]));
  ok("L10 ★ REAL GRANT (flag ON LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.menaceBounty == oGrant(type) por banda (matón orc/moose/volatile/revenant/charger/demon+2; moderado skeleton/mage/bandit/mudlurker/wendigo/wraith+1; alfeñique rat/bat/wolf/spearman/summoner/healer+0; adv neutral+0); sub-cap 2; flag OFF ⇒ Δ0",
    grantBad.length === 0 && grantMax <= CAP && grant.offDelta === 0,
    grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant.out[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant.out)} max=${grantMax} offDelta=${grant.offDelta}`);

  // ---- L11 STATELESS: bounty banks via real kill, NOT in save, NOT in fp ----
  const stateless = await page.evaluate((Z) => {
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.spawnKill("orc");                     // banks menaceBounty via real kill
    const bounty = window.__dev.menace().hero.menaceBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.menace({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.menace({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.menace({ clearMenace: true });
    return { bounty, blobHasBounty: /menaceBounty|menaceFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 };
  }, Z);
  ok("L11 STATELESS: h.menaceBounty banca (>0) pero NO en save blob (menaceBounty/menaceFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido, 0 desync",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L12 0-regresión LIVE (SERVED HOST config real): 37 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgLive.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const off = ARC.filter(n => flag(n) !== "true");
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("L12 0-regresión LIVE (SERVED HOST config): 37 flags served enabled:true (36 previas #59-#94 + MENACE_SURGE #95) + core loop fps≥55",
    off.length === 0 && ARC.length === 37 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} MENACE=${flag("MENACE_SURGE")} SWIFT=${flag("SWIFT_SURGE")} fps=${fps}`);

  // shot evidencia (orc matón en prado, badge ⤬ ON)
  await page.evaluate((Z) => { window.__dev.menace({ clearMenace: true }); window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.menace({ clearMenace: true }); });

  // ---- L13 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.menace({ clearMenace: true });
    window.__dev.menace({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.menace({ spawnMenace: { type: "orc", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.menace();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.menace({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [6, 13, 14, 16, 21, 22, 24, 26].map(d => window.__dev.menace({ dmgProbe: { dmg: d } }).dmgProbe.weight);
    const mp = window.__dev.menace({ menaceProbe: true }).menaceProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.menace({ clearMenace: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, mpScore: mp.score, mpW: mp.mobs[0] ? mp.mobs[0].weight : -1, mpDmg: mp.mobs[0] ? mp.mobs[0].dmg : -1,
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
  // NOTE: menaceProbe.mobs[0] mirrors AMBIENT G.enemies order within radius (session-age artifact) — assert MAX mpScore, not order.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.mpScore === B.mpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const orcMax = A.mpScore === oWeightType("orc") && B.mpScore === oWeightType("orc");
  const oracleMatch = A.score === oWeightType("orc") && A.charge === oCharge(oWeightType("orc"), true) &&
    A.bands === JSON.stringify([6, 13, 14, 16, 21, 22, 24, 26].map(oWeight));
  ok("L13 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMO orc+héroe ⇒ score/tier/charge + mpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte, Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
    conv && orcMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},mpScore:${A.mpScore},mpDmg:${A.mpDmg},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},mpScore:${B.mpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} orcMax=${orcMax} oracleMatch=${oracleMatch}`);
  ok(`L13b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-menace.png") });

  ok("L0 no JS errors / 0 req-fail durante el run (ambos clientes)", errors.length === 0 && reqErr.length === 0, `err=${errors.length} reqErr=${reqErr.length}${errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""}`);

  console.log("\n" + results.join("\n"));
  console.log(`\nfp observado=${A.fpLen} (esperado ${EXPECT_FP}) · terrHash=${A.terrHash} (esperado ${EXPECT_TERRHASH}) · 2-cli fpMatch=${A.fp === B.fp} · served build=${verBuild} · flag ON=${d0.enabled} · grants=${JSON.stringify(grant.out)}`);
} catch (e) {
  FAIL++;
  results.push("❌ harness exception — " + String(e && e.stack || e));
  console.log("\n" + results.join("\n"));
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n=== CAS-2568 QA LIVE observable (MENACE_SURGE #95, 37º flag): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
