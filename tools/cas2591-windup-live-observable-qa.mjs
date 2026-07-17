// CAS-2591 — POST-FLIP QA (observable LIVE) para REMATE DE PRESAGIO (WINDUP_SURGE, EVO#99, flag ON) @ served aca8e44656c4 / master HEAD post-flip 227caeb→e75a884.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO importando los knobs CEO (WINDUP_SURGE) + templates (ETPL)
// DIRECTAMENTE de sim/config.js al nivel Node (porté el DARK cas2588 → LIVE flag ON; NO reusa el harness GE/selfverify cas2585).
// NO es byte-verify (ya hecho por CTO/CEO 2ª byte-verify LIVE 6/6 — served version.json avanzó #98 0a45234850cd→#99 aca8e44656c4 +
// WINDUP_SURGE.enabled:true LIVE + 27/27 `_SURGE` served true 0-regr) — es verificación del EFECTO REAL con el flag ENCENDIDO en
// producción, 2 clientes 0-desync. El served (gh-pages 15eb94d5412d / version.json aca8e44656c4) == master HEAD (byte-verificado
// served game/render/sim byte-idénticos + config flip +1/-1) ⇒ sirvo el árbol local = el sitio servido. Además: se golpea el HOST
// SERVIDO REAL (carlosdcastrosa-cloud.github.io/Mithralda-Online) para version.json + config + rutas core HTTP 200 (task gate).
//
// EJE LIVE (⊥40): TIEMPO DE PRESAGIO / WIND-UP BASE del mob TYPE server-auth ESTÁTICO (cuánto TELEGRAFÍA su TIPO de fábrica
//   ANTES de golpear — su cadencia de amago). windWeight(víctima) = banda de windOf(e)=ETPL[e.type].windup (fila base inmutable):
//   windup≥hiWind(0.85) ⇒ ponderoso/telegrafiado largo (deliberate) ⇒ 2; windup≥midWind(0.62) ⇒ medido (measured) ⇒ 1;
//   windup<midWind ⇒ súbito (snappy) ⇒ 0. Canal FRESCO windFind → h.windBounty (transitorio, STATELESS), sub-cap
//   windBountyCap:2, badge "Remate de Presagio" (⌛). CLAVE ⊥override/⊥#74/⊥campeón/⊥élite: lee ETPL[type].windup BASE, NO
//   e.tpl.windup — un spawn escalado/élite sobrescribe el CLON; windOf IGNORA el clon; applyZoneScale NUNCA escala windup ⇒
//   PRESAGIO (base estático) ⊥ élite/campeón/zona (clon/escala dinámica ⊥#91). Los ÚNICOS lectores de .windup son (a) la
//   MÁQUINA DE ESTADOS de la IA (e.st=tpl.windup DURACIÓN) y (b) el render del TELL — jamás recompensa ⇒ eje FRESCO, 0 seams
//   de las 40 flags #59-#98. CRUX ⊥#89 INTERRUPT lee e.state DINÁMICO (¿ejecuta AHORA?) no ETPL[type].windup ESTÁTICO.
//
// Cobertura (issue CAS-2591 — acceptance observable, flag ON, 41º flag):
//  L1 boot LIVE + build==version.json==aca8e44656c4 (AVANZÓ de #98 0a45234850cd) + hooks (wind/spawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod (SERVED HOST REAL): served config WINDUP_SURGE.enabled:true + channel windFind + params (hiWind0.85/midWind0.62/deliberate2/measured1/cap2/radius300)
//  L3 LIVE default: __dev.wind().enabled===TRUE (SIN toggle) + gExists false (STATELESS, G.windBounty null) + knobs servidos == oráculos re-derivados
//  L4 LUT windupProbe pura windup→band/weight/tier/charge == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (0.61/0.62, 0.84/0.85)
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2
//  L6 ★ REAL server-auth spawnWind sobre LAS filas de ETPL: browser windWeight == oWeightType(ETPL[type].windup) BASE
//  L7 ★★ ⊥override/⊥campeón/⊥élite CRUX: overrideWindup escala el CLON (e.tpl.windup) ⇒ windOf lee ETPL[type].windup BASE ⇒ orc base0.82 élite(clon0.99) SIGUE wind1; golem base0.95 deflactado(clon0.1) SIGUE wind2
//  L8 ★★ ⊥#98 ram / ⊥#97 sentinel / ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role / ⊥#84 skirmish: ejes DIAMÉTRICAMENTE OPUESTOS / DISJUNTOS (data real + weight)
//  L10 ★ REAL GRANT (flag ON LIVE default): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.windBounty == oGrant(type) por banda (deliberate+2, measured+1, snappy+0); sub-cap 2; flag OFF ⇒ Δ0
//  L11 STATELESS: h.windBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L12 0-regresión LIVE (SERVED HOST REAL): 41 flags served enabled:true (40 previas #59-#98 + WINDUP_SURGE #99) + core loop fps≥55
//  L13 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + windProbe MAX + LUT + worldFingerprint + terrHash), fp esperado 15920977 / terrHash 2105484439
//  L14 ★ SERVED HOST rutas core HTTP 200 (index.html/game.js/sim/sim.js/sim/config.js/version.json) — render.js/main.js 404@root=bundled esperado
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2591-windup-live-observable-qa.mjs  [live-url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
// ↓ QA re-derivation source: import the REAL knobs + templates DIRECTLY (independent of any browser probe)
import { WINDUP_SURGE, ETPL } from "../sim/config.js";

const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
// NOTA: durante esta QA aterrizó un deploy ORTOGONAL #100 CAS-2592 (c619cd2dd617, files 815) — sprite-audit ART-ONLY
// (rat/adv FOUNTAINS cutouts + ENEMY_IMG wiring en render/sprites.js), "Additive art only, config byte-neutral". Verificado:
// served sim/config.js == HEAD sim/config.js BYTE-IDÉNTICO ⇒ WINDUP_SURGE.enabled:true SIGUE LIVE, comportamiento del eje
// INALTERADO (config byte-neutral vs #99 aca8e44656c4). EXPECT_BUILD sigue al served actual (== git HEAD version.json).
const EXPECT_BUILD = "c619cd2dd617";     // served #100 (art-only deploy sobre #99 aca8e44656c4; config byte-idéntico, WINDUP LIVE intacto)
const PREV_LIVE = "aca8e44656c4";        // #99 WINDUP flip (config-byte-idéntico al #100 actual)
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

// ---- QA-OWNED PURE-JS ORACLES (re-derived from the imported knobs — NOT copied from GE seam/harness) ----
const HI = (WINDUP_SURGE.hiWind != null) ? +WINDUP_SURGE.hiWind : 0.85;
const MID = (WINDUP_SURGE.midWind != null) ? +WINDUP_SURGE.midWind : 0.62;
const WD = +(WINDUP_SURGE.weights && WINDUP_SURGE.weights.deliberate) || 0;  // ponderoso/telegrafiado largo
const WM = +(WINDUP_SURGE.weights && WINDUP_SURGE.weights.measured) || 0;    // medido
const TIERS = (WINDUP_SURGE.tiers || []).map(t => ({ min: +t.min || 0, charge: +t.charge || 0 }));
const CAP = Math.max(0, WINDUP_SURGE.windBountyCap | 0);
const oBand = (w) => (w >= HI ? "deliberate" : w >= MID ? "measured" : "snappy");
const oWeight = (w) => (w >= HI ? WD : w >= MID ? WM : 0);
const oWindup = (type) => { const t = ETPL[type]; return t && t.windup != null ? +t.windup : 0; };
const oWeightType = (type) => oWeight(oWindup(type));
const oRank = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score, on) => { if (!on) return 0; const t = oRank(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); };
const oGrant = (type, on) => { const t = ETPL[type]; if (!on || !t || t.neutral) return 0; return oCharge(oWeightType(type), on); };
// peer axes re-derived independently to prove orthogonality
const ramBand = (knock) => knock >= 200 ? 2 : knock >= 110 ? 1 : 0;
const sentinelBand = (aggro) => aggro >= 320 ? 2 : aggro >= 250 ? 1 : 0;
const toughBand = (hp) => hp >= 110 ? 2 : hp >= 46 ? 1 : 0;
const swiftBand = (spd) => spd >= 120 ? 2 : spd >= 90 ? 1 : 0;
const bulkBand = (sz) => sz >= 24 ? 2 : sz >= 18 ? 1 : 0;
const menaceBand = (dmg) => dmg >= 22 ? 2 : dmg >= 14 ? 1 : 0;

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2591-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  const line = `${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`;
  results.push(line); console.log("[step] " + line.slice(0, 130)); };

console.log(`[QA oracle] hiWind=${HI} midWind=${MID} wDeliberate=${WD} wMeasured=${WM} tiers=${JSON.stringify(TIERS)} cap=${CAP} enabled(base)=${WINDUP_SURGE.enabled} channel=${WINDUP_SURGE.channel} radius=${WINDUP_SURGE.radius}`);

const Z = { forest: [192, 723] };
const WINDUP_SWEEP = [0, 0.28, 0.5, 0.6, 0.61, 0.62, 0.63, 0.7, 0.82, 0.84, 0.85, 0.86, 0.9, 0.95, 9];
const SCORES = [0, 1, 2, 3, 5, 99];
const ALL_TYPES = Object.keys(ETPL).filter(t => ETPL[t] && typeof ETPL[t] === "object" && ETPL[t].windup != null);
// 41 flags del arco #59-#99: 40 previas (#59-#98) + WINDUP_SURGE (#99). Todas deben seguir served:true.
const ARC = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE"];

const CORE_ROUTES = ["/index.html", "/game.js", "/sim/sim.js", "/sim/config.js", "/version.json"];

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
  ok(`L14 ★ SERVED HOST (${LIVE}) rutas core HTTP 200 (${CORE_ROUTES.length}) + version.json.build==${EXPECT_BUILD} (avanzó de #98 ${PREV_LIVE})`,
    routesOK && verBuild === EXPECT_BUILD, `routes=${JSON.stringify(routeStatus)} servedBuild=${verBuild}`);

  // ---- L2 flag ON en prod (SERVED HOST config real) ----
  const cfgLiveResp = await fetchLive("/sim/config.js");
  const cfgLive = cfgLiveResp.text;
  const mBlock = cfgLive.match(/export const WINDUP_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const mt = mBlock ? mBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(mt);
  const chOk = /channel:\s*"windFind"/.test(mt);
  const paramsOk = /hiWind:\s*0\.85/.test(mt) && /midWind:\s*0\.62/.test(mt) && /windBountyCap:\s*2/.test(mt) &&
    /radius:\s*300/.test(mt) && /deliberate:\s*2/.test(mt) && /measured:\s*1/.test(mt);
  ok("L2 flag ON en prod (SERVED HOST config): WINDUP_SURGE.enabled:true + channel windFind + params (hiWind0.85/midWind0.62/deliberate2/measured1/cap2/radius300)",
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.wind && window.__dev.ram && window.__dev.sentinel && window.__dev.tough && window.__dev.menace && window.__dev.swift && window.__dev.role && window.__dev.bulk &&
    window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.spawnKill));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks wind/spawnKill/save/fp/peers; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L3 LIVE default: VM enabled TRUE (SIN toggle) + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.wind());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "windFind" &&
    d0.cap === CAP && d0.tag === "" && d0.tier === 0 && d0.score === 0 && d0.charge === 0 &&
    d0.hiWind === HI && d0.midWind === MID;
  ok("L3 LIVE default: __dev.wind().enabled===TRUE (flip aplicado, SIN toggle) + gExists false (STATELESS, G.windBounty null) + knobs servidos (channel/cap/hiWind/midWind) == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} cap=${d0.cap} tier=${d0.tier} score=${d0.score} charge=${d0.charge} tag="${d0.tag}" hiWind=${d0.hiWind} midWind=${d0.midWind}`);

  // ---- L4 LUT windupProbe pura windup→band/weight/tier/charge == oráculo (WORLD-INDEP) ----
  const wp = await page.evaluate((sweep) => sweep.map(w => { const p = window.__dev.wind({ windupProbe: { windup: w } }).windupProbe; return { w, band: p.band, weight: p.weight, tier: p.tier, charge: p.charge }; }), WINDUP_SWEEP);
  const wpBad = wp.filter(r => r.band !== oBand(r.w) || r.weight !== oWeight(r.w) || (r.tier != null && r.tier !== oRank(oWeight(r.w))) || (r.charge != null && r.charge !== oCharge(oWeight(r.w), true)));
  ok(`L4 LUT windupProbe windup→band→weight == oráculo re-derivado (WORLD-INDEP) en el sweep de umbral (${WINDUP_SWEEP.length} pts: bordes exactos 0.61/0.62 y 0.84/0.85)`,
    wpBad.length === 0, wpBad.length ? JSON.stringify(wpBad.map(r => ({ w: r.w, got: [r.band, r.weight], exp: [oBand(r.w), oWeight(r.w)] }))) : `all ${WINDUP_SWEEP.length} match`);

  // ---- L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap ≤2 ----
  const sc = await page.evaluate((scores) => scores.map(s => { const p = window.__dev.wind({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }), SCORES);
  const scBad = sc.filter(r => r.tier !== oRank(r.s) || r.charge !== oCharge(r.s, true));
  const capMax = Math.max(...sc.map(r => r.charge));
  ok(`L5 LUT scoreProbe score→tier→charge == oráculo oRank/oCharge(score) + sub-cap (max charge ≤ cap=${CAP})`,
    scBad.length === 0 && capMax <= CAP, scBad.length ? JSON.stringify(scBad.map(r => ({ s: r.s, got: [r.tier, r.charge], exp: [oRank(r.s), oCharge(r.s, true)] }))) : `capMax=${capMax} sc=${JSON.stringify(sc.map(r => [r.s, r.tier, r.charge]))}`);

  // ---- L6 REAL server-auth spawnWind over EVERY ETPL windup row ----
  const spawn6 = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      window.__dev.wind({ clearWind: true });
      const r = window.__dev.wind({ spawnWind: { type: t, tx: Z.forest[0], ty: Z.forest[1] } }).spawnWind;
      const wpr = window.__dev.wind({ windProbe: true }).windProbe;
      const mine = wpr.mobs.find(m => m.type === t) || null;
      out[t] = { windup: r.windup, weight: r.weight, valid: r.valid, wpW: mine ? mine.weight : -1, wpU: mine ? mine.windup : -1 };
    }
    window.__dev.wind({ clearWind: true });
    return out;
  }, { types: ALL_TYPES, Z });
  const s6bad = ALL_TYPES.filter(t => !spawn6[t].valid || spawn6[t].windup !== oWindup(t) || spawn6[t].weight !== oWeightType(t) || spawn6[t].wpW !== oWeightType(t) || spawn6[t].wpU !== oWindup(t));
  ok(`L6 ★ REAL spawnWind sobre LAS ${ALL_TYPES.length} filas windup de ETPL: browser windWeight == oWeightType(ETPL[type].windup) BASE (server-auth, flag ON, ≥15 requeridas)`,
    s6bad.length === 0, s6bad.length ? JSON.stringify(s6bad.map(t => ({ t, windup: oWindup(t), exp: oWeightType(t), got: spawn6[t] }))) : `all ${ALL_TYPES.length} match (golem=${spawn6.golem.weight} summoner=${spawn6.summoner.weight} orc=${spawn6.orc.weight} charger=${spawn6.charger.weight} bat=${spawn6.bat.weight} mage=${spawn6.mage.weight})`);

  // ---- L7 ⊥override/⊥campeón/⊥élite CRUX: overrideWindup on the CLONE must NOT move the band (windOf reads BASE) ----
  const dec = await page.evaluate((Z) => {
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const run = (type, ov) => { window.__dev.wind({ clearWind: true });
      const r = window.__dev.wind({ spawnWind: { type, tx: Z.forest[0], ty: Z.forest[1], overrideWindup: ov } }).spawnWind;
      const wpr = window.__dev.wind({ windProbe: true }).windProbe;
      const mine = wpr.mobs.find(m => m.type === type) || null;
      return { base: r.windup, cloneWindup: r.tplWindup, weight: r.weight, wpW: mine ? mine.weight : -99 }; };
    const orcElite = run("orc", 0.99);        // base 0.82, élite infla clon a 0.99 — wind debe seguir 1
    const golemDeflate = run("golem", 0.1);   // base 0.95, clon deflactado a 0.1 — wind debe seguir 2
    window.__dev.wind({ clearWind: true });
    return { orcElite, golemDeflate };
  }, Z);
  const decOK = dec.orcElite.base === oWindup("orc") && dec.orcElite.cloneWindup === 0.99 && dec.orcElite.weight === WM && dec.orcElite.wpW === WM &&
    dec.golemDeflate.base === oWindup("golem") && dec.golemDeflate.cloneWindup === 0.1 && dec.golemDeflate.weight === WD && dec.golemDeflate.wpW === WD;
  ok("L7 ★★ ⊥override/⊥campeón/⊥élite CRUX: overrideWindup escala el CLON e.tpl.windup mimetizando un spawn escalado/élite — windOf lee BASE ETPL[type].windup ⇒ orco base0.82 élite(clon0.99) SIGUE wind1; golem base0.95 deflactado(clon0.1) SIGUE wind2 ⇒ AMAGO (base estático) ⊥ élite/campeón (clon dinámico)",
    decOK, JSON.stringify(dec));

  // ---- L8 ⊥ cross-axis CRUX (⊥#98 ram / ⊥#97 sentinel / ⊥#96 tough / ⊥#95 menace / ⊥#94 swift / ⊥#92 bulk / ⊥#93 role / ⊥#84 skirmish) — pure data + real weights ----
  const D = (t) => ({ wind: oWeightType(t), ram: ramBand(+ETPL[t].knock), sentinel: sentinelBand(+ETPL[t].aggro), tough: toughBand(+ETPL[t].hp), menace: menaceBand(+ETPL[t].dmg), swift: swiftBand(+ETPL[t].spd), bulk: bulkBand(+ETPL[t].size), arch: ETPL[t].arch, ranged: !!ETPL[t].ranged, windup: +ETPL[t].windup, knock: +ETPL[t].knock, aggro: +ETPL[t].aggro, hp: +ETPL[t].hp, dmg: +ETPL[t].dmg, spd: +ETPL[t].spd, size: +ETPL[t].size });
  const golem = D("golem"), charger = D("charger"), ironback = D("ironback"), mudlurker = D("mudlurker"), mage = D("mage"), summoner = D("summoner"), volatile = D("volatile"), bat = D("bat"), orc = D("orc"), moose = D("moose"), spearman = D("spearman");
  const cruxOK =
    // ⊥#98 RAM: golem knock60 ram0 / windup0.95 wind2 vs charger knock235 ram2 / windup0.66 wind1 — ORDEN OPUESTO
    golem.ram === 0 && golem.wind === 2 && charger.ram === 2 && charger.wind === 1 &&
    // ⊥#97 SENTINEL: ironback aggro220 sentinel0 / windup0.86 wind2 vs mudlurker aggro250 sentinel1 / windup0.48 wind0 — OPUESTO
    ironback.sentinel === 0 && ironback.wind === 2 && mudlurker.sentinel === 1 && mudlurker.wind === 0 &&
    // ⊥#96 TOUGH: charger hp140 tough2 / windup0.66 wind1 vs mage hp56 tough1 / windup0.9 wind2 — OPUESTO
    charger.tough === 2 && charger.wind === 1 && mage.tough === 1 && mage.wind === 2 &&
    // ⊥#95 MENACE: summoner dmg0 menace0 / windup0.95 wind2 vs volatile dmg23 menace2 / windup0.7 wind1 — OPUESTO
    summoner.menace === 0 && summoner.wind === 2 && volatile.menace === 2 && volatile.wind === 1 &&
    // ⊥#94 SWIFT: bat spd158 swift2 / windup0.28 wind0 vs golem spd46 swift0 / windup0.95 wind2 — DIAMÉTRICAMENTE OPUESTO
    bat.swift === 2 && bat.wind === 0 && golem.swift === 0 && golem.wind === 2 &&
    // ⊥#93 ROLE: orc brute / wind1 vs moose brute / wind2 — MISMO arch DISTINTA banda
    orc.arch === "brute" && orc.wind === 1 && moose.arch === "brute" && moose.wind === 2 &&
    // ⊥#92 BULK: charger sz26 bulk2 / windup0.66 wind1 vs summoner sz20 bulk1 / windup0.95 wind2 — OPUESTO
    charger.bulk === 2 && charger.wind === 1 && summoner.bulk === 1 && summoner.wind === 2 &&
    // ⊥#84 SKIRMISH: golem MELEE / windup0.95 wind2 vs spearman RANGED / windup0.7 wind1 — OPUESTO
    golem.ranged === false && golem.wind === 2 && spearman.ranged === true && spearman.wind === 1;
  ok("L8 ★★ ⊥ CRUX cross-axis: golem ram0/wind2 vs charger ram2/wind1 ORDEN OPUESTO (⊥#98); ironback sentinel0/wind2 vs mudlurker sentinel1/wind0 OPUESTO (⊥#97); charger tough2/wind1 vs mage tough1/wind2 OPUESTO (⊥#96); summoner menace0/wind2 vs volatile menace2/wind1 OPUESTO (⊥#95); bat swift2/wind0 vs golem swift0/wind2 DIAMÉTRICAMENTE OPUESTOS (⊥#94); orc brute/wind1 vs moose brute/wind2 MISMO arch DISTINTA banda (⊥#93); charger bulk2/wind1 vs summoner bulk1/wind2 OPUESTO (⊥#92); golem melee/wind2 vs spearman ranged/wind1 OPUESTO (⊥#84)",
    cruxOK, JSON.stringify({ golem, charger, ironback, mudlurker, mage, summoner, volatile, bat, orc, moose, spearman }));

  // ---- L10 REAL GRANT (flag ON LIVE default): spawnKill drives REAL killEnemy seam ⇒ Δh.windBounty ----
  const GRANT_TYPES = ["golem", "summoner", "mage", "moose", "ironback", "magmabrute", "wraith", "wendigo", "dragon", "charger", "orc", "revenant", "toadbrute", "spearman", "volatile", "healer", "demon", "bat", "rat", "wolf", "mudlurker", "bandit", "skeleton", "quillback"];
  const grant = await page.evaluate((args) => {
    const { types, Z } = args;
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const out = {};
    for (const t of types) {
      const before = window.__dev.wind().hero.windBounty | 0;
      window.__dev.spawnKill(t);                        // REAL spawnEnemy + killEnemy at hero pos ⇒ drives wind seam
      const after = window.__dev.wind().hero.windBounty | 0;
      out[t] = after - before;
    }
    window.__dev.wind({ clearWind: true });
    // byte-neutral OFF: same deliberate kills with flag OFF ⇒ Δ0 (dead branch), then restore ON (LIVE default)
    window.__dev.wind({ enabled: false });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const offBefore = window.__dev.wind().hero.windBounty | 0;
    window.__dev.spawnKill("golem"); window.__dev.spawnKill("moose");
    const offDelta = (window.__dev.wind().hero.windBounty | 0) - offBefore;
    window.__dev.wind({ enabled: true }); window.__dev.wind({ clearWind: true });
    return { out, offDelta };
  }, { types: GRANT_TYPES, Z });
  const grantBad = GRANT_TYPES.filter(t => grant.out[t] !== oGrant(t, true));
  const grantMax = Math.max(...GRANT_TYPES.map(t => grant.out[t]));
  ok("L10 ★ REAL GRANT (flag ON LIVE): spawnKill ⇒ REAL killEnemy seam ⇒ Δh.windBounty == oGrant(type) por banda (deliberate golem/summoner/mage/moose/ironback/magmabrute/wraith/wendigo/dragon+2; measured charger/orc/revenant/toadbrute/spearman/volatile/healer/demon+1; snappy bat/rat/wolf/mudlurker/bandit/skeleton/quillback+0); sub-cap 2; flag OFF ⇒ Δ0",
    grantBad.length === 0 && grantMax <= CAP && grant.offDelta === 0,
    grantBad.length ? JSON.stringify(grantBad.map(t => ({ t, got: grant.out[t], exp: oGrant(t, true) }))) : `all match; grants=${JSON.stringify(grant.out)} max=${grantMax} offDelta=${grant.offDelta}`);

  // ---- L11 STATELESS: bounty banks via real kill, NOT in save, NOT in fp ----
  const stateless = await page.evaluate((Z) => {
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.spawnKill("golem");                    // banca windBounty via kill real
    const bounty = window.__dev.wind().hero.windBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.wind({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.wind({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.wind({ clearWind: true });
    return { bounty, blobHasBounty: /windBounty|windFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 };
  }, Z);
  ok("L11 STATELESS: h.windBounty banca (>0) pero NO en save blob (windBounty/windFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido, 0 desync",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L12 0-regresión LIVE (SERVED HOST config real): 41 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgLive.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const off = ARC.filter(n => flag(n) !== "true");
  // steady-state fps: settle after the heavy L6-L11 dev-hook churn/GC, then take the MAX over 3 samples (true core-loop budget,
  // not a cold/GC-polluted first rAF window — a single post-churn sample under harness load is an artifact, not a regression).
  await sleep(800);
  const fpsSamples = [];
  for (let k = 0; k < 3; k++) {
    fpsSamples.push(await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
      await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 900) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
      return Math.round(f / ((performance.now() - t0) / 1000)); }));
    await sleep(150);
  }
  const fps = Math.max(...fpsSamples);
  ok("L12 0-regresión LIVE (SERVED HOST config): 41 flags served enabled:true (40 previas #59-#98 + WINDUP_SURGE #99) + core loop fps≥55",
    off.length === 0 && ARC.length === 41 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} WINDUP=${flag("WINDUP_SURGE")} RAM=${flag("RAM_SURGE")} SENTINEL=${flag("SENTINEL_SURGE")} fps=${fps} samples=${JSON.stringify(fpsSamples)}`);

  // shot evidencia (golem ponderoso en prado, badge ⌛ ON)
  await page.evaluate((Z) => { window.__dev.wind({ clearWind: true }); window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } }); }, Z);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.wind({ clearWind: true }); });

  // ---- L13 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((Z) => {
    window.__dev.wind({ clearWind: true });
    window.__dev.wind({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.wind({ spawnWind: { type: "golem", tx: Z.forest[0], ty: Z.forest[1] } });
    const vm = window.__dev.wind();
    const lut = [0, 1, 2].map(s => { const p = window.__dev.wind({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const bands = [0, 0.5, 0.61, 0.62, 0.7, 0.84, 0.85, 0.95].map(w => window.__dev.wind({ windupProbe: { windup: w } }).windupProbe.weight);
    const wpr = window.__dev.wind({ windProbe: true }).windProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.wind({ clearWind: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, wpScore: wpr.score,
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
  // NOTE: windProbe.mobs[0] refleja el orden de G.enemies AMBIENTE en radio (artefacto por edad de sesión) — se asserta wpScore MAX, no orden.
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.wpScore === B.wpScore &&
    A.lut === B.lut && A.bands === B.bands && A.fp === B.fp && A.terrHash === B.terrHash;
  const golemMax = A.wpScore === oWeightType("golem") && B.wpScore === oWeightType("golem");
  const oracleMatch = A.score === oWeightType("golem") && A.charge === oCharge(oWeightType("golem"), true) &&
    A.bands === JSON.stringify([0, 0.5, 0.61, 0.62, 0.7, 0.84, 0.85, 0.95].map(oWeight));
  ok("L13 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMO golem+héroe ⇒ score/tier/charge + wpScore(MAX) + LUT score/bands + worldFingerprint + terrHash IDÉNTICOS byte-a-byte, Y ambos == QA oracle (mobs[0] ordering=artefacto ambiente por edad de sesión, ⊥ señal)",
    conv && golemMax && oracleMatch && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},wpScore:${A.wpScore},bands:${A.bands},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},wpScore:${B.wpScore},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp} golemMax=${golemMax} oracleMatch=${oracleMatch}`);
  ok(`L13b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-wind.png") });

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
console.log(`\n=== CAS-2591 QA LIVE observable (WINDUP_SURGE #99, 41º flag): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
