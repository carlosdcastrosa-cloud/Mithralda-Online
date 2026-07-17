// CAS-2579 — POST-FLIP QA (observable LIVE) para REMATE DE VIGÍA (SENTINEL_SURGE, EVO#97, flag ON) @ served 1504785ba734 / master 1f0d858.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO importando los knobs CEO (SENTINEL_SURGE) + templates (ETPL)
// DIRECTAMENTE de sim/config.js al nivel Node (porté el DARK cas2576 → LIVE flag ON; NO reusa el harness GE/selfverify cas2573).
// NO es byte-verify (ya hecho por CTO/CEO 2ª byte-verify LIVE 7/7) — es verificación del EFECTO REAL con el flag ENCENDIDO
// en producción, 2 clientes 0-desync. El served (gh-pages 4003a06e90aa / version.json 1504785ba734) == master HEAD 1f0d858
// (byte-verificado served game/render/sim byte-idénticos + config flip +1/-1) ⇒ sirvo el árbol local = el sitio servido.
// Además: se golpea el HOST SERVIDO REAL (carlosdcastrosa-cloud.github.io/Mithralda-Online) para version.json + config +
// rutas core HTTP 200 (task gate).
//
// EJE LIVE (⊥38): VIGILANCIA / RADIO-DE-PERCEPCIÓN (AGGRO) BASE del mob TYPE server-auth ESTÁTICO (cuán LEJOS te DETECTA
//   su TIPO de fábrica). sentinelWeight(víctima) = banda de sentinelOf(e)=ETPL[e.type].aggro (fila base inmutable):
//   aggro≥hiAggro(320) ⇒ vigía/vigilant ⇒ 2; aggro≥midAggro(250) ⇒ vigilante moderado/wary ⇒ 1; aggro<midAggro ⇒
//   despistado/oblivious ⇒ 0. Canal FRESCO sentinelFind → h.sentinelBounty (transitorio, STATELESS), sub-cap
//   sentinelBountyCap:2, badge "Remate de Vigía" (◎). Score muestreado en el TOP de killEnemy (_sentinelPre). CLAVE
//   ⊥override/⊥#74/⊥campeón/⊥hostil: lee ETPL[type].aggro BASE, NO e.tpl.aggro — makeHostile(clon→300)/campeón
//   (Math.max(base,320))/jefe(Math.max(base,340))/espíritu(→0) escalan el CLON vivo, jamás la fila base ⇒ PERCEPCIÓN
//   (base estática) ⊥ hostilidad/campeón/jefe (fracción/override dinámico). PIVOTE: REACH(range) colisiona #84 SKIRMISH.
//
// Cobertura (issue CAS-2579 — acceptance observable, flag ON):
//  L1 boot LIVE + build==version.json==1504785ba734 (AVANZÓ de #96 ec06c1f3587b) + hooks (sentinel/spawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod (SERVED HOST REAL): served config SENTINEL_SURGE.enabled:true@3355 + channel sentinelFind + params (hiAggro320/midAggro250/vigilant2/wary1/cap2/radius300)
//  L3 LIVE default: __dev.sentinel().enabled===TRUE (SIN toggle) + gExists false (STATELESS, G.sentinelBounty null) + knobs servidos == oráculos re-derivados
//  L4 LUT aggroProbe pura aggro→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (249/250, 319/320)
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2
//  L6 ★ REAL server-auth spawnSentinel sobre LAS filas de ETPL: browser sentinelWeight == oWeightType(ETPL[type].aggro) BASE
//  L7 ★★ ⊥override/⊥campeón/⊥hostil CRUX: overrideAggro escala el CLON (e.tpl.aggro) ⇒ sentinelOf lee ETPL[type].aggro BASE ⇒ orc base220 hostil(clon999) SIGUE sentinel0; mage base340 espíritu(clon10) SIGUE sentinel2; spearman base300 inflado(clon999) SIGUE sentinel1; adv neutral base0 hostil(clon300) SIGUE sentinel0
//  L8 ★★ ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role: ejes DIAMÉTRICAMENTE OPUESTOS / DISJUNTOS (data real + weight)
//  L10 ★ REAL GRANT (flag ON LIVE default): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.sentinelBounty == oGrant(type) por banda (vigía+2, moderado+1, despistado+0, adv+0); sub-cap 2; flag OFF ⇒ Δ0
//  L11 STATELESS: h.sentinelBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L12 0-regresión LIVE (SERVED HOST REAL): 39 flags served enabled:true (38 previas #59-#96 + SENTINEL_SURGE #97) + core loop fps≥55
//  L13 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + sentinelProbe MAX + LUT + worldFingerprint + terrHash), fp esperado 15920977 / terrHash 2105484439
//  L14 ★ SERVED HOST rutas core HTTP 200 (index.html/game.js/render/render.js/sim/sim.js/sim/config.js/version.json)
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2579-sentinel-live-observable-qa.mjs  [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { SENTINEL_SURGE, ETPL } from "../sim/config.js";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "1504785ba734";     // served #97 (avanzó de #96 ec06c1f3587b)
const PREV_LIVE = "ec06c1f3587b";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (SENTINEL_SURGE.hiAggro != null) ? +SENTINEL_SURGE.hiAggro : 320;
const MID = (SENTINEL_SURGE.midAggro != null) ? +SENTINEL_SURGE.midAggro : 250;
const WV = +(SENTINEL_SURGE.weights && SENTINEL_SURGE.weights.vigilant) || 0;
const WW = +(SENTINEL_SURGE.weights && SENTINEL_SURGE.weights.wary) || 0;
const TIERS = (SENTINEL_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, SENTINEL_SURGE.sentinelBountyCap | 0);
const oBand = (a) => (a >= HI ? "vigilant" : a >= MID ? "wary" : "oblivious");
const oWeight = (a) => (a >= HI ? WV : a >= MID ? WW : 0);
const oAggro = (type) => { const t = ETPL[type]; return t && t.aggro != null ? +t.aggro : 0; };
const oWeightType = (type) => oWeight(oAggro(type));
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axes re-derived independently to prove orthogonality
const toughBand = (hp) => hp >= 110 ? 2 : hp >= 46 ? 1 : 0;
const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
const bulkBand = (sz) => sz >= 24 ? 2 : sz >= 18 ? 1 : 0;
const menaceBand = (dmg) => dmg >= 22 ? 2 : dmg >= 14 ? 1 : 0;

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2579-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  const line = `${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`;
  results.push(line); console.log("[step] " + line.slice(0, 130)); };

console.log(`[QA oracle] hiAggro=${HI} midAggro=${MID} wVigilant=${WV} wWary=${WW} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${SENTINEL_SURGE.enabled} channel=${SENTINEL_SURGE.channel} radius=${SENTINEL_SURGE.radius}`);

const Z = { forest: [192, 723] };
const AGGRO_SWEEP = [0, 100, 170, 220, 230, 240, 249, 250, 251, 260, 290, 300, 319, 320, 321, 330, 340, 360, 380, 999];
const SCORES = [0, 1, 2, 3, 5, 99];
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].aggro != null);
// 39 flags del arco #59-#97: 38 previas (#59-#96) + SENTINEL_SURGE (#97). Todas deben seguir served:true.
const ARC = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE"];
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
  ok(`L14 ★ SERVED HOST (${LIVE}) rutas core HTTP 200 (${CORE_ROUTES.length}) + version.json.build==${EXPECT_BUILD} (avanzó de #96 ${PREV_LIVE})`,
    routesOK && verBuild === EXPECT_BUILD, `routes=${JSON.stringify(routeStatus)} servedBuild=${verBuild}`);

  // ---- L2 flag ON en prod (SERVED HOST config real) ----
  const cfgLiveResp = await fetchLive("/sim/config.js");
  const cfgLive = cfgLiveResp.text;
  const mBlock = cfgLive.match(/export const SENTINEL_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const mt = mBlock ? mBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(mt);
  const chOk = /channel:\s*"sentinelFind"/.test(mt);
  const paramsOk = /hiAggro:\s*320/.test(mt) && /midAggro:\s*250/.test(mt) && /sentinelBountyCap:\s*2/.test(mt) &&
    /radius:\s*300/.test(mt) && /vigilant:\s*2/.test(mt) && /wary:\s*1/.test(mt);
  ok("L2 flag ON en prod (SERVED HOST config): SENTINEL_SURGE.enabled:true + channel sentinelFind + params (hiAggro320/midAggro250/vigilant2/wary1/cap2/radius300)",
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk && window.__dev.zonetier &&
    window.__dev.heading && window.__dev.interrupt && window.__dev.longshot && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks sentinel/spawnKill/save/fp/peers; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L3 LIVE default: VM enabled TRUE (SIN toggle) + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.sentinel());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "sentinelFind" &&
    d0.cap === CAP && d0.tag === "" && d0.tier === 0 && d0.score === 0 && d0.charge === 0 &&
    d0.hiAggro === HI && d0.midAggro === MID;
  ok("L3 LIVE default: __dev.sentinel().enabled===TRUE (flip aplicado, SIN toggle) + gExists false (STATELESS, G.sentinelBounty null) + knobs servidos (channel/cap/hiAggro/midAggro) == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} cap=${d0.cap} tier=${d0.tier} score=${d0.score} charge=${d0.charge} tag="${d0.tag}" hiAggro=${d0.hiAggro} midAggro=${d0.midAggro}`);

  // ---- L4 LUT aggroProbe pura aggro→band/weight/tier/charge == oráculo (WORLD-INDEP) ----
  const agp = await page.evaluate((sweep) => sweep.map(a => { const p = window.__dev.sentinel({ aggroProbe: { aggro: a } }).aggroProbe; return { a, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), AGGRO_SWEEP);
  const agpBad = agp.filter(r => r.band !== oBand(r.a) || r.weight !== oWeight(r.a) || (r.tier != null && r.tier !== oRank(oWeight(r.a))) || (r.charge != null && r.charge !== oCharge(oWeight(r.a), true)));
  ok(`L4 LUT aggroProbe aggro→band→weight == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (${AGGRO_SWEEP.length} pts: bordes exactos 249/250 y 319/320)`,
    agpBad.length === 0, agpBad.length ? JSON.stringify(agpBad.map(r => ({ a: r.a, got: [r.band, r.weight], exp: [oBand(r.a), oWeight(r.a)] }))) : `all ${AGGRO_SWEEP.length} match`);

  // ---- L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2 ----
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.sentinel({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  const capMax = Math.max(...sc.map(r => r.charge));
  ok(`L5 LUT scoreProbe score→tier→charge == oráculo oRank/oCharge(score) + sub-cap (max charge ≤ cap=${CAP})`,
    scBad.length === 0 && capMax <= CAP, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `capMax=${capMax} sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // ---- L6 REAL server-auth spawnSentinel over EVERY ETPL aggro row ----
  const spawn6 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.sentinel({ clearSentinel: true });
      const r = window.__dev.sentinel({ spawnSentinel: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnSentinel;
      const sp = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;
      out[t] = { aggro: r.aggro, weight: r.weight, valid: r.valid, spW: sp.mobs[0] ? sp.mobs[0].weight : -1, spA: sp.mobs[0] ? sp.mobs[0].aggro : -1 };
    }
    window.__dev.sentinel({ clearSentinel: true });
    return out;
  }, { types: ALL_TYPES, Z });
  const s6bad = ALL_TYPES.filter(t => !spawn6[t].valid || spawn6[t].aggro !== oAggro(t) || spawn6[t].weight !== oWeightType(t) || spawn6[t].spW !== oWeightType(t) || spawn6[t].spA !== oAggro(t));
  ok(`L6 ★ REAL spawnSentinel sobre LAS ${ALL_TYPES.length} filas aggro de ETPL: browser sentinelWeight == oWeightType(ETPL[type].aggro) BASE (server-auth, flag ON, ≥15 requeridas)`,
    s6bad.length === 0, s6bad.length ? JSON.stringify(s6bad.map(t => ({ t, aggro: oAggro(t), exp: oWeightType(t), got: spawn6[t] }))) : `all ${ALL_TYPES.length} match (mage=${spawn6.mage.weight} golem=${spawn6.golem.weight} orc=${spawn6.orc.weight} bandit=${spawn6.bandit.weight} summoner=${spawn6.summoner.weight} adv=${spawn6.adv.weight})`);

  // ---- L7 ⊥override/⊥campeón/⊥hostil CRUX: overrideAggro on the CLONE must NOT move the band (sentinelOf reads BASE) ----
  const dec = await page.evaluate((Z) => {
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.sentinel({ clearSentinel: true });
      const r = window.__dev.sentinel({ spawnSentinel: { type, tx: Z.forest[0], ty: Z.forest[1], overrideAggro: ov } }).spawnSentinel;
      const sp = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;
      return { base: r.aggro, cloneAggro: r.tplAggro, weight: r.weight, spW: sp.mobs[0] ? sp.mobs[0].weight : -99 }; };
    const orcHostile = run("orc", 999);      // base 220, makeHostile/champion inflates clone to 999 — sentinel must stay 0
    const mageSpirit = run("mage", 10);       // base 340, spirit clone deflates to 10 — sentinel must stay 2
    const spearWary = run("spearman", 999);   // base 300, inflated clone — sentinel must stay 1
    const advHostile = run("adv", 300);       // base 0 neutral, makeHostile clone→300 — sentinel must stay 0
    window.__dev.sentinel({ clearSentinel: true });
    return { orcHostile, mageSpirit, spearWary, advHostile };
  }, Z);
  const decOK = dec.orcHostile.base === 220 && dec.orcHostile.cloneAggro === 999 && dec.orcHostile.weight === 0 && dec.orcHostile.spW === 0 &&
    dec.mageSpirit.base === 340 && dec.mageSpirit.cloneAggro === 10 && dec.mageSpirit.weight === WV && dec.mageSpirit.spW === WV &&
    dec.spearWary.base === 300 && dec.spearWary.cloneAggro === 999 && dec.spearWary.weight === WW && dec.spearWary.spW === WW &&
    dec.advHostile.base === 0 && dec.advHostile.cloneAggro === 300 && dec.advHostile.weight === 0 && dec.advHostile.spW === 0;
  ok("L7 ★★ ⊥override/⊥campeón/⊥hostil CRUX: overrideAggro escala el CLON e.tpl.aggro mimetizando makeHostile(clon300)/campeón(Math.max(base,320))/jefe(Math.max(base,340))/espíritu(0) — sentinelOf lee BASE ETPL[type].aggro ⇒ orc base220 hostil(clon999) SIGUE sentinel0; mage base340 espíritu(clon10) SIGUE sentinel2; spearman base300 inflado(clon999) SIGUE sentinel1; adv neutral base0 hostil(clon300) SIGUE sentinel0 ⇒ PERCEPCIÓN (base estática) ⊥ hostilidad/campeón/jefe (clon dinámico)",
    decOK, JSON.stringify(dec));

  // ---- L8 ⊥ cross-axis (⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role) — pure data + real weights ----
  const D = (t) => ({ sentinel: oWeightType(t), tough: toughBand(+ETPL[t].hp), menace: menaceBand(+ETPL[t].dmg), swift: swiftBand(+ETPL[t].spd), bulk: bulkBand(+ETPL[t].size), arch: ETPL[t].arch, aggro: +ETPL[t].aggro, hp: +ETPL[t].hp, dmg: +ETPL[t].dmg, spd: +ETPL[t].spd, size: +ETPL[t].size });
  const ironback = D("ironback"), mage = D("mage"), summoner = D("summoner"), orc = D("orc"), bat = D("bat"), wisp = D("wisp");
  const cruxOK =
    ironback.tough === 2 && ironback.sentinel === 0 && mage.tough === 1 && mage.sentinel === 2 &&
    summoner.menace === 0 && summoner.sentinel === 2 && orc.menace === 2 && orc.sentinel === 0 &&
    bat.swift === 2 && bat.sentinel === 0 && mage.swift === 0 && mage.sentinel === 2 &&
    wisp.bulk === 1 && wisp.sentinel === 2 && ironback.bulk === 2 && ironback.sentinel === 0 &&
    mage.arch === "caster" && summoner.arch === "summoner" && mage.sentinel === summoner.sentinel && mage.sentinel === 2;
  ok("L8 ★★ ⊥ CRUX cross-axis: ironback tough2/sentinel0 vs mage tough1/sentinel2 ORDEN OPUESTO (⊥#96); summoner menace0/sentinel2 vs orc menace2/sentinel0 OPUESTO (⊥#95); bat swift2/sentinel0 vs mage swift0/sentinel2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); wisp bulk1/sentinel2 vs ironback bulk2/sentinel0 OPUESTOS (⊥#92); mage caster sentinel2 vs summoner enabler sentinel2 mismo sentinel distinto rol (⊥#93)",
    cruxOK, JSON.stringify({ ironback, mage, summoner, orc, bat, wisp }));

  // ---- L10 REAL GRANT (flag ON LIVE default): spawnKill drives REAL killEnemy seam ⇒ Δh.sentinelBounty ----
  const GRANT_TYPES = ["mage", "summoner", "healer", "demon", "wendigo", "golem", "dragon", "wraith", "bandit", "moose", "spearman", "charger", "volatile", "revenant", "rat", "orc", "bat", "ironback", "skeleton", "wolf", "adv"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.sentinel().hero.sentinelBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives sentinel seam
      const after = window.__dev.sentinel().hero.sentinelBounty | 0;
      out[t] = after - before;
    }
    window.__dev.sentinel({ clearSentinel: true });
    // byte-neutral OFF: same vigía kills with flag OFF ⇒ Δ0 (dead branch), then restore ON (LIVE default)
    window.__dev.sentinel({ enabled: false });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const offBefore = window.__dev.sentinel().hero.sentinelBounty | 0;
    window.__dev.spawnKill("mage"); window.__dev.spawnKill("golem");
    const offDelta = (window.__dev.sentinel().hero.sentinelBounty | 0) - offBefore;
    window.__dev.sentinel({ enabled: true }); window.__dev.sentinel({ clearSentinel: true });
    return { out, offDelta };
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant.out[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant.out[t]));
  ok("L10 ★ REAL GRANT (flag ON LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.sentinelBounty == oGrant(type) por banda (vigía mage/summoner/healer/demon/wendigo/golem/dragon/wraith+2; moderado bandit/moose/spearman/charger/volatile/revenant+1; despistado rat/orc/bat/ironback/skeleton/wolf+0; adv neutral+0); sub-cap 2; flag OFF ⇒ Δ0",
    grantBad.length === 0 && grantMax <= CAP && grant.offDelta === 0,
    grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant.out[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant.out)} max=${grantMax} offDelta=${grant.offDelta}`);

  // ---- L11 STATELESS: bounty banks via real kill, NOT in save, NOT in fp ----
  const stateless = await page.evaluate((Z) => {
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.spawnKill("mage");                     // banks sentinelBounty via real kill
    const bounty = window.__dev.sentinel().hero.sentinelBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.sentinel({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.sentinel({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.sentinel({ clearSentinel: true });
    return { bounty, blobHasBounty: /sentinelBounty|sentinelFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 };
  }, Z);
  ok("L11 STATELESS: h.sentinelBounty banca (>0) pero NO en save blob (sentinelBounty/sentinelFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido, 0 desync",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L12 0-regresión LIVE (SERVED HOST config real): 39 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgLive.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const off = ARC.filter(n => flag(n) !== "true");
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("L12 0-regresión LIVE (SERVED HOST config): 39 flags served enabled:true (38 previas #59-#96 + SENTINEL_SURGE #97) + core loop fps≥55",
    off.length === 0 && ARC.length === 39 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} SENTINEL=${flag("SENTINEL_SURGE")} TOUGH=${flag("TOUGH_SURGE")} fps=${fps}`);

  // shot evidencia (mage vigía en prado, badge ◎ ON)
  await page.evaluate((Z) => { window.__dev.sentinel({ clearSentinel: true }); window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.sentinel({ clearSentinel: true }); });

  // ---- L13 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.sentinel({ clearSentinel: true });
    window.__dev.sentinel({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sentinel({ spawnSentinel: { type: "mage", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.sentinel();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.sentinel({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [0, 170, 220, 249, 250, 300, 319, 320, 340].map(a => window.__dev.sentinel({ aggroProbe: { aggro: a } }).aggroProbe.weight);
    const sp = window.__dev.sentinel({ sentinelProbe: true }).sentinelProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.sentinel({ clearSentinel: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, spScore: sp.score, spW: sp.mobs[0] ? sp.mobs[0].weight : -1, spA: sp.mobs[0] ? sp.mobs[0].aggro : -1,
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
  // NOTE: sentinelProbe.mobs[0] mirrors AMBIENT G.enemies order within radius (session-age artifact) — assert MAX spScore, not order.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.spScore === B.spScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const mageMax = A.spScore === oWeightType("mage") && B.spScore === oWeightType("mage");
  const oracleMatch = A.score === oWeightType("mage") && A.charge === oCharge(oWeightType("mage"), true) &&
    A.bands === JSON.stringify([0, 170, 220, 249, 250, 300, 319, 320, 340].map(oWeight));
  ok("L13 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMO mage+héroe ⇒ score/tier/charge + spScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte, Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
    conv && mageMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},spScore:${A.spScore},spA:${A.spA},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},spScore:${B.spScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} mageMax=${mageMax} oracleMatch=${oracleMatch}`);
  ok(`L13b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-sentinel.png") });

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
console.log(`\n=== CAS-2579 QA LIVE observable (SENTINEL_SURGE #97, 39º flag): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
