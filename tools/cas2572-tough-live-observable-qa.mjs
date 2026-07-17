// CAS-2572 — POST-FLIP QA (observable LIVE) para REMATE DE COLOSO (TOUGH_SURGE, EVO#96, flag ON) @ served ec06c1f3587b / master a4e6eb9.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO importando los knobs CEO (TOUGH_SURGE) + templates (ETPL)
// DIRECTAMENTE de sim/config.js al nivel Node (porté el DARK cas2570 → LIVE flag ON; NO reusa el harness GE/selfverify cas2569).
// NO es byte-verify (ya hecho por CTO/CEO 2ª byte-verify LIVE 7/7) — es verificación del EFECTO REAL con el flag ENCENDIDO
// en producción, 2 clientes 0-desync. El served (gh-pages d18b47e94ac1 / version.json ec06c1f3587b) == master HEAD a4e6eb9
// (byte-verificado served game/render/sim byte-idénticos + config flip +1/-1) ⇒ sirvo el árbol local = el sitio servido.
// Además: se golpea el HOST SERVIDO REAL (carlosdcastrosa-cloud.github.io/Mithralda-Online) para version.json + config +
// rutas core HTTP 200 (task gate 5).
//
// EJE LIVE (⊥37): AGUANTE / MAX-HP BASE del mob TYPE server-auth ESTÁTICO. toughWeight(víctima) = banda de
//   toughOf(e)=ETPL[e.type].hp (fila base inmutable): hp≥hiHp(110) ⇒ coloso/tank ⇒ 2; hp≥midHp(46) ⇒ firme/sturdy ⇒ 1;
//   hp<midHp ⇒ frágil ⇒ 0. Canal FRESCO toughFind → h.toughBounty (transitorio, STATELESS), sub-cap toughBountyCap:2,
//   badge "Remate de Coloso" (⛨). Score muestreado en el TOP de killEnemy (_toughPre). CLAVE ⊥#86 SIEGE/⊥zona/⊥campeón:
//   lee ETPL[type].hp BASE, NO e.hp — herida e.hp / afijo A.hpMul / zona z.hpMul / campeón C.hpMul escalan el CLON vivo,
//   jamás la fila base ⇒ AGUANTE (base estático) ⊥ SIEGE (fracción dinámica e.hp/e.maxHp).
//
// Cobertura (issue CAS-2572 — acceptance observable, flag ON):
//  L1 boot LIVE + build==version.json==ec06c1f3587b (AVANZÓ de #95 81c189900aa9) + hooks (tough/spawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod (SERVED HOST REAL): served config TOUGH_SURGE.enabled:true@3334 + channel toughFind + params (hiHp110/midHp46/tank2/sturdy1/cap2/radius300)
//  L3 LIVE default: __dev.tough().enabled===TRUE (SIN toggle) + gExists false (STATELESS, G.toughBounty null) + knobs servidos == oráculos re-derivados
//  L4 LUT hpProbe pura hp→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (45/46, 109/110)
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2
//  L6 ★ REAL server-auth spawnTough sobre LAS filas de ETPL: browser toughWeight == oWeightType(ETPL[type].hp) BASE
//  L7 ★★ ⊥#86 SIEGE/⊥zona/⊥campeón CRUX: overrideHp escala el CLON (e.hp) ⇒ toughOf lee ETPL[type].hp BASE ⇒ golem base640 herido(clon5, 5%-HP wreck siege2) SIGUE tough2; rat base20 inflado(clon999) SIGUE tough0; orc base96 inflado(clon999) SIGUE tough1
//  L8 ★★ ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role: ejes DIAMÉTRICAMENTE OPUESTOS / DISJUNTOS (data real + weight)
//  L10 ★ REAL GRANT (flag ON LIVE default): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.toughBounty == oGrant(type) por banda (coloso+2, firme+1, frágil+0, adv+0); sub-cap 2; flag OFF ⇒ Δ0
//  L11 STATELESS: h.toughBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L12 0-regresión LIVE (SERVED HOST REAL): 38 flags served enabled:true (37 previas #59-#95 + TOUGH_SURGE #96) + core loop fps≥55
//  L13 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + toughProbe MAX + LUT + worldFingerprint + terrHash), fp esperado 15920977 / terrHash 2105484439
//  L14 ★ SERVED HOST rutas core HTTP 200 (index.html/game.js/render/render.js/sim/sim.js/sim/config.js/version.json)
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2572-tough-live-observable-qa.mjs  [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { TOUGH_SURGE, ETPL } from "../sim/config.js";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "ec06c1f3587b";     // served #96 (avanzó de #95 81c189900aa9)
const PREV_LIVE = "81c189900aa9";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (TOUGH_SURGE.hiHp != null) ? +TOUGH_SURGE.hiHp : 110;
const MID = (TOUGH_SURGE.midHp != null) ? +TOUGH_SURGE.midHp : 46;
const WTK = +(TOUGH_SURGE.weights && TOUGH_SURGE.weights.tank) || 0;
const WST = +(TOUGH_SURGE.weights && TOUGH_SURGE.weights.sturdy) || 0;
const TIERS = (TOUGH_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, TOUGH_SURGE.toughBountyCap | 0);
const oBand = (h) => (h >= HI ? "tank" : h >= MID ? "sturdy" : "fragile");
const oWeight = (h) => (h >= HI ? WTK : h >= MID ? WST : 0);
const oHp = (type) => { const t = ETPL[type]; return t && t.hp != null ? +t.hp : 0; };
const oWeightType = (type) => oWeight(oHp(type));
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axes re-derived independently to prove orthogonality
const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
const bulkBand = (sz) => sz >= 24 ? 2 : sz >= 18 ? 1 : 0;
const menaceBand = (dmg) => dmg >= 22 ? 2 : dmg >= 14 ? 1 : 0;

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2572-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  const line = `${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`;
  results.push(line); console.log("[step] " + line.slice(0, 130)); };

console.log(`[QA oracle] hiHp=${HI} midHp=${MID} wTank=${WTK} wSturdy=${WST} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${TOUGH_SURGE.enabled} channel=${TOUGH_SURGE.channel}`);

const Z = { forest: [192, 723] };
const HP_SWEEP = [0, 8, 16, 20, 34, 45, 46, 47, 50, 60, 96, 100, 109, 110, 111, 120, 135, 300, 640, 1020];
const SCORES = [0, 1, 2, 3, 5, 99];
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].hp != null);
// 38 flags del arco #59-#96: 37 previas (#59-#95) + TOUGH_SURGE (#96). Todas deben seguir served:true.
const ARC = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE"];
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
  ok(`L14 ★ SERVED HOST (${LIVE}) rutas core HTTP 200 (${CORE_ROUTES.length}) + version.json.build==${EXPECT_BUILD} (avanzó de #95 ${PREV_LIVE})`,
    routesOK && verBuild === EXPECT_BUILD, `routes=${JSON.stringify(routeStatus)} servedBuild=${verBuild}`);

  // ---- L2 flag ON en prod (SERVED HOST config real) ----
  const cfgLiveResp = await fetchLive("/sim/config.js");
  const cfgLive = cfgLiveResp.text;
  const mBlock = cfgLive.match(/export const TOUGH_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const mt = mBlock ? mBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(mt);
  const chOk = /channel:\s*"toughFind"/.test(mt);
  const paramsOk = /hiHp:\s*110/.test(mt) && /midHp:\s*46/.test(mt) && /toughBountyCap:\s*2/.test(mt) &&
    /radius:\s*300/.test(mt) && /tank:\s*2/.test(mt) && /sturdy:\s*1/.test(mt);
  ok("L2 flag ON en prod (SERVED HOST config): TOUGH_SURGE.enabled:true + channel toughFind + params (hiHp110/midHp46/tank2/sturdy1/cap2/radius300)",
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier &&
    window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks tough/spawnKill/save/fp/peers; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L3 LIVE default: VM enabled TRUE (SIN toggle) + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.tough());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "toughFind" &&
    d0.cap === CAP && d0.tag === "" && d0.tier === 0 && d0.score === 0 && d0.charge === 0 &&
    d0.hiHp === HI && d0.midHp === MID;
  ok("L3 LIVE default: __dev.tough().enabled===TRUE (flip aplicado, SIN toggle) + gExists false (STATELESS, G.toughBounty null) + knobs servidos (channel/cap/hiHp/midHp) == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} cap=${d0.cap} tier=${d0.tier} score=${d0.score} charge=${d0.charge} tag="${d0.tag}" hiHp=${d0.hiHp} midHp=${d0.midHp}`);

  // ---- L4 LUT hpProbe pura hp→band/weight/tier/charge == oráculo (WORLD-INDEP) ----
  const hpp = await page.evaluate((sweep) => sweep.map(h => { const p = window.__dev.tough({ hpProbe: { hp: h } }).hpProbe; return { h, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), HP_SWEEP);
  const hppBad = hpp.filter(r => r.band !== oBand(r.h) || r.weight !== oWeight(r.h) || (r.tier != null && r.tier !== oRank(oWeight(r.h))) || (r.charge != null && r.charge !== oCharge(oWeight(r.h), true)));
  ok(`L4 LUT hpProbe hp→band→weight == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (${HP_SWEEP.length} pts: bordes exactos 45/46 y 109/110)`,
    hppBad.length === 0, hppBad.length ? JSON.stringify(hppBad.map(r => ({ h: r.h, got: [r.band, r.weight], exp: [oBand(r.h), oWeight(r.h)] }))) : `all ${HP_SWEEP.length} match`);

  // ---- L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2 ----
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.tough({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  const capMax = Math.max(...sc.map(r => r.charge));
  ok(`L5 LUT scoreProbe score→tier→charge == oráculo oRank/oCharge(score) + sub-cap (max charge ≤ cap=${CAP})`,
    scBad.length === 0 && capMax <= CAP, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `capMax=${capMax} sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // ---- L6 REAL server-auth spawnTough over EVERY ETPL hp row ----
  const spawn6 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.tough({ clearTough: true });
      const r = window.__dev.tough({ spawnTough: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnTough;
      const tp = window.__dev.tough({ toughProbe: true }).toughProbe;
      out[t] = { hp: r.hp, weight: r.weight, valid: r.valid, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpHp: tp.mobs[0] ? tp.mobs[0].hp : -1 };
    }
    window.__dev.tough({ clearTough: true });
    return out;
  }, { types: ALL_TYPES, Z });
  const s6bad = ALL_TYPES.filter(t => !spawn6[t].valid || spawn6[t].hp !== oHp(t) || spawn6[t].weight !== oWeightType(t) || spawn6[t].tpW !== oWeightType(t) || spawn6[t].tpHp !== oHp(t));
  ok(`L6 ★ REAL spawnTough sobre LAS ${ALL_TYPES.length} filas hp de ETPL: browser toughWeight == oWeightType(ETPL[type].hp) BASE (server-auth, flag ON, ≥15 requeridas)`,
    s6bad.length === 0, s6bad.length ? JSON.stringify(s6bad.map(t => ({ t, hp: oHp(t), exp: oWeightType(t), got: spawn6[t] }))) : `all ${ALL_TYPES.length} match (golem=${spawn6.golem.weight} orc=${spawn6.orc.weight} rat=${spawn6.rat.weight} revenant=${spawn6.revenant.weight} summoner=${spawn6.summoner.weight})`);

  // ---- L7 ⊥#86 SIEGE/⊥zona/⊥campeón CRUX: overrideHp on the CLONE must NOT move the band (toughOf reads BASE) ----
  const dec = await page.evaluate((Z) => {
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.tough({ clearTough: true });
      const r = window.__dev.tough({ spawnTough: { type, tx: Z.forest[0], ty: Z.forest[1], overrideHp: ov } }).spawnTough;
      const tp = window.__dev.tough({ toughProbe: true }).toughProbe;
      return { base: r.hp, clone: r.eHp, weight: r.weight, tpW: tp.mobs[0] ? tp.mobs[0].weight : -99 }; };
    const golemWreck = run("golem", 5);   // base 640, wounded to 5%HP (siege2) — tough must stay 2
    const ratFull = run("rat", 999);      // base 20, affix/zone/champion inflates clone to 999 — tough must stay 0
    const orcInfl = run("orc", 999);      // base 96, inflated clone — tough must stay 1
    window.__dev.tough({ clearTough: true });
    return { golemWreck, ratFull, orcInfl };
  }, Z);
  const decOK = dec.golemWreck.base === 640 && dec.golemWreck.clone === 5 && dec.golemWreck.weight === WTK && dec.golemWreck.tpW === WTK &&
    dec.ratFull.base === 20 && dec.ratFull.clone === 999 && dec.ratFull.weight === 0 && dec.ratFull.tpW === 0 &&
    dec.orcInfl.base === 96 && dec.orcInfl.clone === 999 && dec.orcInfl.weight === WST && dec.orcInfl.tpW === WST;
  ok("L7 ★★ ⊥#86 SIEGE/⊥zona/⊥campeón CRUX: overrideHp escala el CLON (e.hp/e.maxHp/e.tpl.hp) mimetizando herida e.hp / afijo A.hpMul / zona z.hpMul / campeón C.hpMul — toughOf lee BASE ETPL[type].hp ⇒ golem base640 herido(clon5, 5%-HP wreck siege2) SIGUE tough2; rat base20 inflado(clon999) SIGUE tough0; orc base96 inflado(clon999) SIGUE tough1 ⇒ AGUANTE (base estático) ⊥ SIEGE (fracción dinámica)",
    decOK, JSON.stringify(dec));

  // ---- L8 ⊥ cross-axis (⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role) — pure data + real weights ----
  const D = (t) => ({ tough: oWeightType(t), menace: menaceBand(+ETPL[t].dmg), swift: swiftBand(+ETPL[t].spd), bulk: bulkBand(+ETPL[t].size), arch: ETPL[t].arch, hp: +ETPL[t].hp, dmg: +ETPL[t].dmg, spd: +ETPL[t].spd, size: +ETPL[t].size });
  const orc = D("orc"), wendigo = D("wendigo"), volatile_ = D("volatile"), golem = D("golem"), bat = D("bat"), revenant = D("revenant"), emberkin = D("emberkin"), summoner = D("summoner");
  const cruxOK =
    orc.tough === 1 && orc.menace === 2 && wendigo.tough === 2 && wendigo.menace === 1 &&
    volatile_.tough === 0 && volatile_.menace === 2 &&
    golem.tough === 2 && golem.swift === 0 && bat.tough === 0 && bat.swift === 2 &&
    revenant.tough === 2 && revenant.bulk === 1 && emberkin.tough === 1 && emberkin.bulk === 2 &&
    summoner.tough === 1 && summoner.arch === "summoner" && orc.arch === "brute" && orc.tough === summoner.tough;
  ok("L8 ★★ ⊥ CRUX cross-axis: orc tough1/menace2 vs wendigo tough2/menace1 ORDEN OPUESTO (⊥#95); volatile tough0/menace2 cristal-pegador; golem tough2/swift0 vs bat tough0/swift2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); revenant sz20 bulk1/tough2 vs emberkin sz24 bulk2/tough1 OPUESTOS (⊥#92); summoner enabler tough1 vs orc brute tough1 mismo tough distinto rol (⊥#93)",
    cruxOK, JSON.stringify({ orc, wendigo, volatile: volatile_, golem, bat, revenant, emberkin, summoner }));

  // ---- L10 REAL GRANT (flag ON LIVE default): spawnKill drives REAL killEnemy seam ⇒ Δh.toughBounty ----
  const GRANT_TYPES = ["golem", "dragon", "moose", "charger", "revenant", "demon", "wendigo", "ironback", "orc", "skeleton", "mage", "bandit", "summoner", "healer", "rat", "bat", "wolf", "spearman", "volatile", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.tough().hero.toughBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives tough seam
      const after = window.__dev.tough().hero.toughBounty | 0;
      out[t] = after - before;
    }
    window.__dev.tough({ clearTough: true });
    // byte-neutral OFF: same coloso kills with flag OFF ⇒ Δ0 (dead branch), then restore ON (LIVE default)
    window.__dev.tough({ enabled: false });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const offBefore = window.__dev.tough().hero.toughBounty | 0;
    window.__dev.spawnKill("golem"); window.__dev.spawnKill("revenant");
    const offDelta = (window.__dev.tough().hero.toughBounty | 0) - offBefore;
    window.__dev.tough({ enabled: true }); window.__dev.tough({ clearTough: true });
    return { out, offDelta };
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant.out[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant.out[t]));
  ok("L10 ★ REAL GRANT (flag ON LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.toughBounty == oGrant(type) por banda (coloso golem/dragon/moose/charger/revenant/demon/wendigo/ironback+2; firme orc/skeleton/mage/bandit/summoner/healer+1; frágil rat/bat/wolf/spearman/volatile+0; adv neutral+0); sub-cap 2; flag OFF ⇒ Δ0",
    grantBad.length === 0 && grantMax <= CAP && grant.offDelta === 0,
    grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant.out[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant.out)} max=${grantMax} offDelta=${grant.offDelta}`);

  // ---- L11 STATELESS: bounty banks via real kill, NOT in save, NOT in fp ----
  const stateless = await page.evaluate((Z) => {
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.spawnKill("golem");                     // banks toughBounty via real kill
    const bounty = window.__dev.tough().hero.toughBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.tough({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.tough({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.tough({ clearTough: true });
    return { bounty, blobHasBounty: /toughBounty|toughFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 };
  }, Z);
  ok("L11 STATELESS: h.toughBounty banca (>0) pero NO en save blob (toughBounty/toughFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido, 0 desync",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L12 0-regresión LIVE (SERVED HOST config real): 38 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgLive.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const off = ARC.filter(n => flag(n) !== "true");
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("L12 0-regresión LIVE (SERVED HOST config): 38 flags served enabled:true (37 previas #59-#95 + TOUGH_SURGE #96) + core loop fps≥55",
    off.length === 0 && ARC.length === 38 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} TOUGH=${flag("TOUGH_SURGE")} MENACE=${flag("MENACE_SURGE")} fps=${fps}`);

  // shot evidencia (golem coloso en prado, badge ⛨ ON)
  await page.evaluate((Z) => { window.__dev.tough({ clearTough: true }); window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.tough({ clearTough: true }); });

  // ---- L13 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.tough({ clearTough: true });
    window.__dev.tough({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.tough({ spawnTough: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.tough();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.tough({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [16, 45, 46, 60, 96, 109, 110, 640].map(h => window.__dev.tough({ hpProbe: { hp: h } }).hpProbe.weight);
    const tp = window.__dev.tough({ toughProbe: true }).toughProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.tough({ clearTough: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpHp: tp.mobs[0] ? tp.mobs[0].hp : -1,
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
  // NOTE: toughProbe.mobs[0] mirrors AMBIENT G.enemies order within radius (session-age artifact) — assert MAX tpScore, not order.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const golemMax = A.tpScore === oWeightType("golem") && B.tpScore === oWeightType("golem");
  const oracleMatch = A.score === oWeightType("golem") && A.charge === oCharge(oWeightType("golem"), true) &&
    A.bands === JSON.stringify([16, 45, 46, 60, 96, 109, 110, 640].map(oWeight));
  ok("L13 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMO golem+héroe ⇒ score/tier/charge + tpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte, Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
    conv && golemMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},tpScore:${A.tpScore},tpHp:${A.tpHp},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},tpScore:${B.tpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} golemMax=${golemMax} oracleMatch=${oracleMatch}`);
  ok(`L13b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-tough.png") });

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
console.log(`\n=== CAS-2572 QA LIVE observable (TOUGH_SURGE #96, 38º flag): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
