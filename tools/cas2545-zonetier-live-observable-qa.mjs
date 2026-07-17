// CAS-2545 — POST-FLIP QA (observable LIVE) para REMATE EN ZONA PELIGROSA (ZONETIER_SURGE, EVO#91, flag ON) @ served db02ca6bb457 / master 20e3a95.
// QA-OWNED, INDEPENDIENTE: oráculos RE-DERIVADOS en JS PURO (porté el DARK cas2543 → LIVE; NO reusa el harness GE cas2541/cas2542 selfverify).
// NO es byte-verify (ya hecho por CEO 2ª byte-verify LIVE) — es verificación del EFECTO REAL con el flag ENCENDIDO en producción, 2 clientes 0-desync.
// El served (gh-pages db02ca6bb457) == master HEAD 20e3a95 (CEO byte-verificó served blobs == HEAD) ⇒ sirvo el árbol local = el sitio servido.
//
// EJE LIVE: tierWeight(e)=BANDA DE DIFICULTAD de la zona GEOGRÁFICA server-auth DONDE MUERE el mob.
//   z = ZONE_TIER[zoneOf(world,e.x,e.y)].tier muestreado en la POSICIÓN VIVA del kill (⊥ spawn-stamp e.zoneTier).
//   z≥hiTier(4) [arena/swamp/abyss/caldera/frost/trial] ⇒ high(2); z≥midTier(2) [ruins/caves] ⇒ mid(1); z<midTier [forest tier-1/town/field] ⇒ 0.
//   Canal FRESCO tierFind → h.tierBounty (transitorio, fuera del save+fingerprint), sub-cap tierBountyCap=2, badge ◈"Frontera:".
//   El seam de killEnemy banca tierForage(hero,tpl,_tierPre) donde _tierPre=tierWeight(VÍCTIMA) muestreado en el TOP de killEnemy.
//
// Cobertura (issue CAS-2545 — acceptance observable, flag ON):
//  L1 boot LIVE + build==version.json==db02ca6bb457 (AVANZÓ de #90 985626b23619) + hooks (zonetier/affixSpawnKill/save/fp/peers) + 0 err/404
//  L2 flag ON en prod: served config ZONETIER_SURGE.enabled:true + channel tierFind + params (hiTier4/midTier2/high2/mid1/cap2/tiers)
//  L3 LIVE default: __dev.zonetier().enabled===TRUE + gExists false (STATELESS, G.tierBounty null) + knobs servidos == oráculos re-derivados
//  L4 ★ PATH zoneProbe zoneOf→ZONE_TIER.tier→tierWeight == oráculo re-derivado (WORLD-DEP): initial⇒w0/f0, mid⇒w1/f1, danger⇒w2/f2
//  L5 LUT scoreProbe pura score→tier→charge == oráculo, sub-cap≤2
//  L6 ★ REAL server-auth spawnTier→tierProbe: danger⇒2, mid⇒1, initial⇒0 (leído de los MISMOS campos que el mundo escribe)
//  L7 ★ REAL GRANT (real killEnemy via affixSpawnKill en LIVE kill pos): endgame⇒+2, ruins/caves⇒+1, initial⇒+0, acumula (2+1+0=3); flag OFF ⇒ Δ0
//  L8 ★★ CRUX ⊥32 LIVE: ⊥#72 escasez (misma tile 1 vs 5 mobs) · ⊥#70 firm-footing (2 tiles misma zona, RECT no material) · ⊥#88/#90 (pt-blank abismo=2 vs prado=0; posición no dist/dir) · ⊥#73 apex (mob solo en rincón peligro=2, sin jefe)
//  L9 STATELESS: h.tierBounty banca (>0) pero NO en save + NO en worldFingerprint (fp toggle-neutral)
//  L10 0-regresión LIVE: 33 flags served enabled:true (32 previas #59-#90 + ZONETIER_SURGE #91) + core loop fps≥55
//  L11 ★ North Star 2-cliente 0-desync LIVE: A==B (score/tier/charge + tierProbe + zoneProbe + LUT + worldFingerprint), fp esperado 15920977 / terrHash 2105484439
//
// Run: CHROME_PATH=/usr/bin/chromium node tools/cas2545-zonetier-live-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const EXPECT_BUILD = "db02ca6bb457";     // served #91 (avanzó de #90 985626b23619)
const PREV_LIVE = "985626b23619";
const EXPECT_FP = 15920977;              // North Star: worldFingerprint(393) JSON string length
const EXPECT_TERRHASH = 2105484439;      // North Star: terrHash del mundo determinista compartido

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2545-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// ─────────────────────────────────────────────────────────────────────────────
// ORÁCULOS RE-DERIVADOS EN JS PURO (QA-OWNED, independientes del código del juego).
const CFG_ORACLE = { hiTier: 4, midTier: 2, weights: { high: 2, mid: 1 }, cap: 2, tiers: [{ min: 1, charge: 1 }, { min: 2, charge: 2 }] };
const oracleBandToW = (band, cfg = CFG_ORACLE) => (band >= cfg.hiTier ? (+cfg.weights.high || 0) : (band >= cfg.midTier ? (+cfg.weights.mid || 0) : 0));
const oracleRank = (score, tiers = CFG_ORACLE.tiers) => { let t = 0; for (let i = 0; i < tiers.length; i++) if (score >= (+tiers[i].min || 0)) t = i + 1; return t; };
const oracleCharge = (score, cfg = CFG_ORACLE) => { const t = oracleRank(score, cfg.tiers); if (t <= 0) return 0;
  const raw = +cfg.tiers[t - 1].charge || 0, cap = Math.max(0, cfg.cap | 0); return (cap > 0 ? Math.min(cap, raw) : raw) | 0; };
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

// Discover REAL zone tiles per band via zoneProbe (WORLD-DEPENDENT, same seed).
// Returns { initial, mid, high, high2 } — high2 = a SECOND distinct tile in the SAME danger zone (for ⊥#70).
async function discoverTiles(page) {
  return await page.evaluate((cfg) => {
    const bandToW = (b) => (b >= cfg.hiTier ? 2 : (b >= cfg.midTier ? 1 : 0));
    let high = null, high2 = null, mid = null, initialForest = null, initialAny = null;
    for (let tx = 90; tx <= 275; tx += 2) {
      for (let ty = 640; ty <= 805; ty += 2) {
        const zp = window.__dev.zonetier({ zoneProbe: { tx, ty } }).zoneProbe;
        if (!zp) continue;
        const b = zp.band | 0, w = bandToW(b), rec = { tx, ty, zone: zp.zone, band: b, weight: zp.weight | 0 };
        if (w === 2) { if (!high) high = rec; else if (!high2 && zp.zone === high.zone && (tx !== high.tx || ty !== high.ty)) high2 = rec; }
        else if (w === 1 && !mid) mid = rec;
        else if (w === 0) { if (b === 1 && !initialForest) initialForest = rec; if (!initialAny) initialAny = rec; }
      }
    }
    return { initial: initialForest || initialAny, mid, high, high2 };
  }, CFG_ORACLE);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [], reqErr = [];
let TILES = null;
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.zonetier && window.__dev.affixSpawnKill &&
    window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.apex && window.__dev.scarcity));
  ok(`L1 boot LIVE a 'play'; build==version.json==${EXPECT_BUILD} (AVANZÓ del served previo ${PREV_LIVE}); hooks zonetier/affixSpawnKill/save/fp/apex/scarcity; 0 err/404`,
    build === EXPECT_BUILD && verJson.build === EXPECT_BUILD && hooks && errors.length === 0 && reqErr.length === 0,
    `build=${build} version.json=${verJson.build} hooks=${hooks} err=${errors.length} reqErr=${reqErr.length}`);

  // ---- L2 flag ON en prod (served config) ----
  const cfgSrc = await (await fetch(base + "/sim/config.js")).text().catch(() => "");
  const zBlock = cfgSrc.match(/export const ZONETIER_SURGE\s*=\s*\{[\s\S]*?\n\};/);
  const bt = zBlock ? zBlock[0] : "";
  const enabledOn = /enabled:\s*true/.test(bt);
  const chOk = /channel:\s*"tierFind"/.test(bt);
  const paramsOk = /hiTier:\s*4/.test(bt) && /midTier:\s*2/.test(bt) && /high:\s*2/.test(bt) &&
    /mid:\s*1/.test(bt) && /tierBountyCap:\s*2/.test(bt) && /radius:\s*300/.test(bt);
  ok("L2 flag ON en prod: served config ZONETIER_SURGE.enabled:true + channel tierFind + params (hiTier4/midTier2/high2/mid1/cap2/radius300)",
    enabledOn && chOk && paramsOk, `enabledOn=${enabledOn} channel=${chOk} params=${paramsOk}`);

  // ---- L3 LIVE default: VM enabled TRUE + gExists false (STATELESS) + knobs == oráculos ----
  const d0 = await page.evaluate(() => window.__dev.zonetier());
  const knobsOk = d0.enabled === true && d0.gExists === false && d0.channel === "tierFind" &&
    d0.hiTier === CFG_ORACLE.hiTier && d0.midTier === CFG_ORACLE.midTier &&
    d0.weights.high === CFG_ORACLE.weights.high && d0.weights.mid === CFG_ORACLE.weights.mid &&
    d0.cap === CFG_ORACLE.cap && d0.radius === 300 && JSON.stringify(d0.tiers) === JSON.stringify(CFG_ORACLE.tiers);
  ok("L3 LIVE default: __dev.zonetier().enabled===TRUE (flip aplicado) + gExists false (STATELESS, G.tierBounty null) + knobs servidos == oráculos re-derivados",
    knobsOk, `enabled=${d0.enabled} gExists=${d0.gExists} channel=${d0.channel} hiTier=${d0.hiTier} midTier=${d0.midTier} weights=${JSON.stringify(d0.weights)} cap=${d0.cap} radius=${d0.radius}`);

  // discover real zone tiles (WORLD-DEPENDENT, same seed)
  TILES = await discoverTiles(page);
  ok("L3b discover REAL zone tiles by scanning zoneProbe (WORLD-DEP, same seed): initial(band<midTier)/mid(band∈[2,3])/danger(band≥hiTier) + 2ª danger tile en MISMA zona",
    TILES.initial && TILES.mid && TILES.high && TILES.high2,
    `initial=${JSON.stringify(TILES.initial)} mid=${JSON.stringify(TILES.mid)} high=${JSON.stringify(TILES.high)} high2=${JSON.stringify(TILES.high2)}`);

  // ---- L4 PATH zoneProbe == oráculo re-derivado (WORLD-DEP) ----
  const zp = await page.evaluate((T) => {
    const rd = (t) => { const p = window.__dev.zonetier({ zoneProbe: { tx: t.tx, ty: t.ty } }).zoneProbe; return { zone: p.zone, band: p.band, weight: p.weight, forage: p.forage }; };
    return { initial: rd(T.initial), mid: rd(T.mid), high: rd(T.high) }; }, TILES);
  const pathOK =
    zp.initial.weight === oracleBandToW(zp.initial.band) && zp.initial.weight === 0 && zp.initial.forage === 0 &&
    zp.mid.weight === oracleBandToW(zp.mid.band) && zp.mid.weight === 1 && zp.mid.forage === oracleCharge(1) && zp.mid.forage === 1 &&
    zp.high.weight === oracleBandToW(zp.high.band) && zp.high.weight === 2 && zp.high.forage === oracleCharge(2) && zp.high.forage === 2;
  ok("L4 ★ PATH zoneProbe zoneOf→ZONE_TIER.tier→tierWeight→forage MATCHES oráculo re-derivado (WORLD-DEP, flag ON): initial⇒w0/f0, mid⇒w1/f1, danger⇒w2/f2",
    pathOK, JSON.stringify(zp));

  // ---- L5 LUT scoreProbe pura == oráculo, sub-cap ≤2 ----
  const lut = await page.evaluate(() => [0, 1, 2, 3, 9, 99].map(s => { const p = window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; }));
  const lutOK = lut.every(r => r.tier === oracleRank(r.score) && r.charge === oracleCharge(r.score) && r.charge <= 2);
  ok("L5 LUT scoreProbe score→tier→charge == oráculo re-derivado (world-indep, sub-cap≤2): 0→T0/0, 1→T1/1, 2→T2/2, 3/9/99→T2/2",
    lutOK, JSON.stringify(lut.map(r => [r.score, r.tier, r.charge])));

  // ---- L6 REAL server-auth spawnTier + tierProbe ----
  const real = await page.evaluate((T) => {
    const out = {};
    for (const [kind, tile] of [["danger", T.high], ["mid", T.mid], ["initial", T.initial]]) {
      window.__dev.zonetier({ clearTier: true });
      window.__dev.zonetier({ tp: { tx: tile.tx, ty: tile.ty } });
      const st = window.__dev.zonetier({ spawnTier: { tx: tile.tx, ty: tile.ty } }).spawnTier;
      const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
      out[kind] = { stBand: st.band, stW: st.weight, tpScore: tp.score, tpCount: tp.count, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "" };
      window.__dev.zonetier({ clearTier: true });
    }
    return out; }, TILES);
  const realOK =
    real.danger.stW === oracleBandToW(real.danger.stBand) && real.danger.stW === 2 && real.danger.tpW === 2 && real.danger.tpScore === 2 &&
    real.mid.stW === oracleBandToW(real.mid.stBand) && real.mid.stW === 1 && real.mid.tpW === 1 && real.mid.tpScore === 1 &&
    real.initial.stW === oracleBandToW(real.initial.stBand) && real.initial.stW === 0 && real.initial.tpW === 0 && real.initial.tpScore === 0;
  ok("L6 ★ REAL server-auth: spawnTier empuja un mob REAL a G.enemies en una tile REAL; tierProbe lee su zona/band/weight REALES ⇒ danger⇒2, mid⇒1, initial⇒0 (== oráculo band→w)",
    realOK, JSON.stringify(real));

  // ---- L7 REAL GRANT via real killEnemy (affixSpawnKill) sampled at LIVE kill pos ----
  const grant = await page.evaluate((T) => {
    const rdBounty = () => window.__dev.zonetier().hero.tierBounty | 0;
    const killAt = (tile) => { window.__dev.zonetier({ tp: { tx: tile.tx, ty: tile.ty } });
      const b0 = rdBounty(); window.__dev.affixSpawnKill(null, "skeleton", "field"); return rdBounty() - b0; };
    window.__dev.zonetier({ clearTier: true });
    const dDanger = killAt(T.high);       // kill en zona endgame ⇒ +2
    const dMid = killAt(T.mid);           // kill en ruinas/cuevas ⇒ +1
    const dInitial = killAt(T.initial);   // kill en zona inicial/segura ⇒ +0
    const finalBounty = rdBounty();
    window.__dev.zonetier({ clearTier: true });
    // repite el kill de peligro con flag OFF ⇒ Δ0 (rama muerta), luego restaura ON (LIVE default)
    window.__dev.zonetier({ enabled: false });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    const bOff0 = rdBounty(); window.__dev.affixSpawnKill(null, "skeleton", "field"); const dOff = rdBounty() - bOff0;
    window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true });
    return { dDanger, dMid, dInitial, finalBounty, dOff }; }, TILES);
  ok("L7 ★ REAL GRANT (real killEnemy via affixSpawnKill en LIVE kill pos): endgame⇒+2, ruins/caves⇒+1, initial⇒+0, acumula (2+1+0=3); flag OFF ⇒ Δ0 (rama muerta)",
    grant.dDanger === 2 && grant.dMid === 1 && grant.dInitial === 0 && grant.finalBounty === 3 && grant.dOff === 0, JSON.stringify(grant));

  // ---- L8 CRUX ⊥32 LIVE ----
  // ⊥#72 escasez: MISMA danger tile puntúa igual con 1 vs 5 mobs
  const scarcity = await page.evaluate((T) => {
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    const s1 = window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } }).spawnTier.weight;
    const p1 = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    for (let i = 0; i < 4; i++) window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });   // 5 total
    const p5 = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    window.__dev.zonetier({ clearTier: true });
    return { s1, score1: p1.score, count1: p1.count, score5: p5.score, count5: p5.count }; }, TILES);
  const scOK = scarcity.s1 === 2 && scarcity.score1 === 2 && scarcity.score5 === 2 && scarcity.count1 === 1 && scarcity.count5 === 5;

  // ⊥#70 firm-footing: 2 tiles distintas MISMA zona ⇒ MISMO band/weight (lee RECT, no material del tile)
  const footing = await page.evaluate((T) => {
    const a = window.__dev.zonetier({ zoneProbe: { tx: T.high.tx, ty: T.high.ty } }).zoneProbe;
    const b = window.__dev.zonetier({ zoneProbe: { tx: T.high2.tx, ty: T.high2.ty } }).zoneProbe;
    return { az: a.zone, aband: a.band, aw: a.weight, bz: b.zone, bband: b.band, bw: b.weight, distinct: (T.high.tx !== T.high2.tx || T.high.ty !== T.high2.ty) }; }, TILES);
  const ftOK = footing.distinct && footing.az === footing.bz && footing.aband === footing.bband && footing.aw === footing.bw && footing.aw === 2;

  // ⊥#88 remate & ⊥#90 heading: MISMA geometría pt-blank — mob en DANGER⇒2 vs mob en INITIAL⇒0 (la ZONA decide, no dist/dir)
  const geom = await page.evaluate((T) => {
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const pb = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const pbW = pb.mobs[0] ? pb.mobs[0].weight : -1;
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.initial.tx, ty: T.initial.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.initial.tx, ty: T.initial.ty } });
    const in0 = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const inW = in0.mobs[0] ? in0.mobs[0].weight : -1;
    window.__dev.zonetier({ clearTier: true });
    return { pbW, inW }; }, TILES);
  const geomOK = geom.pbW === 2 && geom.inW === 0;

  // ⊥#73 apex: mob SOLO en rincón peligro ⇒ weight 2 sin jefe cerca (apex peer signal 0)
  const apexCrux = await page.evaluate((T) => {
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const apx = window.__dev.apex ? window.__dev.apex() : null;
    window.__dev.zonetier({ clearTier: true });
    return { count: tp.count, w: tp.mobs[0] ? tp.mobs[0].weight : -1, apexScore: apx ? (apx.score | 0) : -1 }; }, TILES);
  const apOK = apexCrux.count === 1 && apexCrux.w === 2 && apexCrux.apexScore === 0;

  ok("L8 ★★ CRUX ⊥32 LIVE: ⊥#72 escasez (misma tile 1 vs 5 mobs⇒score2) · ⊥#70 firm-footing (2 tiles misma zona⇒mismo band, RECT no material) · ⊥#88/#90 (pt-blank abismo=2 vs prado=0) · ⊥#73 apex (mob solo rincón peligro=2 sin jefe)",
    scOK && ftOK && geomOK && apOK,
    `scarcity=${JSON.stringify(scarcity)} footing=${JSON.stringify(footing)} geom=${JSON.stringify(geom)} apex=${JSON.stringify(apexCrux)}`);

  // ---- L9 STATELESS: banca bounty via real kill, no en save, no en fp ----
  const stateless = await page.evaluate((T) => {
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.affixSpawnKill(null, "skeleton", "field");   // banca tierBounty via real kill
    const bounty = window.__dev.zonetier().hero.tierBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    // toggle OFF/ON debe dejar el fp byte-idéntico (tokens fuera del fp aun con flag LIVE)
    window.__dev.zonetier({ enabled: false });
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zonetier({ enabled: true });
    const fpOn2 = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zonetier({ clearTier: true });
    return { bounty, blobHasBounty: /tierBounty|tierFind/.test(blob), fpNeutral: fpAfter === fpOff && fpOff === fpOn2 }; }, TILES);
  ok("L9 STATELESS: h.tierBounty banca (>0) pero NO en save blob (tierBounty/tierFind ausentes) y NO en worldFingerprint (fp toggle-neutral ON/OFF/ON) ⇒ valor no persistido",
    stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpNeutral === true, JSON.stringify(stateless));

  // ---- L10 0-regresión LIVE: 33 flags served enabled:true + fps ----
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const ARC = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE","SKIRMISH_LINE_SURGE","CONTROL_HARVEST_SURGE","BLOODHARVEST_SURGE","PACKHARVEST_SURGE","LONGSHOT_SURGE","INTERRUPT_SURGE","HEADING_SURGE","ZONETIER_SURGE"];
  const off = ARC.filter(n => flag(n) !== "true");
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("L10 0-regresión LIVE: 33 flags served enabled:true (32 previas #59-#90 + ZONETIER_SURGE #91) + core loop fps≥55",
    off.length === 0 && ARC.length === 33 && fps >= 55, `n=${ARC.length} off=${JSON.stringify(off)} ZONETIER=${flag("ZONETIER_SURGE")} fps=${fps}`);

  // shot evidencia (mob en zona peligrosa, badge ◈ ON)
  await page.evaluate((T) => { window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } }); window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } }); }, TILES);
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.zonetier({ clearTier: true }); });

  // ---- L11 ★ NORTH STAR 2-cliente 0-desync LIVE ----
  const readVM = async (pg) => await pg.evaluate((T) => {
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });   // mob en zona peligrosa ⇒ score2/T2
    const vm = window.__dev.zonetier();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const zp = window.__dev.zonetier({ zoneProbe: { tx: T.high.tx, ty: T.high.ty } }).zoneProbe;
    const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.zonetier({ clearTier: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, tpCount: tp.count,
      tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "",
      zpZone: zp.zone, zpBand: zp.band, zpW: zp.weight, lut: JSON.stringify(lut), fp, fpLen: fp.length, terrHash: fpObj.terrHash }; }, TILES);
  const A = await readVM(page);
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("B:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("B:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();   // 2ª pág DEBE estar al frente antes de bootear (headless throttla rAF en 2º plano ⇒ boot cuelga)
  await toPlay(page2);
  const TILES2 = await discoverTiles(page2);   // re-descubrir en cliente B (mismo seed ⇒ mismas tiles)
  const B = await page2.evaluate((T) => {
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const vm = window.__dev.zonetier();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const zp = window.__dev.zonetier({ zoneProbe: { tx: T.high.tx, ty: T.high.ty } }).zoneProbe;
    const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const fpObj = window.__dev.worldFingerprint(393);
    const fp = JSON.stringify(fpObj);
    window.__dev.zonetier({ clearTier: true });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, tpCount: tp.count,
      tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "",
      zpZone: zp.zone, zpBand: zp.band, zpW: zp.weight, lut: JSON.stringify(lut), fp, fpLen: fp.length, terrHash: fpObj.terrHash }; }, TILES2);
  const tilesMatch = JSON.stringify(TILES.high) === JSON.stringify(TILES2.high);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore &&
    A.tpCount === B.tpCount && A.tpW === B.tpW && A.tpZone === B.tpZone && A.zpZone === B.zpZone &&
    A.zpBand === B.zpBand && A.zpW === B.zpW && A.lut === B.lut && A.fp === B.fp;
  ok("L11 ★ NORTH STAR 2-CLIENTE 0-desync LIVE: MISMAS tiles descubiertas + A==B (score/tier/charge + tierProbe + zoneProbe + LUT + worldFingerprint byte-idénticos), mob-en-peligro⇒score2/T2/charge2",
    tilesMatch && conv && A.score === 2 && A.tier === 2 && A.charge === 2,
    `A={s:${A.score},t:${A.tier},c:${A.charge},tpW:${A.tpW},zpZone:${A.zpZone},zpBand:${A.zpBand},fpLen:${A.fpLen}} B={s:${B.score},t:${B.tier},c:${B.charge},tpW:${B.tpW},zpBand:${B.zpBand},fpLen:${B.fpLen}} tilesMatch=${tilesMatch} fpMatch=${A.fp === B.fp}`);
  ok(`L11b ★ North Star fp observado (worldFingerprint length) == esperado ${EXPECT_FP} + terrHash ${EXPECT_TERRHASH}, A==B (mundo determinista compartido LIVE)`,
    A.fpLen === EXPECT_FP && B.fpLen === EXPECT_FP && A.terrHash === EXPECT_TERRHASH && B.terrHash === EXPECT_TERRHASH,
    `A.fpLen=${A.fpLen} B.fpLen=${B.fpLen} A.terrHash=${A.terrHash} B.terrHash=${B.terrHash}`);
  await page2.screenshot({ path: join(OUT, "client-b-zonetier.png") });

  ok("L0 no JS errors / 0 req-fail durante el run (ambos clientes)", errors.length === 0 && reqErr.length === 0, `err=${errors.length} reqErr=${reqErr.length}${errors.length ? " :: " + errors.slice(0, 3).join(" | ") : ""}`);

  console.log("\n" + results.join("\n"));
  console.log(`\nfp observado=${A.fpLen} (esperado ${EXPECT_FP}) · terrHash=${A.terrHash} (esperado ${EXPECT_TERRHASH}) · 2-cli fpMatch=${A.fp === B.fp} · served build=${build} · flag ON=${d0.enabled} · grant danger/mid/initial=${grant.dDanger}/${grant.dMid}/${grant.dInitial}`);
} catch (e) {
  FAIL++;
  results.push("❌ harness exception — " + String(e && e.stack || e));
  console.log("\n" + results.join("\n"));
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n=== CAS-2545 QA LIVE observable (ZONETIER_SURGE #91): ${PASS}/${PASS + FAIL} PASS ===`);
console.log(FAIL === 0 ? "VERDICT: PASS" : "VERDICT: FAIL");
process.exit(FAIL === 0 ? 0 : 1);
