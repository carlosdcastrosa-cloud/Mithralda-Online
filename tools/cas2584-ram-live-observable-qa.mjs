// CAS-2584 — POST-FLIP QA (observable LIVE) para REMATE DE ARIETE (RAM_SURGE, EVO#98, flag ON) @ served 0a45234850cd / master c45719a.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO importando los knobs CEO (RAM_SURGE) + templates (ETPL)
// DIRECTAMENTE de sim/config.js al nivel Node (porté el DARK cas2581 → LIVE flag ON; NO reusa el harness GE/selfverify cas2580).
// NO es byte-verify (ya hecho por CTO/CEO 2ª byte-verify LIVE 8/8) — es verificación del EFECTO REAL con el flag ENCENDIDO
// en producción, 2 clientes 0-desync. El served (gh-pages 7df9f2bcd747 / version.json 0a45234850cd) == master HEAD c45719a
// (byte-verificado served game/render/sim byte-idénticos + config flip +1/-1) ⇒ sirvo el árbol local = el sitio servido.
// Además: se golpea el HOST SERVIDO REAL (carlosdcastrosa-cloud.github.io/Mithralda-Online) para version.json + config +
// rutas core HTTP 200 (task gate).
//
// EJE LIVE (⊥39): FUERZA DE IMPACTO / KNOCKBACK BASE del mob TYPE server-auth ESTÁTICO (cuánto te ARROLLA su TIPO de
//   fábrica al golpear). ramWeight(víctima) = banda de ramOf(e)=ETPL[e.type].knock (fila base inmutable):
//   knock≥hiKnock(200) ⇒ ariete/battering ⇒ 2; knock≥midKnock(110) ⇒ pegador firme/forceful ⇒ 1; knock<midKnock ⇒
//   leve/light ⇒ 0. Canal FRESCO ramFind → h.ramBounty (transitorio, STATELESS), sub-cap ramBountyCap:2, badge
//   "Remate de Ariete" (✸). CLAVE ⊥override/⊥#74/⊥campeón/⊥élite: lee ETPL[type].knock BASE, NO e.tpl.knock — AMBUSH.elite
//   escala el CLON (×knockMul); applyZoneScale NUNCA escala knock ⇒ IMPACTO (base estático) ⊥ élite/campeón/zona
//   (clon/escala dinámica ⊥#91). El ÚNICO lector de .knock es la FÍSICA de knockback (e.knockX+=cos*tpl.knock), jamás
//   recompensa ⇒ eje FRESCO, 0 seams de las 39 flags #59-#97.
//
// Cobertura (issue CAS-2584 — acceptance observable, flag ON, 40º flag):
//  L1 boot LIVE + build==version.json==0a45234850cd (AVANZÓ de #97 1504785ba734) + hooks (ram/spawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod (SERVED HOST REAL): served config RAM_SURGE.enabled:true + channel ramFind + params (hiKnock200/midKnock110/battering2/forceful1/cap2/radius300)
//  L3 LIVE default: __dev.ram().enabled===TRUE (SIN toggle) + gExists false (STATELESS, G.ramBounty null) + knobs servidos == oráculos re-derivados
//  L4 LUT knockProbe pura knock→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (109/110, 199/200)
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2
//  L6 ★ REAL server-auth spawnRam sobre LAS filas de ETPL: browser ramWeight == oWeightType(ETPL[type].knock) BASE
//  L7 ★★ ⊥override/⊥campeón/⊥élite CRUX: overrideKnock escala el CLON (e.tpl.knock) ⇒ ramOf lee ETPL[type].knock BASE ⇒ orc base150 élite(clon999) SIGUE ram1; charger base235 deflactado(clon10) SIGUE ram2
//  L8 ★★ ⊥#97 sentinel / ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role / ⊥#84 skirmish: ejes DIAMÉTRICAMENTE OPUESTOS / DISJUNTOS (data real + weight)
//  L10 ★ REAL GRANT (flag ON LIVE default): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.ramBounty == oGrant(type) por banda (ariete+2, firme+1, leve+0, adv+0); sub-cap 2; flag OFF ⇒ Δ0
//  L11 STATELESS: h.ramBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L12 0-regresión LIVE (SERVED HOST REAL): 40 flags served enabled:true (39 previas #59-#97 + RAM_SURGE #98) + core loop fps≥55
//  L13 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + ramProbe MAX + LUT + worldFingerprint + terrHash), fp esperado 15920977 / terrHash 2105484439
//  L14 ★ SERVED HOST rutas core HTTP 200 (index.html/game.js/render/render.js/sim/sim.js/sim/config.js/version.json)
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2584-ram-live-observable-qa.mjs  [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { RAM_SURGE, ETPL } from "../sim/config.js";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const EXPECT_BUILD = "0a45234850cd";     // served #98 (avanzó de #97 1504785ba734)
const PREV_LIVE = "1504785ba734";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (RAM_SURGE.hiKnock != null) ? +RAM_SURGE.hiKnock : 200;
const MID = (RAM_SURGE.midKnock != null) ? +RAM_SURGE.midKnock : 110;
const WB = +(RAM_SURGE.weights && RAM_SURGE.weights.battering) || 0;  // ariete
const WF = +(RAM_SURGE.weights && RAM_SURGE.weights.forceful) || 0;   // pegador firme
const TIERS = (RAM_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, RAM_SURGE.ramBountyCap | 0);
const oBand = (k) => (k >= HI ? "battering" : k >= MID ? "forceful" : "light");
const oWeight = (k) => (k >= HI ? WB : k >= MID ? WF : 0);
const oKnock = (type) => { const t = ETPL[type]; return t && t.knock != null ? +t.knock : 0; };
const oWeightType = (type) => oWeight(oKnock(type));
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axes re-derived independently to prove orthogonality
const sentinelBand = (aggro) => aggro >= 320 ? 2 : aggro >= 250 ? 1 : 0;
const toughBand = (hp) => hp >= 110 ? 2 : hp >= 46 ? 1 : 0;
const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
const bulkBand = (sz) => sz >= 24 ? 2 : sz >= 18 ? 1 : 0;
const menaceBand = (dmg) => dmg >= 22 ? 2 : dmg >= 14 ? 1 : 0;

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2584-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  const line = `${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`;
  results.push(line); console.log("[step] " + line.slice(0, 130)); };

console.log(`[QA oracle] hiKnock=${HI} midKnock=${MID} wBattering=${WB} wForceful=${WF} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${RAM_SURGE.enabled} channel=${RAM_SURGE.channel} radius=${RAM_SURGE.radius}`);

const Z = { forest: [192, 723] };
const KNOCK_SWEEP = [0, 40, 90, 100, 109, 110, 111, 120, 150, 170, 199, 200, 201, 210, 235, 300, 999];
const SCORES = [0, 1, 2, 3, 5, 99];
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].knock != null);
// 40 flags del arco #59-#98: 39 previas (#59-#97) + RAM_SURGE (#98). Todas deben seguir served:true.
const ARC = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE"];

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
  ok(`L14 ★ SERVED HOST (${LIVE}) rutas core HTTP 200 (${CORE_ROUTES.length}) + version.json.build==${EXPECT_BUILD} (avanzó de #97 ${PREV_LIVE})`,
    routesOK && verBuild === EXPECT_BUILD, `routes=${JSON.stringify(routeStatus)} servedBuild=${verBuild}`);

  // ---- L2 flag ON en prod (SERVED HOST config real) ----
  const cfgLiveResp = await fetchLive("/sim/config.js");
  const cfgLive = cfgLiveResp.text;
  const mBlock = cfgLive.match(/export const RAM_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const mt = mBlock ? mBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(mt);
  const chOk = /channel:\s*"ramFind"/.test(mt);
  const paramsOk = /hiKnock:\s*200/.test(mt) && /midKnock:\s*110/.test(mt) && /ramBountyCap:\s*2/.test(mt) &&
    /radius:\s*300/.test(mt) && /battering:\s*2/.test(mt) && /forceful:\s*1/.test(mt);
  ok("L2 flag ON en prod (SERVED HOST config): RAM_SURGE.enabled:true + channel ramFind + params (hiKnock200/midKnock110/battering2/forceful1/cap2/radius300)",
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ram && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk &&
    window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks ram/spawnKill/save/fp/peers; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L3 LIVE default: VM enabled TRUE (SIN toggle) + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.ram());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "ramFind" &&
    d0.cap === CAP && d0.tag === "" && d0.tier === 0 && d0.score === 0 && d0.charge === 0 &&
    d0.hiKnock === HI && d0.midKnock === MID;
  ok("L3 LIVE default: __dev.ram().enabled===TRUE (flip aplicado, SIN toggle) + gExists false (STATELESS, G.ramBounty null) + knobs servidos (channel/cap/hiKnock/midKnock) == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} cap=${d0.cap} tier=${d0.tier} score=${d0.score} charge=${d0.charge} tag="${d0.tag}" hiKnock=${d0.hiKnock} midKnock=${d0.midKnock}`);

  // ---- L4 LUT knockProbe pura knock→band/weight/tier/charge == oráculo (WORLD-INDEP) ----
  const kn = await page.evaluate((sweep) => sweep.map(k => { const p = window.__dev.ram({ knockProbe: { knock: k } }).knockProbe; return { k, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), KNOCK_SWEEP);
  const knBad = kn.filter(r => r.band !== oBand(r.k) || r.weight !== oWeight(r.k) || (r.tier != null && r.tier !== oRank(oWeight(r.k))) || (r.charge != null && r.charge !== oCharge(oWeight(r.k), true)));
  ok(`L4 LUT knockProbe knock→band→weight == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (${KNOCK_SWEEP.length} pts: bordes exactos 109/110 y 199/200)`,
    knBad.length === 0, knBad.length ? JSON.stringify(knBad.map(r => ({ k: r.k, got: [r.band, r.weight], exp: [oBand(r.k), oWeight(r.k)] }))) : `all ${KNOCK_SWEEP.length} match`);

  // ---- L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2 ----
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.ram({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  const capMax = Math.max(...sc.map(r => r.charge));
  ok(`L5 LUT scoreProbe score→tier→charge == oráculo oRank/oCharge(score) + sub-cap (max charge ≤ cap=${CAP})`,
    scBad.length === 0 && capMax <= CAP, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `capMax=${capMax} sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // ---- L6 REAL server-auth spawnRam over EVERY ETPL knock row ----
  const spawn6 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.ram({ clearRam: true });
      const r = window.__dev.ram({ spawnRam: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnRam;
      const rp = window.__dev.ram({ ramProbe: true }).ramProbe;
      const mine = rp.mobs.find(m => m.type === t) || null;
      out[t] = { knock: r.knock, weight: r.weight, valid: r.valid, rpW: mine ? mine.weight : -1, rpK: mine ? mine.knock : -1 };
    }
    window.__dev.ram({ clearRam: true });
    return out;
  }, { types: ALL_TYPES, Z });
  const s6bad = ALL_TYPES.filter(t => !spawn6[t].valid || spawn6[t].knock !== oKnock(t) || spawn6[t].weight !== oWeightType(t) || spawn6[t].rpW !== oWeightType(t) || spawn6[t].rpK !== oKnock(t));
  ok(`L6 ★ REAL spawnRam sobre LAS ${ALL_TYPES.length} filas knock de ETPL: browser ramWeight == oWeightType(ETPL[type].knock) BASE (server-auth, flag ON, ≥15 requeridas)`,
    s6bad.length === 0, s6bad.length ? JSON.stringify(s6bad.map(t => ({ t, knock: oKnock(t), exp: oWeightType(t), got: spawn6[t] }))) : `all ${ALL_TYPES.length} match (charger=${spawn6.charger.weight} moose=${spawn6.moose.weight} orc=${spawn6.orc.weight} rat=${spawn6.rat.weight} golem=${spawn6.golem.weight} mage=${spawn6.mage.weight})`);

  // ---- L7 ⊥override/⊥campeón/⊥élite CRUX: overrideKnock on the CLONE must NOT move the band (ramOf reads BASE) ----
  const dec = await page.evaluate((Z) => {
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.ram({ clearRam: true });
      const r = window.__dev.ram({ spawnRam: { type, tx: Z.forest[0], ty: Z.forest[1], overrideKnock: ov } }).spawnRam;
      const rp = window.__dev.ram({ ramProbe: true }).ramProbe;
      const mine = rp.mobs.find(m => m.type === type) || null;
      return { base: r.knock, cloneKnock: r.tplKnock, weight: r.weight, rpW: mine ? mine.weight : -99 }; };
    const orcElite = run("orc", 999);        // base 150, AMBUSH.elite infla clon a 999 — ram debe seguir 1
    const chargerDeflate = run("charger", 10); // base 235, clon deflactado a 10 — ram debe seguir 2
    window.__dev.ram({ clearRam: true });
    return { orcElite, chargerDeflate };
  }, Z);
  const decOK = dec.orcElite.base === 150 && dec.orcElite.cloneKnock === 999 && dec.orcElite.weight === WF && dec.orcElite.rpW === WF &&
    dec.chargerDeflate.base === 235 && dec.chargerDeflate.cloneKnock === 10 && dec.chargerDeflate.weight === WB && dec.chargerDeflate.rpW === WB;
  ok("L7 ★★ ⊥override/⊥campeón/⊥élite CRUX: overrideKnock escala el CLON e.tpl.knock mimetizando AMBUSH.elite(round(base×knockMul))/spawn-escalado — ramOf lee BASE ETPL[type].knock ⇒ orco base150 élite(clon999) SIGUE ram1; charger base235 deflactado(clon10) SIGUE ram2 ⇒ IMPACTO (base estático) ⊥ élite/campeón (clon dinámico)",
    decOK, JSON.stringify(dec));

  // ---- L8 ⊥ cross-axis CRUX (⊥#97 sentinel / ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role / ⊥#84 skirmish) — pure data + real weights ----
  const D = (t) => ({ ram: oWeightType(t), sentinel: sentinelBand(+ETPL[t].aggro), tough: toughBand(+ETPL[t].hp), menace: menaceBand(+ETPL[t].dmg), swift: swiftBand(+ETPL[t].spd), bulk: bulkBand(+ETPL[t].size), arch: ETPL[t].arch, ranged: !!ETPL[t].ranged, knock: +ETPL[t].knock, aggro: +ETPL[t].aggro, hp: +ETPL[t].hp, dmg: +ETPL[t].dmg, spd: +ETPL[t].spd, size: +ETPL[t].size });
  const golem = D("golem"), charger = D("charger"), rat = D("rat"), bat = D("bat"), moose = D("moose"), mage = D("mage"), summoner = D("summoner");
  const cruxOK =
    golem.sentinel === 2 && golem.ram === 0 && charger.sentinel === 1 && charger.ram === 2 &&
    golem.tough === 2 && golem.ram === 0 && rat.tough === 0 && rat.ram === 1 &&
    golem.menace === 2 && golem.ram === 0 && rat.menace === 0 && rat.ram === 1 &&
    bat.swift === 2 && bat.ram === 0 && charger.swift === 0 && charger.ram === 2 &&
    golem.bulk === 2 && golem.ram === 0 && rat.bulk === 0 && rat.ram === 1 &&
    summoner.arch === "summoner" && summoner.ram === 0 && charger.arch === "charger" && charger.ram === 2 &&
    mage.ranged === true && mage.ram === 0 && moose.ranged === false && moose.ram === 2;
  ok("L8 ★★ ⊥ CRUX cross-axis: golem sentinel2/ram0 vs charger sentinel1/ram2 ORDEN OPUESTO (⊥#97); golem tough2/ram0 vs rat tough0/ram1 OPUESTO (⊥#96); golem menace2/ram0 vs rat menace0/ram1 OPUESTO (⊥#95); bat swift2/ram0 vs charger swift0/ram2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); golem bulk2/ram0 vs rat bulk0/ram1 DIAMÉTRICAMENTE OPUESTOS (⊥#92); summoner enabler/ram0 vs charger charger/ram2 (⊥#93); mage ranged/ram0 vs moose melee/ram2 (⊥#84)",
    cruxOK, JSON.stringify({ golem, charger, rat, bat, moose, mage, summoner }));

  // ---- L10 REAL GRANT (flag ON LIVE default): spawnKill drives REAL killEnemy seam ⇒ Δh.ramBounty ----
  const GRANT_TYPES = ["moose", "ironback", "magmabrute", "toadbrute", "charger", "rat", "bandit", "demon", "skeleton", "revenant", "quillback", "mudlurker", "wolf", "orc", "mage", "golem", "summoner", "healer", "bat", "dragon", "wendigo", "spearman"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.ram().hero.ramBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives ram seam
      const after = window.__dev.ram().hero.ramBounty | 0;
      out[t] = after - before;
    }
    window.__dev.ram({ clearRam: true });
    // byte-neutral OFF: same ariete kills with flag OFF ⇒ Δ0 (dead branch), then restore ON (LIVE default)
    window.__dev.ram({ enabled: false });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const offBefore = window.__dev.ram().hero.ramBounty | 0;
    window.__dev.spawnKill("charger"); window.__dev.spawnKill("moose");
    const offDelta = (window.__dev.ram().hero.ramBounty | 0) - offBefore;
    window.__dev.ram({ enabled: true }); window.__dev.ram({ clearRam: true });
    return { out, offDelta };
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant.out[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant.out[t]));
  ok("L10 ★ REAL GRANT (flag ON LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.ramBounty == oGrant(type) por banda (ariete moose/ironback/magmabrute/toadbrute/charger+2; firme rat/bandit/demon/skeleton/revenant/quillback/mudlurker/wolf/orc+1; leve mage/golem/summoner/healer/bat/dragon/wendigo/spearman+0); sub-cap 2; flag OFF ⇒ Δ0",
    grantBad.length === 0 && grantMax <= CAP && grant.offDelta === 0,
    grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant.out[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant.out)} max=${grantMax} offDelta=${grant.offDelta}`);

  // ---- L11 STATELESS: bounty banks via real kill, NOT in save, NOT in fp ----
  const stateless = await page.evaluate((Z) => {
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.spawnKill("charger");                  // banca ramBounty via kill real
    const bounty = window.__dev.ram().hero.ramBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.ram({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.ram({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.ram({ clearRam: true });
    return { bounty, blobHasBounty: /ramBounty|ramFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 };
  }, Z);
  ok("L11 STATELESS: h.ramBounty banca (>0) pero NO en save blob (ramBounty/ramFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido, 0 desync",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L12 0-regresión LIVE (SERVED HOST config real): 40 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgLive.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const off = ARC.filter(n => flag(n) !== "true");
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("L12 0-regresión LIVE (SERVED HOST config): 40 flags served enabled:true (39 previas #59-#97 + RAM_SURGE #98) + core loop fps≥55",
    off.length === 0 && ARC.length === 40 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} RAM=${flag("RAM_SURGE")} SENTINEL=${flag("SENTINEL_SURGE")} fps=${fps}`);

  // shot evidencia (charger ariete en prado, badge ✸ ON)
  await page.evaluate((Z) => { window.__dev.ram({ clearRam: true }); window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.ram({ clearRam: true }); });

  // ---- L13 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.ram({ clearRam: true });
    window.__dev.ram({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.ram({ spawnRam: { type: "charger", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.ram();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.ram({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [0, 90, 109, 110, 150, 199, 200, 235].map(k => window.__dev.ram({ knockProbe: { knock: k } }).knockProbe.weight);
    const rp = window.__dev.ram({ ramProbe: true }).ramProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.ram({ clearRam: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, rpScore: rp.score,
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
  // NOTE: ramProbe.mobs[0] refleja el orden de G.enemies AMBIENTE en radio (artefacto por edad de sesión) — se asserta rp.score MAX, no orden.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.rpScore === B.rpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const chargerMax = A.rpScore === oWeightType("charger") && B.rpScore === oWeightType("charger");
  const oracleMatch = A.score === oWeightType("charger") && A.charge === oCharge(oWeightType("charger"), true) &&
    A.bands === JSON.stringify([0, 90, 109, 110, 150, 199, 200, 235].map(oWeight));
  ok("L13 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMO charger+héroe ⇒ score/tier/charge + rpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte, Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
    conv && chargerMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},rpScore:${A.rpScore},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},rpScore:${B.rpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} chargerMax=${chargerMax} oracleMatch=${oracleMatch}`);
  ok(`L13b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-ram.png") });

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
console.log(`\n=== CAS-2584 QA LIVE observable (RAM_SURGE #98, 40º flag): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
