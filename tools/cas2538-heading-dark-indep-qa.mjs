// CAS-2538 — DARK QA Gate 2/2 (INDEPENDIENTE) para REMATE DE EMBESTIDA (HEADING_SURGE, EVO#90 DARK, enabled:false).
// QA-OWNED: los oráculos están RE-DERIVADOS en JS PURO aquí abajo (NO reusa el harness de GE cas2537-heading-selfverify.mjs).
// Corroboración independiente del build GE @c4189a88 sobre #89 INTERRUPT_SURGE LIVE (served 0c9fc1ae88a7/813).
//
// EJE bajo verificación: headingWeight(e,h) = SIGNO del producto punto m·u al instante del remate.
//   m = intención-de-paso del mob (MISMA rama de IA de updateEnemies que aplica moveEnt — NO e.vx/e.vy INERTES #88);
//   u = hero→mob unitario. dot ≤ chargeCos(−0.5) ⇒ CARGANDO de frente ⇒ 2; dot ≥ fleeCos(0.5) ⇒ HUYENDO ⇒ 0;
//   entre ambos ⇒ LATERAL/interceptando ⇒ 1; estacionario (windup/strike/recover/shield o sin wander) ⇒ 0.
// Canal FRESCO headingFind → h.headingBounty (transitorio, fuera del save + fingerprint), sub-cap headingBountyCap=2, badge »».
//
// Run: node tools/cas2538-heading-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2538");
mkdirSync(OUT, { recursive: true });

// ─────────────────────────────────────────────────────────────────────────────
// ORÁCULOS RE-DERIVADOS EN JS PURO (QA-OWNED, independientes del código del juego).
// Config esperada (knobs CEO): weights charge=2 lateral=1; chargeCos −0.5 / fleeCos 0.5; tiers [{min1,c1},{min2,c2}]; cap=2.
const W = { charge: 2, lateral: 1 };
const CHARGE_COS = -0.5, FLEE_COS = 0.5;
const TIERS = [{ min: 1, charge: 1 }, { min: 2, charge: 2 }];
const CAP = 2;
// Convención geomProbe: héroe FAKE en (0,0), mob FAKE en (dx,dy). headingIntent devuelve m (unitario) o null (estacionario).
function oracleIntent(state, dx, dy, arch, kite, range, wx, wy) {
  if (state === "windup" || state === "strike" || state === "recover" || state === "shield") return null;
  const d = Math.hypot(dx, dy) || 1;
  const tox = -dx / d, toy = -dy / d;   // mob→hero (hacia el héroe)
  const awx = dx / d, awy = dy / d;     // hero→mob (alejándose)
  if (state === "chase") {
    if ((arch === "caster" || arch === "summoner" || arch === "healer") && d < kite) return { mx: awx, my: awy }; // KITEA
    if (d <= range) return null;        // en rango ⇒ compromete windup, no traslada
    return { mx: tox, my: toy };        // CIERRA hacia el héroe
  }
  if (state === "flee") return { mx: awx, my: awy };  // huye
  if (state === "idle" || state === "wander") {
    const wl = Math.hypot(wx, wy); if (wl < 1e-6) return null;
    return { mx: wx / wl, my: wy / wl };              // deriva ambiental (vector de wander, NO relativo al héroe)
  }
  return null;
}
function oracleWeight(state, dx, dy, arch, kite, range, wx, wy) {
  const m = oracleIntent(state, dx, dy, arch, kite, range, wx, wy);
  if (!m) return 0;
  const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;   // hero→mob unitario
  const dot = m.mx * ux + m.my * uy;
  if (dot <= CHARGE_COS) return W.charge;   // cargando de frente ⇒ 2
  if (dot >= FLEE_COS) return 0;            // huyendo ⇒ 0
  return W.lateral;                         // lateral/interceptando ⇒ 1
}
function oracleTier(score) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; }
function oracleCharge(score) { const t = oracleTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge) | 0; }
// interruptWeight #89 re-derivado (para el crux ⊥): shield ⇒ 2; windup/strike ⇒ special||cast ? 2 : 1; stun>0 ⇒ 0; else 0.
function oracleInterrupt(state, specialNow, castNow, stun) {
  if ((+stun || 0) > 0) return 0;
  if (state === "shield") return 2;
  if (state === "windup" || state === "strike") return (specialNow || castNow) ? 2 : 1;
  return 0;
}
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
const results = [];
function ok(name, cond, detail = "") {
  if (cond) { passed++; results.push(`✅ ${name}${detail ? " — " + detail : ""}`); }
  else { failed++; results.push(`❌ ${name}${detail ? " — " + detail : ""}`); }
}

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAIndep";
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })); });
  await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
  await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
  for (const s of ["customize", "abilitysel"]) {
    if (await page.evaluate(() => window.__dev.scene()) === s)
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
  }
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);

  // 1 — boots + hooks
  const build = await page.evaluate(() => window.__BUILD || null);
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.heading && window.__dev.interrupt && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.heading + __dev.interrupt (crux peer) + saveBlob/worldFingerprint + __BUILD, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 — DARK OFF: enabled:false + gExists:false + tag ""
  const dark = await page.evaluate(() => window.__dev.heading());
  ok("2 DARK OFF: served enabled:false + gExists:false (G.headingBounty NUNCA creado) + tag vacío", dark.enabled === false && dark.gExists === false && dark.tag === "", `enabled=${dark.enabled} gExists=${dark.gExists} tag="${dark.tag}"`);

  // 3 — config servida (knobs) coincide con mis oráculos re-derivados
  const cfg = await page.evaluate(() => { const d = window.__dev.heading(); return { channel: d.channel, radius: d.radius, weights: d.weights, chargeCos: d.chargeCos, fleeCos: d.fleeCos, tiers: d.tiers, cap: d.cap }; });
  const cfgOK = cfg.channel === "headingFind" && cfg.weights.charge === W.charge && cfg.weights.lateral === W.lateral && cfg.chargeCos === CHARGE_COS && cfg.fleeCos === FLEE_COS && cfg.cap === CAP && JSON.stringify(cfg.tiers) === JSON.stringify(TIERS);
  ok("3 knobs servidos == oráculos re-derivados (channel/weights/chargeCos/fleeCos/tiers/cap)", cfgOK, JSON.stringify(cfg));

  // 4 — STATELESS: saveBlob (OFF y ON) SIN headingFind/headingBounty; fingerprint toggle-neutral
  const stateless = await page.evaluate(() => {
    const sOff = JSON.stringify(window.__dev.saveBlob());
    window.__dev.heading({ enabled: true });
    const sOn = JSON.stringify(window.__dev.saveBlob());
    const fpOn = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.heading({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    const re = /headingFind|headingBounty/;
    return { offClean: !re.test(sOff), onClean: !re.test(sOn), fpNeutral: fpOn === fpOff };
  });
  ok("4 STATELESS: save (OFF y ON) SIN clave headingFind/headingBounty + worldFingerprint toggle-neutral", stateless.offClean && stateless.onClean && stateless.fpNeutral, JSON.stringify(stateless));

  // 5 — BYTE-NEUTRAL OFF: ON+mob cargando ⇒ forageChargePreview>0 ; OFF+mismo mob ⇒ 0 EXACTO (seam = rama muerta)
  const neutralOff = await page.evaluate(() => {
    window.__dev.heading({ enabled: true });
    window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero;
    window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "charge" } });   // orco cargando ⇒ score2
    const onPrev = window.__dev.heading().forageChargePreview;   // ON con mob cargando ⇒ >0
    window.__dev.heading({ enabled: false });
    const offPrev = window.__dev.heading().forageChargePreview;  // OFF con el MISMO mob ⇒ 0 EXACTO (headingForage→headingBonus GATEADO por enabled)
    window.__dev.heading({ clearHead: true });
    return { onPrev, offPrev };
  });
  ok("5 BYTE-NEUTRAL OFF: ON+mob cargando forage>0 PERO OFF+mismo-mob forageChargePreview==0 (seam headingForage rama muerta ⇒ killEnemy byte-id al HEAD)", neutralOff.onPrev > 0 && neutralOff.offPrev === 0, JSON.stringify(neutralOff));

  // 6 — LUT PURA re-derivada: scoreProbe {0,1,2,9} → tier/charge == oracleTier/oracleCharge
  const lutCases = [0, 1, 2, 9];
  const lut = await page.evaluate((cs) => { window.__dev.heading({ enabled: true }); const o = cs.map(s => { const p = window.__dev.heading({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; }); window.__dev.heading({ enabled: false }); return o; }, lutCases);
  const lutOK = lut.every(r => r.tier === oracleTier(r.s) && r.charge === oracleCharge(r.s));
  ok("6 LUT PURA score→tier→charge == oráculo re-derivado (det, cap 2)", lutOK, JSON.stringify(lut));

  // 7 — SUB-CAP 2
  const capOK = lut.every(r => r.charge <= CAP);
  ok("7 SUB-CAP headingBountyCap=2 respetado (max charge servido)", capOK, `maxCharge=${Math.max(...lut.map(r => r.charge))}`);

  // 8 — GEOM path WORLD-INDEP: geomProbe (mob sintético vs héroe fake en 0,0) weight == oracleWeight para toda la matriz
  const geomMatrix = [
    { state: "chase", dx: 100, dy: 0, arch: "orc", range: 40, kite: 0, wx: 0, wy: 0 },      // cargando (d>range) ⇒ 2
    { state: "chase", dx: 100, dy: 100, arch: "orc", range: 40, kite: 0, wx: 0, wy: 0 },    // cargando diag ⇒ 2
    { state: "wander", dx: 100, dy: 0, arch: "orc", range: 0, kite: 0, wx: 0, wy: 50 },     // lateral ⊥ ⇒ 1
    { state: "flee", dx: 100, dy: 0, arch: "orc", range: 0, kite: 0, wx: 0, wy: 0 },        // huyendo ⇒ 0
    { state: "chase", dx: 100, dy: 0, arch: "caster", range: 600, kite: 300, wx: 0, wy: 0 },// kite mago (d<kite) ⇒ 0
    { state: "chase", dx: 30, dy: 0, arch: "orc", range: 40, kite: 0, wx: 0, wy: 0 },       // en rango (d<=range) ⇒ null ⇒ 0
    { state: "windup", dx: 100, dy: 0, arch: "orc", range: 40, kite: 0, wx: 0, wy: 0 },     // estacionario ⇒ 0
    { state: "idle", dx: 100, dy: 0, arch: "orc", range: 0, kite: 0, wx: 0, wy: 0 },        // idle sin wander ⇒ 0
  ];
  const geom = await page.evaluate((cs) => { window.__dev.heading({ enabled: true }); const o = cs.map(c => window.__dev.heading({ geomProbe: c }).geomProbe); window.__dev.heading({ enabled: false }); return o; }, geomMatrix);
  const geomOK = geom.every((r, i) => { const c = geomMatrix[i]; return r.weight === oracleWeight(c.state, c.dx, c.dy, c.arch, c.kite, c.range, c.wx, c.wy); });
  ok("8 ★ GEOM path WORLD-INDEP: geomProbe.weight == oráculo re-derivado (8 casos: charge×2⇒2, lateral⇒1, flee/kite/in-range/windup/idle⇒0)", geomOK, JSON.stringify(geom.map((r, i) => `${geomMatrix[i].state}/${geomMatrix[i].arch}=${r.weight}(dot${r.dot})`)));

  // 9 — REAL server-auth: spawnHead inyecta un mob REAL en G.enemies con rumbo server-auth; peso leído de los MISMOS campos que updateEnemies escribe
  const realKinds = [["charge", 2], ["lateral", 1], ["kite", 0], ["flee", 0], ["stop", 0]];
  const real = await page.evaluate((kinds) => {
    window.__dev.heading({ enabled: true }); window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    const o = kinds.map(([kind]) => {
      window.__dev.heading({ clearHead: true });
      const sh = window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind } }).spawnHead;
      const hp = window.__dev.heading({ headProbe: true }).headProbe;
      return { kind, shW: sh.weight, hpW: hp.mobs[0] ? hp.mobs[0].weight : -1, hpScore: hp.score, state: sh.state, dot: sh.dot };
    });
    window.__dev.heading({ clearHead: true }); window.__dev.heading({ enabled: false });
    return o;
  }, realKinds);
  const realOK = real.every((r, i) => r.shW === realKinds[i][1] && r.hpW === realKinds[i][1] && r.hpScore === realKinds[i][1]);
  ok("9 ★ REAL server-auth spawnHead→headProbe: charge⇒2, lateral⇒1, kite/flee/stop⇒0 (leído de los MISMOS campos que updateEnemies escribe)", realOK, JSON.stringify(real.map(r => `${r.kind}=${r.hpW}`)));

  // 10 — CRUX ⊥#89 INTERRUPT (crítico): DENTRO del mismo e.state="chase", orco cerrando ⇒ heading2/interrupt0 vs mago kiteando ⇒ heading0/interrupt0 (MISMO estado, heading OPUESTO, interrupt colapsa chase a 0); mob mid-windup ⇒ heading0/interrupt1 (DISJUNTOS).
  const crux = await page.evaluate(() => {
    window.__dev.heading({ enabled: true }); window.__dev.interrupt({ enabled: true }); window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    // A: orco CARGANDO (chase, d>range)
    const shA = window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "charge" } }).spawnHead;
    const aHead = window.__dev.heading({ headProbe: true }).headProbe.score;
    const aInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true });
    // B: mago KITEANDO (chase, caster d<kite) — MISMO estado chase
    const shB = window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "kite" } }).spawnHead;
    const bHead = window.__dev.heading({ headProbe: true }).headProbe.score;
    const bInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true });
    // C: mob MID-WINDUP (estacionario)
    const shC = window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "stop" } }).spawnHead;
    const cHead = window.__dev.heading({ headProbe: true }).headProbe.score;
    const cInt = window.__dev.interrupt({ actProbe: true }).actProbe.score;
    window.__dev.heading({ clearHead: true }); window.__dev.heading({ enabled: false }); window.__dev.interrupt({ enabled: false });
    return { aState: shA.state, aHead, aInt, bState: shB.state, bHead, bInt, cState: shC.state, cHead, cInt };
  });
  // re-derivo: A chase-charge ⇒ head oracleWeight(chase,charge)=2 / int oracleInterrupt(chase)=0 ; B chase-kite ⇒ head 0 / int 0 ; C windup ⇒ head 0 / int oracleInterrupt(windup)=1
  const cruxSameState = crux.aState === "chase" && crux.bState === "chase";
  const cruxExp = crux.aHead === 2 && crux.aInt === oracleInterrupt("chase", 0, 0, 0) && crux.bHead === 0 && crux.bInt === oracleInterrupt("chase", 0, 0, 0) && crux.cHead === 0 && crux.cInt === oracleInterrupt("windup", 0, 0, 0);
  ok("10 ★★ CRUX ⊥#89 INTERRUPT: MISMO e.state=chase ⇒ orco cerrando head2/int0 vs mago kiteando head0/int0 (heading OPUESTO en mismo estado; interrupt colapsa chase a 0) · mid-windup head0/int1 (DISJUNTOS)", cruxSameState && cruxExp && crux.aHead === 2 && crux.bHead === 0 && crux.cHead === 0 && crux.aInt === 0 && crux.bInt === 0 && crux.cInt === 1, JSON.stringify(crux));

  // 11 — ⊥#88 REMATE (DISTANCIA MAGNITUD sin dirección): a la MISMA distancia, cargando ⇒ head2 vs huyendo ⇒ head0 (heading DIVERGE por dirección aunque |hero-mob| idéntica)
  const dirCrux = await page.evaluate(() => {
    window.__dev.heading({ enabled: true });
    const gC = window.__dev.heading({ geomProbe: { state: "chase", dx: 250, dy: 0, arch: "orc", range: 40 } }).geomProbe;   // cargando @250px
    const gF = window.__dev.heading({ geomProbe: { state: "flee", dx: 250, dy: 0, arch: "orc" } }).geomProbe;               // huyendo @250px (MISMA dist)
    window.__dev.heading({ enabled: false });
    return { chargeW: gC.weight, chargeDot: gC.dot, fleeW: gF.weight, fleeDot: gF.dot };
  });
  ok("11 ★ ⊥#88 REMATE (DIRECCIÓN no distancia): MISMA |hero-mob|=250px ⇒ cargando head2 (dot≤−0.5) vs huyendo head0 (dot≥0.5) — DIVERGEN por dirección", dirCrux.chargeW === 2 && dirCrux.fleeW === 0 && dirCrux.chargeDot <= -0.5 && dirCrux.fleeDot >= 0.5, JSON.stringify(dirCrux));

  // 12 — 0-REGRESIÓN: 31 flags del arco #59-#89 served enabled:true; HEADING_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const hDark = flag("HEADING_SURGE") === "false";
  ok("12 ★ 0-REGRESIÓN: 31 flags #59-#89 served enabled:true; HEADING_SURGE served false (DARK #90)", arcAllOn && hDark && arc.length === 31, `heading=${flag("HEADING_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // shot self-verify (mob cargando, ON)
  await page.evaluate(() => { window.__dev.heading({ enabled: true }); window.__dev.heading({ clearHead: true }); const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } }); window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "charge" } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.heading({ clearHead: true }); window.__dev.heading({ enabled: false }); });

  // 13 — NORTH STAR 2-cliente 0-desync: A==B (score/tier/charge/headProbe/LUT/fingerprint) + fp esperado 15920977
  await sleep(300);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();   // 2ª pág DEBE estar al frente antes de bootear (headless throttla rAF en 2º plano ⇒ boot cuelga)
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate(() => {
    window.__dev.heading({ enabled: true }); window.__dev.heading({ clearHead: true });
    const h = window.__dev.heading().hero; window.__dev.heading({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.heading({ spawnHead: { dx: 96, dy: 0, kind: "charge" } });   // orco cargando ⇒ score2/T2
    const vm = window.__dev.heading();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.heading({ scoreProbe: { score: s } }).scoreProbe; return { s, tier: p.tier, charge: p.charge }; });
    const hp = window.__dev.heading({ headProbe: true }).headProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.heading({ clearHead: true }); window.__dev.heading({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, hpScore: hp.score, hpCount: hp.count, hpW: hp.mobs[0] ? hp.mobs[0].weight : -1, hpState: hp.mobs[0] ? hp.mobs[0].state : "", lut, fp, fpLen: fp.length, terrHash: fpObj.terrHash };
  });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.hpScore === B.hpScore && A.hpCount === B.hpCount && A.hpW === B.hpW && A.hpState === B.hpState && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("13 ★ NORTH STAR 2-CLIENTE 0-desync: A==B (score/tier/charge + headProbe + LUT + worldFingerprint byte-idénticos)", conv && A.score === 2 && A.tier === 2 && A.charge === 2, `A={s:${A.score},t:${A.tier},c:${A.charge},hpW:${A.hpW},hpState:${A.hpState}} B={s:${B.score},t:${B.tier},c:${B.charge},hpW:${B.hpW}} fpMatch=${A.fp === B.fp}`);
  ok("14 ★ NORTH STAR fp observado (worldFingerprint length) == esperado 15920977, A==B (mundo determinista compartido; terrHash idéntico)", A.fpLen === 15920977 && B.fpLen === 15920977 && A.terrHash === B.terrHash, `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} terrHash=${A.terrHash}`);

  // 0 — sin errores JS
  ok("0 sin errores JS durante el run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

  console.log("\n" + results.join("\n"));
  console.log(`\n=== CAS-2538 DARK QA INDEP (HEADING_SURGE #90): ${passed}/${passed + failed} PASS ===`);
  console.log(`fp observado (worldFingerprint length): ${A.fpLen} (esperado 15920977) · terrHash: ${A.terrHash} · 2-cli fpMatch: ${A.fp === B.fp} · build: ${build}`);
  console.log(failed === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed === 0 ? 0 : 1);
