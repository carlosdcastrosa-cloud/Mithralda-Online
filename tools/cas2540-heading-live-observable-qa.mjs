// CAS-2540 — POST-FLIP QA (observable LIVE) para REMATE DE EMBESTIDA (HEADING_SURGE, EVO#90, flag ON) @ served 985626b23619 / master 5f74ef0.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO (porté el DARK cas2538 → LIVE; NO reusa el harness GE cas2537-heading-selfverify.mjs).
// NO es byte-verify (ya hecho por CEO 2ª byte-verify) — es verificación del EFECTO REAL con el flag ENCENDIDO en producción, 2 clientes 0-desync.
// El served (gh-pages 985626b23619) == master HEAD 5f74ef0 (CEO byte-verificó blobs == HEAD) ⇒ sirvo el árbol local = el sitio servido.
//
// EJE LIVE: headingWeight(e,h)=SIGNO del producto punto m·u al instante del remate.
//   m = intención-de-paso del mob (MISMA rama de IA de updateEnemies que aplica moveEnt — NO e.vx/e.vy INERTES #88);
//   u = hero→mob unitario. dot ≤ chargeCos(−0.5) ⇒ CARGANDO de frente ⇒ 2; dot ≥ fleeCos(0.5) ⇒ HUYENDO ⇒ 0; entre ambos ⇒ LATERAL ⇒ 1; estacionario ⇒ 0.
//   Canal FRESCO headingFind → h.headingBounty (transitorio, fuera del save+fingerprint), sub-cap headingBountyCap=2, badge »».
//   El seam de killEnemy banca headingForage(hero,tpl,_headingPre) donde _headingPre=headingWeight(VÍCTIMA) muestreado en el TOP.
//   forageChargePreview = headingForage(h,{xp:100}) = la MISMA fn PURA que el seam invoca (con score EN VIVO) ⇒ prueba observable del grant.
//
// Cobertura (issue CAS-2540):
//  L1 boot LIVE + build==version.json==985626b23619 (AVANZÓ de #89 0c9fc1ae88a7) + hooks (heading/interrupt/affixSpawnKill/save/fp) + 0 err/404
//  L2 flag ON en prod: served config HEADING_SURGE.enabled:true + channel headingFind + params (radius300/charge2 lateral1/chargeCos−0.5/fleeCos0.5/cap2)
//  L3 LIVE default: __dev.heading().enabled===TRUE + gExists false (STATELESS, G.headingBounty null) + knobs servidos == oráculos re-derivados
//  L4 ★ GEOM path WORLD-INDEP: geomProbe.weight == oráculo re-derivado (8 casos: charge×2⇒2, lateral⇒1, flee/kite/in-range/windup/idle⇒0)
//  L5 forageChargePreview (== fn PURA headingForage que el seam invoca): mob-cargando⇒2, lateral⇒1, huyendo/estacionario⇒0 (grant observable LIVE)
//  L6 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap≤2
//  L6b ★ REAL-KILL anti-auto-conteo: affixSpawnKill (mob FRESCO ocioso, rumbo≈0) ⇒ h.headingBounty Δ0 AUN con mob-cargando en radio (preview=2) — el grant es el RUMBO de la VÍCTIMA propia, no proximidad
//  L7 ★ REAL server-auth spawnHead→headProbe: charge⇒2, lateral⇒1, kite/flee/stop⇒0 (leído de los MISMOS campos que updateEnemies escribe)
//  L8 ★★ CRUX ⊥#89 INTERRUPT LIVE: MISMO e.state=chase ⇒ orco cerrando head2/int0 vs mago kiteando head0/int0 (heading OPUESTO en mismo estado) · mid-windup head0/int1 (DISJUNTOS)
//  L9 ⊥#88 REMATE (DIRECCIÓN no distancia): MISMA |hero-mob|=250px ⇒ cargando head2 vs huyendo head0 (DIVERGEN por dirección)
//  L10 STATELESS: save SIN headingFind/headingBounty + worldFingerprint toggle-neutral ON/OFF/ON (tokens fuera del fp aun con flag LIVE)
//  L11 0-regresión LIVE: 32 flags served enabled:true (31 previas #59-#89 + HEADING_SURGE #90)
//  L12 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + headProbe + LUT + worldFingerprint), fp esperado 15920977 / terrHash 2105484439
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2540-heading-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const EXPECT_BUILD = "985626b23619";     // served #90 (avanzó de #89 0c9fc1ae88a7)
const PREV_LIVE = "0c9fc1ae88a7";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2540-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// ─────────────────────────────────────────────────────────────────────────────
// ORÁCULOS RE-DERIVADOS EN JS PURO (QA-OWNED, independientes del código del juego).
const W = { charge: 2, lateral: 1 };
const CHARGE_COS = -0.5, FLEE_COS = 0.5;
const TIERS = [{ min: 1, charge: 1 }, { min: 2, charge: 2 }];
const CAP = 2;
function oracleIntent(state, dx, dy, arch, kite, range, wx, wy) {
  if (state === "windup" || state === "strike" || state === "recover" || state === "shield") return null;
  const d = Math.hypot(dx, dy) || 1;
  const tox = -dx / d, toy = -dy / d;   // mob→hero
  const awx = dx / d, awy = dy / d;     // hero→mob (alejándose)
  if (state === "chase") {
    if ((arch === "caster" || arch === "summoner" || arch === "healer") && d < kite) return { mx: awx, my: awy };
    if (d <= range) return null;
    return { mx: tox, my: toy };
  }
  if (state === "flee") return { mx: awx, my: awy };
  if (state === "idle" || state === "wander") { const wl = Math.hypot(wx, wy); if (wl < 1e-6) return null; return { mx: wx / wl, my: wy / wl }; }
  return null;
}
function oracleWeight(state, dx, dy, arch, kite, range, wx, wy) {
  const m = oracleIntent(state, dx, dy, arch, kite, range, wx, wy);
  if (!m) return 0;
  const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const dot = m.mx * ux + m.my * uy;
  if (dot <= CHARGE_COS) return W.charge;
  if (dot >= FLEE_COS) return 0;
  return W.lateral;
}
function oracleTier(score) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; }
function oracleCharge(score) { const t = oracleTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge) | 0; }
// interruptWeight #89 re-derivado (para el crux ⊥): shield⇒2; windup/strike⇒special||cast?2:1; stun>0⇒0; else 0.
function oracleInterrupt(state, specialNow, castNow, stun) {
  if ((+stun || 0) > 0) return 0;
  if (state === "shield") return 2;
  if (state === "windup" || state === "strike") return (specialNow || castNow) ? 2 : 1;
  return 0;
}
// ─────────────────────────────────────────────────────────────────────────────

let PASS = 0, FAIL = 0;
const results = [];
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  results.push(`${cond ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALive";
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.heading && window.__dev.interrupt &&
    window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks heading/interrupt/affixSpawnKill/save/fp; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L2 flag ON en prod (served config) ----
  const cfgSrc = await (await fetch(base + "/sim/config.js")).text().catch(() => "");
  const hBlock = cfgSrc.match(/export const HEADING_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const bt = hBlock ? hBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(bt);
  const chOk = /channel:\s*"headingFind"/.test(bt);
  const paramsOk = /radius:\s*300/.test(bt) && /charge:\s*2/.test(bt) && /lateral:\s*1/.test(bt) &&
    /chargeCos:\s*-0\.5/.test(bt) && /fleeCos:\s*0\.5/.test(bt) && /headingBountyCap:\s*2/.test(bt);
  ok("L2 flag ON en prod: served config HEADING_SURGE.enabled:true + channel headingFind + params (radius300/charge2/lateral1/chargeCos−0.5/fleeCos0.5/cap2)",
    enabledOn && chOk && paramsOk, `enabledOn=${enabledOn} channel=${chOk} params=${paramsOk}`);

  // ---- L3 LIVE default: VM enabled TRUE + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.heading());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "headingFind" &&
    d0.weights.charge === W.charge && d0.weights.lateral === W.lateral && d0.chargeCos === CHARGE_COS &&
    d0.fleeCos === FLEE_COS && d0.cap === CAP && d0.radius === 300 && JSON.stringify(d0.tiers) === JSON.stringify(TIERS);
  ok("L3 LIVE default: __dev.heading().enabled===TRUE (flip aplicado) + gExists false (STATELESS, G.headingBounty null) + knobs servidos == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} weights=${JSON.stringify(d0.weights)} chargeCos=${d0.chargeCos} fleeCos=${d0.fleeCos} cap=${d0.cap} radius=${d0.radius}`);

  // ---- L4 GEOM path WORLD-INDEP ----
  const geomMatrix = [
    { state: "chase", dx: 100, dy: 0, arch: "orc", range: 40, kite: 0, wx: 0, wy: 0 },
    { state: "chase", dx: 100, dy: 100, arch: "orc", range: 40, kite: 0, wx: 0, wy: 0 },
    { state: "wander", dx: 100, dy: 0, arch: "orc", range: 0, kite: 0, wx: 0, wy: 50 },
    { state: "flee", dx: 100, dy: 0, arch: "orc", range: 0, kite: 0, wx: 0, wy: 0 },
    { state: "chase", dx: 100, dy: 0, arch: "caster", range: 600, kite: 300, wx: 0, wy: 0 },
    { state: "chase", dx: 30, dy: 0, arch: "orc", range: 40, kite: 0, wx: 0, wy: 0 },
    { state: "windup", dx: 100, dy: 0, arch: "orc", range: 40, kite: 0, wx: 0, wy: 0 },
    { state: "idle", dx: 100, dy: 0, arch: "orc", range: 0, kite: 0, wx: 0, wy: 0 },
  ];
  const geom = await page.evaluate((cs) => cs.map(c => window.__dev.heading({ geomProbe: c }).geomProbe), geomMatrix);
  const geomOK = geom.every((r, i) => { const c = geomMatrix[i]; return r.weight === oracleWeight(c.state, c.dx, c.dy, c.arch, c.kite, c.range, c.wx, c.wy); });
  ok("L4 ★ GEOM path WORLD-INDEP: geomProbe.weight == oráculo re-derivado (8 casos: charge×2⇒2, lateral⇒1, flee/kite/in-range/windup/idle⇒0)",
    geomOK, JSON.stringify(geom.map((r, i) => `${geomMatrix[i].state}/${geomMatrix[i].arch}=${r.weight}(dot${r.dot})`)));

  // ---- L5 forageChargePreview (seam fn LIVE) ----
  const fcp = await page.evaluate(() => {
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    const read = (kind) => { window.__dev.heading({ clearHead: true }); window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind } }); return window.__dev.heading().forageChargePreview; };
    const charge = read("charge"), lateral = read("lateral"), flee = read("flee"), stop = read("stop");
    window.__dev.heading({ clearHead: true });
    return { charge, lateral, flee, stop };
  });
  ok("L5 forageChargePreview (== fn PURA headingForage que el seam invoca en killEnemy LIVE): mob-cargando⇒2, lateral⇒1, huyendo⇒0, estacionario⇒0 (grant observable)",
    fcp.charge === 2 && fcp.lateral === 1 && fcp.flee === 0 && fcp.stop === 0, JSON.stringify(fcp));

  // ---- L6 LUT scoreProbe pura == oráculo, sub-cap ≤2 ----
  const sweep = await page.evaluate(() => [0, 1, 2, 3, 9, 99].map(s => window.__dev.heading({ scoreProbe: { score: s } }).scoreProbe));
  let lutOk = true, lutDetail = [];
  for (const r of sweep) { const t = oracleTier(r.score), c = oracleCharge(r.score);
    if (r.tier !== t || r.charge !== c || r.charge > 2) { lutOk = false; lutDetail.push(`s${r.score}:hook(t${r.tier}/c${r.charge})!=oracle(t${t}/c${c})`); } }
  ok("L6 LUT scoreProbe pura score→tier→charge == oráculo re-derivado, sub-cap≤2", lutOk, lutDetail.length ? lutDetail.join("; ") : JSON.stringify(sweep.map(r => [r.score, r.tier, r.charge])));

  // ---- L6b REAL-KILL anti-auto-conteo: affixSpawnKill (mob FRESCO ocioso) ⇒ headingBounty Δ0 AUN con mob-cargando en radio ----
  const realKill = await page.evaluate(() => {
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "charge" } });   // mob cargando en radio ⇒ preview 2
    const previewBefore = window.__dev.heading().forageChargePreview;         // 2 (best available)
    const b0 = window.__dev.heading().hero.headingBounty | 0;
    window.__dev.affixSpawnKill("vampiric", "skeleton", "field");             // mata un mob FRESCO ocioso en h.x,h.y (headingWeight≈0)
    const b1 = window.__dev.heading().hero.headingBounty | 0;
    window.__dev.heading({ clearHead: true });
    return { previewBefore, b0, b1, delta: b1 - b0 };
  });
  ok("L6b ★ REAL-KILL anti-auto-conteo: affixSpawnKill de mob FRESCO ocioso ⇒ h.headingBounty Δ0 AUN con mob-cargando en radio (preview=2) — el grant es el RUMBO de la VÍCTIMA propia, no proximidad",
    realKill.previewBefore === 2 && realKill.delta === 0, JSON.stringify(realKill));

  // ---- L7 REAL server-auth: spawnHead→headProbe ----
  const realKinds = [["charge", 2], ["lateral", 1], ["kite", 0], ["flee", 0], ["stop", 0]];
  const real = await page.evaluate((kinds) => {
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    const o = kinds.map(([kind]) => {
      window.__dev.heading({ clearHead: true });
      const sh = window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind } }).spawnHead;
      const hp = window.__dev.heading({ headProbe: true }).headProbe;
      return { kind, shW: sh.weight, hpW: hp.mobs[0] ? hp.mobs[0].weight : -1, hpScore: hp.score, state: sh.state, dot: sh.dot };
    });
    window.__dev.heading({ clearHead: true });
    return o;
  }, realKinds);
  const realOK = real.every((r, i) => r.shW === realKinds[i][1] && r.hpW === realKinds[i][1] && r.hpScore === realKinds[i][1]);
  ok("L7 ★ REAL server-auth spawnHead→headProbe: charge⇒2, lateral⇒1, kite/flee/stop⇒0 (leído de los MISMOS campos que updateEnemies escribe)",
    realOK, JSON.stringify(real.map(r => `${r.kind}=${r.hpW}`)));

  // ---- L8 CRUX ⊥#89 INTERRUPT LIVE ----
  const crux = await page.evaluate(() => {
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    const shA = window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "charge" } }).spawnHead;
    const aHead = window.__dev.heading({ headProbe: true }).headProbe.score;
    const aInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true });
    const shB = window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "kite" } }).spawnHead;
    const bHead = window.__dev.heading({ headProbe: true }).headProbe.score;
    const bInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true });
    const shC = window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "stop" } }).spawnHead;
    const cHead = window.__dev.heading({ headProbe: true }).headProbe.score;
    const cInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true });
    return { aState: shA.state, aHead, aInt, bState: shB.state, bHead, bInt, cState: shC.state, cHead, cInt };
  });
  const cruxSameState = crux.aState === "chase" && crux.bState === "chase";
  const cruxExp = crux.aHead === 2 && crux.aInt === oracleInterrupt("chase", 0, 0, 0) && crux.bHead === 0 &&
    crux.bInt === oracleInterrupt("chase", 0, 0, 0) && crux.cHead === 0 && crux.cInt === oracleInterrupt("windup", 0, 0, 0);
  ok("L8 ★★ CRUX ⊥#89 INTERRUPT LIVE: MISMO e.state=chase ⇒ orco cerrando head2/int0 vs mago kiteando head0/int0 (heading OPUESTO en mismo estado; interrupt colapsa chase a 0) · mid-windup head0/int1 (DISJUNTOS)",
    cruxSameState && cruxExp && crux.aHead === 2 && crux.bHead === 0 && crux.cHead === 0 && crux.aInt === 0 && crux.bInt === 0 && crux.cInt === 1, JSON.stringify(crux));

  // ---- L9 ⊥#88 REMATE (DIRECCIÓN no distancia) ----
  const dirCrux = await page.evaluate(() => {
    const gC = window.__dev.heading({ geomProbe: { state: "chase", dx: 250, dy: 0, arch: "orc", range: 40 } }).geomProbe;
    const gF = window.__dev.heading({ geomProbe: { state: "flee", dx: 250, dy: 0, arch: "orc" } }).geomProbe;
    return { chargeW: gC.weight, chargeDot: gC.dot, fleeW: gF.weight, fleeDot: gF.dot };
  });
  ok("L9 ★ ⊥#88 REMATE (DIRECCIÓN no distancia): MISMA |hero-mob|=250px ⇒ cargando head2 (dot≤−0.5) vs huyendo head0 (dot≥0.5) — DIVERGEN por dirección",
    dirCrux.chargeW === 2 && dirCrux.fleeW === 0 && dirCrux.chargeDot <= -0.5 && dirCrux.fleeDot >= 0.5, JSON.stringify(dirCrux));

  // ---- L10 STATELESS: save sin claves + fp toggle-neutral (flag ON) ----
  const sl = await page.evaluate(() => {
    const s = JSON.stringify(window.__dev.saveBlob());
    const fpOn = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.heading({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.heading({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    return { clean: !/headingFind|headingBounty/.test(s), fpNeutral: fpOn === fpOff && fpOff === fpOn2 };
  });
  ok("L10 STATELESS: save SIN headingFind/headingBounty + worldFingerprint toggle-neutral ON/OFF/ON (tokens fuera del fp aun con flag LIVE)",
    sl.clean && sl.fpNeutral, JSON.stringify(sl));

  // ---- L11 0-regresión LIVE: 32 flags served enabled:true ----
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const ARC = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE","SKIRMISH_LINE_SURGE","CONTROL_HARVEST_SURGE","BLOODHARVEST_SURGE","PACKHARVEST_SURGE","LONGSHOT_SURGE","INTERRUPT_SURGE","HEADING_SURGE"];
  const off = ARC.filter(n => flag(n) !== "true");
  ok("L11 0-regresión LIVE: 32 flags served enabled:true (31 previas #59-#89 + HEADING_SURGE #90)",
    off.length === 0 && ARC.length === 32, `n=${ARC.length} off=${JSON.stringify(off)} HEADING=${flag("HEADING_SURGE")}`);

  // shot evidencia (mob cargando, badge »» ON)
  await page.evaluate(() => { window.__dev.heading({ clearHead: true }); const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } }); window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "charge" } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.heading({ clearHead: true }); });

  // ---- L12 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate(() => {
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "charge" } });   // orco cargando ⇒ score2/T2
    const vm = window.__dev.heading();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.heading({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const hp = window.__dev.heading({ headProbe: true }).headProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.heading({ clearHead: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, hpScore: hp.score, hpCount: hp.count,
      hpW: hp.mobs[0] ? hp.mobs[0].weight : -1, hpState: hp.mobs[0] ? hp.mobs[0].state : "",
      lut: JSON.stringify(lut), fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  });
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
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.hpScore === B.hpScore &&
    A.hpCount === B.hpCount && A.hpW === B.hpW && A.hpState === B.hpState && A.lut === B.lut && A.fp === B.fp;
  ok("L12 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: A==B (score/tier/charge + headProbe + LUT + worldFingerprint byte-idénticos), mob-cargando⇒score2/T2/charge2",
    conv && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},hpW:${A.hpW},hpState:${A.hpState},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},hpW:${B.hpW},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp}`);
  ok(`L12b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);

  ok("L0 no JS errors / 0 req-fail durante el run", errors.length === 0 && reqErr.length === 0, `err=${errors.length} reqErr=${reqErr.length}${errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""}`);

  console.log("\n" + results.join("\n"));
  console.log(`\nfp observado=${A.fpLen} (esperado ${EXPECT_FP}) · terrHash=${A.terrHash} (esperado ${EXPECT_TERRHASH}) · 2-cli fpMatch=${A.fp === B.fp} · served build=${build} · flag ON=${d0.enabled}`);
} catch (e) {
  FAIL++;
  results.push("❌ harness exception — " + String(e && e.stack || e));
  console.log("\n" + results.join("\n"));
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n=== CAS-2540 QA LIVE observable (HEADING_SURGE #90): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
