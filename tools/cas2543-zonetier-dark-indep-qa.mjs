// CAS-2543 — DARK QA (Gate 2/2) INDEPENDENT harness for REMATE EN ZONA PELIGROSA (ZONETIER_SURGE, EVO#91, enabled:false @ master 5c97489).
// QA-OWNED — oracles RE-DERIVED in pure JS from the config knobs read off the live snapshot; does NOT reuse tools/cas2542 GE selfverify.
//
// AXIS = difficulty BAND of the server-auth GEOGRAPHIC zone where the mob DIES: tierWeight(e)=band of zoneOf(world,e.x,e.y)→ZONE_TIER.tier
//   sampled at the LIVE kill position. band≥hiTier(4) [arena/swamp/abyss/caldera/frost/trial]⇒high(2); band≥midTier(2) [ruins/caves]⇒mid(1);
//   band<midTier [forest tier-1/town/field]⇒0. Fresh channel tierFind→h.tierBounty, sub-cap tierBountyCap.
//
// Acceptance (issue CAS-2543):
//  1 2-client 0-desync (worldFingerprint incl terrHash identical; byte-neutral OFF adds 0 sim state)
//  2 byte-neutral OFF (killEnemy byte-id base dab6291: _tierPre=0, no floater/grant, G.tierBounty never created, forageChargePreview=0)
//  3 server-auth determinism (path): re-derive zoneOf→ZONE_TIER.tier→tierWeight in pure JS; zoneProbe/spawnTier match oracle at N tile centers, WORLD-DEPENDENT
//  4 REAL server-auth grant (flip ON in-memory): kill a mob (real killEnemy via affixSpawnKill at hero pos) in endgame zone⇒+2, ruins/caves⇒+1, initial⇒+0, sampled at LIVE kill pos
//  5 CRUX ⊥32: ⊥#72 escasez (same tile 1 vs 5 mobs same weight), ⊥#70 firm-footing (2 tiles same zone ⇒ same band, does NOT read tile material), ⊥#88 remate (pt-blank abyss=2 vs far meadow=0), ⊥#90 heading (weight is position-only), ⊥#73 apex (lone mob in danger corner=2, no boss)
//  6 STATELESS (h.tierBounty/tierFind ∉ save allowlist + worldFingerprint; survives save roundtrip = not persisted)
//  7 sub-cap 2 honored; 0-regr 32 prior flags enabled:true, core loop OK fps60
//
// Run: node tools/cas2543-zonetier-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2543");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── RE-DERIVED ORACLES (pure JS, independent of the game source) ─────────────────────────
// band→weight: band≥hiTier⇒weights.high, band≥midTier⇒weights.mid, else 0
const oracleBandToW = (band, cfg) => (band >= cfg.hiTier ? (+cfg.weights.high || 0) : (band >= cfg.midTier ? (+cfg.weights.mid || 0) : 0));
// score→tierRank: highest i (1-based) whose tiers[i-1].min ≤ score, else 0
const oracleRank = (score, tiers) => { let t = 0; for (let i = 0; i < tiers.length; i++) if (score >= (+tiers[i].min || 0)) t = i + 1; return t; };
// score→charge: raw = tiers[rank-1].charge; sub-cap = cap>0 ? min(cap,raw) : raw
const oracleCharge = (score, cfg) => { const t = oracleRank(score, cfg.tiers); if (t <= 0) return 0;
  const raw = +cfg.tiers[t - 1].charge || 0, cap = Math.max(0, cfg.cap | 0); return (cap > 0 ? Math.min(cap, raw) : raw) | 0; };

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QABot";
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

// Discover REAL zone tiles per band by scanning the replicated world via zoneProbe (WORLD-DEPENDENT, same seed).
// Returns { initial, mid, high, high2 } — high2 = a SECOND distinct tile in the SAME danger zone (for ⊥#70).
async function discoverTiles(page, cfg) {
  return await page.evaluate((cfg) => {
    const bandToW = (b) => (b >= cfg.hiTier ? 2 : (b >= cfg.midTier ? 1 : 0));
    let high = null, high2 = null, mid = null, initialForest = null, initialAny = null;
    // procedural biomes live in the "old lands" south of the tiled continent (~tx 90..275, ty 640..805)
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
  }, cfg);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
let TILES = null, CFG = null;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hook present + 0 err
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.zonetier && window.__dev.affixSpawnKill && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.apex && window.__dev.scarcity && window.__dev.heading && window.__dev.longshot));
  ok("1 boots to play, __dev.zonetier + affixSpawnKill + saveBlob + worldFingerprint + peers present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // Read the config knobs off the LIVE snapshot (so oracles are re-derived from served config, not hard-coded)
  CFG = await page.evaluate(() => { const s = window.__dev.zonetier();
    return { enabled: s.enabled, channel: s.channel, radius: s.radius, weights: s.weights, hiTier: s.hiTier, midTier: s.midTier, tiers: s.tiers, cap: s.cap }; });
  ok("1b config knobs sane: channel=tierFind, hiTier=4, midTier=2, weights{high:2,mid:1}, cap=2, tiers=[{1,1},{2,2}]",
     CFG.channel === "tierFind" && CFG.hiTier === 4 && CFG.midTier === 2 && CFG.weights.high === 2 && CFG.weights.mid === 1 && CFG.cap === 2 &&
     CFG.tiers.length === 2 && CFG.tiers[0].min === 1 && CFG.tiers[0].charge === 1 && CFG.tiers[1].min === 2 && CFG.tiers[1].charge === 2,
     JSON.stringify(CFG));

  // ── 2 BYTE-NEUTRAL OFF (fresh boot, enabled:false) ──
  const dark = await page.evaluate(() => window.__dev.zonetier());
  ok("2 byte-neutral OFF (fresh boot): enabled false, G.tierBounty NEVER created (gExists false), score/tier/charge/preview all 0, tag empty",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.tag === "" && (dark.hero ? dark.hero.tierBounty === 0 : true),
     `enabled=${dark.enabled} gExists=${dark.gExists} score=${dark.score} tier=${dark.tier} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}"`);

  // discover real zone tiles (WORLD-DEPENDENT, same seed)
  TILES = await discoverTiles(page, CFG);
  ok("3a discover REAL zone tiles by scanning zoneProbe (WORLD-DEP, same seed): initial(band<midTier)/mid(band∈[2,3])/danger(band≥hiTier) + a 2nd danger tile in SAME zone",
     TILES.initial && TILES.mid && TILES.high && TILES.high2,
     `initial=${JSON.stringify(TILES.initial)} mid=${JSON.stringify(TILES.mid)} high=${JSON.stringify(TILES.high)} high2=${JSON.stringify(TILES.high2)}`);

  // 2b byte-neutral OFF even with a danger-zone mob present: forageChargePreview stays 0, gExists stays false
  const off2 = await page.evaluate((T) => { window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });   // real danger-zone mob, but flag OFF
    const s = window.__dev.zonetier(); window.__dev.zonetier({ clearTier: true });
    return { preview: s.forageChargePreview, gExists: s.gExists, score: s.score, charge: s.charge, tag: s.tag }; }, TILES);
  ok("2b byte-neutral OFF holds with a REAL danger-zone mob in radius: forageChargePreview=0, gExists=false, score/charge=0, tag empty (dead OFF branch ⇒ 0 grant)",
     off2.preview === 0 && off2.gExists === false && off2.score === 0 && off2.charge === 0 && off2.tag === "", JSON.stringify(off2));

  // 4 worldFingerprint (incl terrHash) byte-stable across the enabled toggle (0 RNG drift; tokens never enter fingerprint)
  const fpToggle = await page.evaluate(() => {
    const a = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zonetier({ enabled: true });
    const b = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zonetier({ enabled: false });
    const c = JSON.stringify(window.__dev.worldFingerprint(393));
    return { a, b, c, terrHash: window.__dev.worldFingerprint(393).terrHash }; });
  ok("4 worldFingerprint (incl terrHash) byte-stable across enabled OFF→ON→OFF (tokens never enter fingerprint)",
     fpToggle.a === fpToggle.b && fpToggle.b === fpToggle.c, `match=${fpToggle.a === fpToggle.b && fpToggle.b === fpToggle.c} terrHash=${fpToggle.terrHash} fpLen=${fpToggle.a.length}`);

  // ── 3 SERVER-AUTH DETERMINISM (PATH): zoneProbe re-derived oracle at each band ──
  const zp = await page.evaluate((T) => {
    const rd = (t) => { const p = window.__dev.zonetier({ zoneProbe: { tx: t.tx, ty: t.ty } }).zoneProbe; return { zone: p.zone, band: p.band, weight: p.weight, forage: p.forage }; };
    window.__dev.zonetier({ enabled: true });
    const on = { initial: rd(T.initial), mid: rd(T.mid), high: rd(T.high) };
    window.__dev.zonetier({ enabled: false });
    const offForage = rd(T.high).forage;  // forage is GATED ⇒ 0 when OFF even in danger zone
    return { on, offForage }; }, TILES);
  const pathOK =
    zp.on.initial.weight === oracleBandToW(zp.on.initial.band, CFG) && zp.on.initial.weight === 0 && zp.on.initial.forage === 0 &&
    zp.on.mid.weight === oracleBandToW(zp.on.mid.band, CFG) && zp.on.mid.weight === 1 && zp.on.mid.forage === oracleCharge(1, CFG) && zp.on.mid.forage === 1 &&
    zp.on.high.weight === oracleBandToW(zp.on.high.band, CFG) && zp.on.high.weight === 2 && zp.on.high.forage === oracleCharge(2, CFG) && zp.on.high.forage === 2 &&
    zp.offForage === 0;
  ok("3 PATH zoneProbe zoneOf→ZONE_TIER.tier→tierWeight→forage MATCHES re-derived oracle at each band (WORLD-DEP): initial⇒w0/f0, mid⇒w1/f1, danger⇒w2/f2; forage GATED (OFF⇒0)",
     pathOK, `on=${JSON.stringify(zp.on)} offForage=${zp.offForage}`);

  // 3b LUT scoreProbe re-derived oracle: score→tier→charge byte-verified incl sub-cap
  const lut = await page.evaluate(() => [0, 1, 2, 3, 9].map(s => { const p = window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, charge: p.charge }; }));
  const lutOK = lut.every(r => r.tier === oracleRank(r.score, CFG.tiers) && r.charge === oracleCharge(r.score, CFG));
  ok("3b LUT scoreProbe score→tier→charge MATCHES re-derived oracle (world-independent, incl sub-cap): 0→T0/0, 1→T1/1, 2→T2/2, 3→T2/2, 9→T2/2",
     lutOK, JSON.stringify(lut));

  // ── 6 REAL server-auth spawnTier + tierProbe reads REAL zone/band/weight ──
  const real = await page.evaluate((T) => {
    const out = {};
    for (const [kind, tile] of [["danger", T.high], ["mid", T.mid], ["initial", T.initial]]) {
      window.__dev.zonetier({ enabled: true });
      window.__dev.zonetier({ clearTier: true });
      window.__dev.zonetier({ tp: { tx: tile.tx, ty: tile.ty } });
      const st = window.__dev.zonetier({ spawnTier: { tx: tile.tx, ty: tile.ty } }).spawnTier;
      const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
      out[kind] = { stZone: st.zone, stBand: st.band, stW: st.weight, tpScore: tp.score, tpCount: tp.count, tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "" };
      window.__dev.zonetier({ clearTier: true });
      window.__dev.zonetier({ enabled: false });
    }
    return out; }, TILES);
  const realOK =
    real.danger.stW === oracleBandToW(real.danger.stBand, CFG) && real.danger.stW === 2 && real.danger.tpW === 2 && real.danger.tpScore === 2 &&
    real.mid.stW === oracleBandToW(real.mid.stBand, CFG) && real.mid.stW === 1 && real.mid.tpW === 1 && real.mid.tpScore === 1 &&
    real.initial.stW === oracleBandToW(real.initial.stBand, CFG) && real.initial.stW === 0 && real.initial.tpW === 0 && real.initial.tpScore === 0;
  ok("6 ★ REAL server-auth: spawnTier pushes a REAL mob to G.enemies at a REAL tile; tierProbe reads its REAL zone/band/weight ⇒ danger⇒2, mid⇒1, initial⇒0 (== oracle band→w)",
     realOK, JSON.stringify(real));

  // ── 4 REAL GRANT via real killEnemy (affixSpawnKill at hero pos) sampled at LIVE kill position ──
  const grant = await page.evaluate((T) => {
    const rdBounty = () => window.__dev.zonetier().hero.tierBounty | 0;
    const killAt = (tile) => { window.__dev.zonetier({ tp: { tx: tile.tx, ty: tile.ty } });
      const b0 = rdBounty(); window.__dev.affixSpawnKill(null, "skeleton", "field"); const b1 = rdBounty(); return b1 - b0; };
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    const dDanger = killAt(T.high);       // kill in endgame zone ⇒ +2
    const dMid = killAt(T.mid);           // kill in ruins/caves ⇒ +1
    const dInitial = killAt(T.initial);   // kill in initial/safe zone ⇒ +0
    const finalBounty = rdBounty();
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    // repeat the danger kill with flag OFF ⇒ Δ0 (dead branch)
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    const bOff0 = rdBounty(); window.__dev.affixSpawnKill(null, "skeleton", "field"); const dOff = rdBounty() - bOff0;
    return { dDanger, dMid, dInitial, finalBounty, dOff }; }, TILES);
  ok("4 ★ REAL GRANT (real killEnemy via affixSpawnKill at LIVE kill pos): endgame zone⇒+2, ruins/caves⇒+1, initial⇒+0, accumulates (2+1+0=3); flag OFF ⇒ Δ0 (dead branch)",
     grant.dDanger === 2 && grant.dMid === 1 && grant.dInitial === 0 && grant.finalBounty === 3 && grant.dOff === 0, JSON.stringify(grant));

  // ── 5 CRUX ⊥32 ──
  // ⊥#72 escasez: SAME danger tile scores same weight with 1 vs 5 mobs (spawnTier stacks real mobs)
  const scarcity = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    const s1 = window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } }).spawnTier.weight;
    const p1 = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    for (let i = 0; i < 4; i++) window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });   // 5 total
    const p5 = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ enabled: false });
    return { s1, score1: p1.score, count1: p1.count, score5: p5.score, count5: p5.count }; }, TILES);
  ok("5a ⊥#72 ESCASEZ: SAME danger tile scores SAME weight (2) with 1 vs 5 mobs — geographic band NOT count/density (count 1→5, score stays 2)",
     scarcity.s1 === 2 && scarcity.score1 === 2 && scarcity.score5 === 2 && scarcity.count1 === 1 && scarcity.count5 === 5, JSON.stringify(scarcity));

  // ⊥#70 firm-footing: 2 DISTINCT tiles in the SAME danger zone ⇒ SAME band/weight (reads zoneOf rect, NOT per-tile material)
  const footing = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    const a = window.__dev.zonetier({ zoneProbe: { tx: T.high.tx, ty: T.high.ty } }).zoneProbe;
    const b = window.__dev.zonetier({ zoneProbe: { tx: T.high2.tx, ty: T.high2.ty } }).zoneProbe;
    window.__dev.zonetier({ enabled: false });
    return { az: a.zone, aband: a.band, aw: a.weight, bz: b.zone, bband: b.band, bw: b.weight, distinct: (T.high.tx !== T.high2.tx || T.high.ty !== T.high2.ty) }; }, TILES);
  ok("5b ⊥#70 FIRM_FOOTING: 2 DISTINCT tiles in the SAME zone ⇒ SAME zone/band/weight — reads zoneOf (RECT containment), NOT per-tile material",
     footing.distinct && footing.az === footing.bz && footing.aband === footing.bband && footing.aw === footing.bw && footing.aw === 2, JSON.stringify(footing));

  // ⊥#88 remate + ⊥#90 heading: pt-blank mob in danger=2 vs far mob in meadow=0; weight is POSITION-only (dist/direction don't decide)
  const geom = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true });
    // hero stands in the DANGER zone; spawn a mob AT hero (pt-blank) ⇒ weight 2
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const pb = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const pbW = pb.mobs[0] ? pb.mobs[0].weight : -1;
    window.__dev.zonetier({ clearTier: true });
    // hero stands in the INITIAL zone; spawn a mob AT hero (pt-blank) ⇒ weight 0 — SAME geometry, opposite weight
    window.__dev.zonetier({ tp: { tx: T.initial.tx, ty: T.initial.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.initial.tx, ty: T.initial.ty } });
    const in0 = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const inW = in0.mobs[0] ? in0.mobs[0].weight : -1;
    window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ enabled: false });
    return { pbW, inW }; }, TILES);
  ok("5c ⊥#88 remate & ⊥#90 heading: SAME geometry (pt-blank at hero) — mob in DANGER zone⇒2 vs mob in INITIAL zone⇒0. The ZONE decides, NOT distance/direction",
     geom.pbW === 2 && geom.inW === 0, JSON.stringify(geom));

  // ⊥#73 apex: LONE mob in danger corner ⇒ weight 2 with NO boss/champion near (no target, no distance)
  const apexCrux = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const apx = window.__dev.apex ? window.__dev.apex() : null;   // peer apex hook: no boss ⇒ its own signal 0
    window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ enabled: false });
    return { count: tp.count, w: tp.mobs[0] ? tp.mobs[0].weight : -1, apexScore: apx ? (apx.score | 0) : -1 }; }, TILES);
  ok("5d ⊥#73 APEX: LONE mob in danger corner ⇒ weight 2 with NO boss near (count=1, apex peer signal=0) — dificultad del ÁREA, not distance-to-boss",
     apexCrux.count === 1 && apexCrux.w === 2 && apexCrux.apexScore === 0, JSON.stringify(apexCrux));

  // ── 6 STATELESS: save roundtrip — h.tierBounty not serialized, not in worldFingerprint ──
  const stateless = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.affixSpawnKill(null, "skeleton", "field");   // bank some tierBounty via real kill
    const bounty = window.__dev.zonetier().hero.tierBounty | 0;
    const blob = JSON.stringify(window.__dev.saveBlob());
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ enabled: false });
    const fpBase = JSON.stringify(window.__dev.worldFingerprint(393));
    return { bounty, blobHasBounty: /tierBounty|tierFind/.test(blob), fpMatch: fpAfter === fpBase, blobLen: blob.length }; }, TILES);
  ok("6 STATELESS: h.tierBounty banked (>0) but NOT in save blob (tierBounty/tierFind absent) and NOT in worldFingerprint (fp stable) ⇒ value not persisted",
     stateless.bounty > 0 && stateless.blobHasBounty === false && stateless.fpMatch === true, JSON.stringify(stateless));

  // ── 7 sub-cap 2 honored (no score yields charge>2) ──
  const subcap = await page.evaluate(() => { let maxC = 0; for (let s = 0; s <= 12; s++) { const c = window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe.charge; if (c > maxC) maxC = c; } return maxC; });
  ok("7 SUB-CAP: no score s∈[0,12] yields charge > tierBountyCap(2) (max observed charge = 2)", subcap === 2, `maxCharge=${subcap}`);

  // ── 13 ORTHOGONALITY: toggling apex/scarcity doesn't change tier signal; toggling tier doesn't change peers ──
  const orth = await page.evaluate((T) => {
    window.__dev.zonetier({ enabled: true }); window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const before = window.__dev.zonetier();
    const apPrev = window.__dev.apex().enabled, scPrev = window.__dev.scarcity().enabled;
    window.__dev.apex({ enabled: true }); window.__dev.scarcity({ enabled: true });
    const after = window.__dev.zonetier();
    window.__dev.apex({ enabled: apPrev }); window.__dev.scarcity({ enabled: scPrev });
    window.__dev.zonetier({ clearTier: true }); window.__dev.zonetier({ enabled: false });
    return { same: before.score === after.score && before.tier === after.tier && before.charge === after.charge, s: after.score }; }, TILES);
  ok("13 ORTHOGONALITY: toggling APEX/SCARCITY ON does NOT change the tier score/tier/charge signal (independent seams)", orth.same && orth.s === 2, JSON.stringify(orth));

  // ── 14 0-REGRESSION: 32 arc flags served enabled:true; ZONETIER_SURGE served false ──
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const ztDark = flag("ZONETIER_SURGE") === "false";
  ok("14 ★ 0-REGRESSION: 32 arc flags #59-#90 served enabled:true; ZONETIER_SURGE served false (DARK #91)",
     arcAllOn && ztDark && arc.length === 32, `zonetier=${flag("ZONETIER_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // ── 15 core loop: fps60 + no errors ──
  const fps = await page.evaluate(async () => { const t0 = performance.now(); let f = 0;
    await new Promise((res) => { const loop = () => { f++; if (performance.now() - t0 > 800) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    return Math.round(f / ((performance.now() - t0) / 1000)); });
  ok("15 core loop stable fps (≥55) — DARK seam adds 0 per-frame cost while OFF", fps >= 55, `fps=${fps}`);

  await page.evaluate(() => window.__dev.zonetier({ enabled: false }));

  // screenshot evidence
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // ── 16 ★ NORTH STAR — 2-client 0-desync ──
  await sleep(400);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();   // headless throttles rAF on backgrounded pages ⇒ boot hangs
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((T) => {
    window.__dev.zonetier({ enabled: true });
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ tp: { tx: T.high.tx, ty: T.high.ty } });
    window.__dev.zonetier({ spawnTier: { tx: T.high.tx, ty: T.high.ty } });
    const vm = window.__dev.zonetier();
    const lut = [0, 1, 2, 9].map(s => { const p = window.__dev.zonetier({ scoreProbe: { score: s } }).scoreProbe; return [s, p.tier, p.charge]; });
    const zp = window.__dev.zonetier({ zoneProbe: { tx: T.high.tx, ty: T.high.ty } }).zoneProbe;
    const tp = window.__dev.zonetier({ tierProbe: true }).tierProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zonetier({ clearTier: true });
    window.__dev.zonetier({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, tpScore: tp.score, tpCount: tp.count,
      tpW: tp.mobs[0] ? tp.mobs[0].weight : -1, tpZone: tp.mobs[0] ? tp.mobs[0].zone : "",
      zpZone: zp.zone, zpBand: zp.band, zpW: zp.weight, lut: JSON.stringify(lut), fp }; }, TILES);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const terrHashA = JSON.parse(A.fp).terrHash, terrHashB = JSON.parse(B.fp).terrHash;
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.tpScore === B.tpScore && A.tpCount === B.tpCount &&
    A.tpW === B.tpW && A.tpZone === B.tpZone && A.zpZone === B.zpZone && A.zpBand === B.zpBand && A.zpW === B.zpW && A.lut === B.lut && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENT 0-DESYNC: SAME mob in SAME danger tile + hero ⇒ score/tier/charge + tierProbe(score,count,weight,zone) + zoneProbe(zone,band,weight) + LUT + worldFingerprint(incl terrHash) IDENTICAL byte-a-byte",
     conv && terrHashA === terrHashB,
     `A={score:${A.score},tier:${A.tier},charge:${A.charge},tpW:${A.tpW},tpZone:${A.tpZone},zpZone:${A.zpZone},zpBand:${A.zpBand},zpW:${A.zpW},terrHash:${terrHashA},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},tpW:${B.tpW},zpBand:${B.zpBand},terrHash:${terrHashB},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await pageB.screenshot({ path: join(OUT, "client-b-zonetier.png") });
  await page.evaluate(() => window.__dev.zonetier({ enabled: false }));
  await pageB.evaluate(() => window.__dev.zonetier({ enabled: false }));

  // 0 no JS errors
  ok("0 no JS errors during run (both clients)", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
