// CAS-2377 — QA INDEPENDIENTE (observable DARK) para SENDERO / TRAILCRAFT (TRAILCRAFT.enabled:false). EVO mecánica #63.
// Harness QA PROPIO (NO reusa el del GE): reloj QA distinto (QNOW=7_310_000), BIOMAS/PIDS RE-ETIQUETADOS (mesa/dune/glade/fen, qSelf/qA/qB) y
// ORÁCULOS RE-DERIVADOS en Node — trailVariety reimplementada de cero (cuenta TIPOS de bioma DISTINTOS en ventana), tier = índice del tier más alto
// cuyo min≤craft, steps = tiers[t-1].steps, floor = bumpRarity("common",steps) sobre RARITY_ORDER, decay = base·0.5^(dt/hl) cap capCraft.
// Los oráculos NO leen el VM del sim: se cruzan CONTRA él (el sim es la autoridad server-authoritative).
//
// Eje FRESCO = DIVERSIDAD DE TERRENO (variedad CUALITATIVA): nº de TIPOS de bioma DISTINTOS pisados (zoneOf) en una ventana deslizante, per-pid.
// Canal FRESCO = lootQuality (RAREZA/calidad del drop, NO oro): con sendero abierto sube el piso `minR` de rollGearInst en el drop de killEnemy.
//
// ★ DIFERENCIADORES (ortogonalidad): OPUESTO a WAYFARER_ROAM #61 (amplitud/celdas) — vueltas en 1 bioma (muchas celdas) ⇒ variety 1 ⇒ NUNCA abre;
//   cruzar biomas DISTINTOS ⇒ ABRE. 1 marca ⇒ variety 1 (NO abre); N marcas MISMO bioma ⇒ variety 1; 1-tick dt=0.5 con variety≥2 ⇒ craft≈0.5 < 2 ⇒ T0 (permanencia).
// ★ ORTOGONALIDAD 5 canales: lootQuality (RAREZA) ⊥ goldFind (oro, Kinship/Focus) ⊥ restedMult (XP, Convoy) ⊥ wardRegen (HP, Ward) ⊥ oocMitigation (Wayfarer).
// ★ NORTH STAR 2-CLIENTE: 2 páginas puppeteer independientes, MISMO snapshot {pid→{craft,atMs}} + MISMO reloj ⇒ craft/tier/steps/floor byte-idénticos per-pid;
//   A sale de zona ⇒ floor "" (Δ_A=0, zone-gate) PERO craft server-auth (craftMap) + Δ_B INTACTOS (0 desync).
// ★ CANAL lootQuality byte-neutro: lootTick seed-fijo OFF ⇒ floorRarity==baseRarity (byte-id vs HEAD); sendero abierto ⇒ floorRarity≥baseRarity y ≥ el piso del tier.
// Run: node tools/cas2377-trailcraft-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2377-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── ORÁCULOS QA re-derivados en Node (NO leen el VM; se cruzan CONTRA él, la autoridad) ─────────────────
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];
const rarityRank = (r) => { const i = RARITY_ORDER.indexOf(r); return i < 0 ? 0 : i; };
// variety = nº de TIPOS de bioma DISTINTOS (m.b, no vacío) con t dentro de [now-win, now]. Reimplementación INDEPENDIENTE de trailVariety.
const oracleVariety = (marks, now, windowMs) => {
  if (!Array.isArray(marks) || !marks.length) return 0;
  const lo = (+now || 0) - Math.max(0, +windowMs || 0), hi = (+now || 0);
  const seen = new Set();
  for (const m of marks) { if (!m) continue; const t = +m.t || 0; if (t < lo || t > hi) continue; const k = String(m.b); if (k === "") continue; seen.add(k); }
  return seen.size;
};
const oracleTier = (craft, tiers) => { let idx = 0; for (let i = 0; i < tiers.length; i++) if ((+craft || 0) >= (+tiers[i].min || 0)) idx = i + 1; return idx; };
const oracleSteps = (craft, tiers) => { const t = oracleTier(craft, tiers); return t > 0 ? (tiers[t - 1].steps | 0) : 0; };
const oracleFloor = (craft, tiers) => { const s = oracleSteps(craft, tiers); return s > 0 ? RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, 0 + s)] : ""; };
const oracleDecay = (base, dtSec, hlSec, cap) => { const w = base * Math.pow(0.5, dtSec / hlSec); return cap > 0 ? Math.min(cap, w) : w; };
// craft acumulado = accruePerSec·dt SI variety≥minVariety, si no 0 (desde limpio)
const oracleAccrue = (marks, now, win, dt, accruePerSec, minVariety) => (oracleVariety(marks, now, win) >= minVariety ? accruePerSec * dt : 0);

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 20000 });
  await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QALead";
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

// ── BIOMAS QA re-etiquetados (labels de variedad ≠ los del GE) — trailVariety cuenta strings distintos ────────────────────
const QNOW = 7310000;   // reloj de pared QA FIJO (≠ 8_720_000 del GE) — proyección determinista, mismo en ambos clientes
// marks re-etiquetados (b = bioma, t relativo a QNOW). variety = nº de b DISTINTOS no-vacíos en ventana.
const M = {
  empty: [],
  one:   [{ b: "mesa", t: QNOW }],                                                                       // 1 marca ⇒ variety 1 (NO abre)
  same4: [{ b: "dune", t: QNOW - 4000 }, { b: "dune", t: QNOW - 3000 }, { b: "dune", t: QNOW - 2000 }, { b: "dune", t: QNOW - 1000 }], // 4 marcas MISMO bioma (vueltas) ⇒ variety 1 (OPUESTO Wayfarer)
  four:  [{ b: "mesa", t: QNOW - 3000 }, { b: "dune", t: QNOW - 2000 }, { b: "glade", t: QNOW - 1000 }, { b: "fen", t: QNOW }], // 4 biomas distintos ⇒ variety 4
  three: [{ b: "mesa", t: QNOW - 2000 }, { b: "dune", t: QNOW - 1000 }, { b: "glade", t: QNOW }],        // 3 biomas distintos ⇒ variety 3
  stale: [{ b: "mesa", t: QNOW - 999000 }, { b: "dune", t: QNOW }],                                       // 1 fuera de ventana ⇒ sólo cuenta 1 ⇒ variety 1
  blank: [{ b: "", t: QNOW }, { b: "mesa", t: QNOW }],                                                     // bioma "" ⇒ no cuenta ⇒ variety 1
};

async function installQA(page) {
  await page.evaluate((QNOW) => {
    window.__TNOW = QNOW;
    // empuja craft crudo de UN pid (CLEAR antes ⇒ atMs=QNOW ⇒ dtMs=0 ⇒ craft == base exacto)
    window.__tsnap = (pid, craft) => { window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW }); window.__dev.trailcraft({ self: pid, nowMs: window.__TNOW, push: { [pid]: { craft, atMs: window.__TNOW } } }); };
    // proyecta (re-tick) a QNOW+elapsedSec con push atMs=QNOW ⇒ decay determinista
    window.__tat = (pid, craft, elapsedSec, zone) => { window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW }); return window.__dev.trailcraft({ self: pid, nowMs: window.__TNOW + (elapsedSec || 0) * 1000, push: { [pid]: { craft, atMs: window.__TNOW } }, toZone: zone }); };
    // fija marcas crudas + un STEP dt ⇒ acumula accruePerSec·dt si variety≥minVariety (desde limpio)
    window.__tstep = (pid, marks, dt) => { window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW }); window.__dev.trailcraft({ self: pid, nowMs: window.__TNOW, marks: { [pid]: marks } }); window.__dev.trailcraft({ nowMs: window.__TNOW, step: { [pid]: { dt } } }); };
    // encuentra la 1ª zona de caza donde el héroe cae DENTRO; fija self=pid, empuja craft, teleporta
    window.__tpick = (pid, craft) => {
      window.__dev.trailcraft({ enabled: true });
      const zones = window.__dev.trailcraft().zones || [];
      for (const z of zones) {
        window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
        const s = window.__dev.trailcraft({ self: pid, nowMs: window.__TNOW, push: { [pid]: { craft, atMs: window.__TNOW } }, toZone: z });
        if (s.zone === z && s.craftable) return { zone: z, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor };
      }
      return null;
    };
  }, QNOW);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks (los 5 canales del arco + trailcraft + utilidades byte-id)
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.trailcraft && window.__dev.wayfarerRoam && window.__dev.focus && window.__dev.kinship && window.__dev.convoy && window.__dev.ward && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.trailcraft + 5 canales arco (wayfarerRoam/focus/kinship/convoy/ward) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot (read BEFORE any inject)
  const dark = await page.evaluate(() => window.__dev.trailcraft());
  ok("2 byte-id OFF (fresh boot): TRAILCRAFT.enabled false AND G.trail NUNCA se crea (gExists false, tickTrailcraft jamás corrió)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.craft === 0 && dark.steps === 0 && dark.floor === "" && dark.lootQualityFloor === "" && dark.tag === "" && dark.craftMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} craft=${dark.craft} floor="${dark.floor}" tag="${dark.tag}" map=${JSON.stringify(dark.craftMap)}`);

  // 3 save OFF has no trail/trailServer/trailMarks key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: sin clave 'trail'/'trailServer'/'trailMarks' (estado 100% derivado/transitorio, 0 persistencia nueva)",
     !/"trail(Server|Marks)?"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(63)));
  await page.evaluate(() => window.__dev.trailcraft({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(63)));
  await page.evaluate(() => window.__dev.trailcraft({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  await installQA(page);
  // config leída del VM — la QA re-deriva sus oráculos con estos parámetros
  const cfg = await page.evaluate(() => { const s = window.__dev.trailcraft({ enabled: true }); return { tiers: s.tiers, cap: s.capCraft, minVariety: s.minVariety, windowSec: s.windowSec, halfLifeSec: s.halfLifeSec, accruePerSec: s.accruePerSec, channel: s.channel, zones: s.zones }; });
  const WIN = cfg.windowSec * 1000;

  // 5 ★ VARIEDAD (fn PURA trailVariety vía varietyProbe) cruzada contra ORÁCULO QA — biomas re-etiquetados
  const pr = await page.evaluate((M, WIN) => {
    window.__dev.trailcraft({ enabled: true, nowMs: window.__TNOW });
    const V = (marks) => window.__dev.trailcraft({ varietyProbe: { marks, now: window.__TNOW, windowMs: WIN } }).probe;
    return { empty: V(M.empty), one: V(M.one), same4: V(M.same4), four: V(M.four), three: V(M.three), stale: V(M.stale), blank: V(M.blank) };
  }, M, WIN);
  const prKeys = ["empty", "one", "same4", "four", "three", "stale", "blank"];
  const prOk = prKeys.every(k => pr[k] === oracleVariety(M[k], QNOW, WIN));
  ok("5 ★ VARIEDAD (fn PURA) == ORÁCULO QA: []⇒0; 1 marca⇒1; 4 MISMO bioma⇒1 (OPUESTO Wayfarer); 4 distintos⇒4; 3 distintos⇒3; fuera-de-ventana⇒1; bioma \"\"⇒1",
     prOk && pr.empty === 0 && pr.one === 1 && pr.same4 === 1 && pr.four === 4 && pr.three === 3 && pr.stale === 1 && pr.blank === 1,
     JSON.stringify(pr));

  // 6 ★ TABLA tiers + steps + floor == ORÁCULO QA para craft 1..7 (en zona)
  const tab = await page.evaluate(() => {
    const w = window.__tpick("qSelf", 6); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const c of [1, 2, 3, 4, 5, 6, 7]) {
      window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
      const vm = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: c, atMs: window.__TNOW } }, toZone: zone });
      out.push({ c, craft: vm.craft, tier: vm.tier, steps: vm.steps, floor: vm.floor });
    }
    return { zone, out };
  });
  const tabOk = !tab.bad && tab.out.every(r => near(r.craft, r.c) && r.tier === oracleTier(r.c, cfg.tiers) && r.steps === oracleSteps(r.c, cfg.tiers) && r.floor === oracleFloor(r.c, cfg.tiers));
  ok("6 ★ TABLA tiers+steps+floor == ORÁCULO QA (craft 1→T0/0/\"\"; 2,3→T1/1/uncommon; 4,5→T2/1/uncommon; 6,7→T3/2/rare) determinista, monótona",
     tabOk, `zone=${tab.zone} ${JSON.stringify(tab.out)}`);

  // 7 server-authoritative reflect + validate (per-pid + clamp craft negativo)
  const refl = await page.evaluate(() => {
    window.__dev.trailcraft({ enabled: true });
    const zones = window.__dev.trailcraft().zones; const z0 = zones[0];
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: 4, atMs: window.__TNOW }, qOther: { craft: 6, atMs: window.__TNOW } }, toZone: z0 });
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    const neg = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: -9, atMs: window.__TNOW } }, toZone: z0 });
    return { z0, selfCraft: s.craft, mapSelf: s.craftMap ? s.craftMap.qSelf : null, mapOther: s.craftMap ? s.craftMap.qOther : null, negCraft: neg.craft, negTier: neg.tier, negMap: neg.craftMap };
  });
  const reflOk = near(refl.selfCraft, 4) && near(refl.mapSelf, 4) && near(refl.mapOther, 6) && refl.negCraft === 0 && refl.negTier === 0 && !(refl.negMap && ("qSelf" in refl.negMap));
  ok("7 SERVER-AUTHORITATIVE reflect+validate per-pid: qSelf refleja craft 4 (LOCAL) mientras qOther=6 coexiste en craftMap; craft negativo ⇒ 0 (clamp, ausente del map)",
     reflOk, JSON.stringify(refl));

  // 8 ★ ACUMULADOR sostenido (marks+step) == ORÁCULO (accruePerSec·dt si variety≥minVariety)
  const acc = await page.evaluate((M) => {
    const w = window.__tpick("qSelf", 1); if (!w) return { bad: true };
    const zone = w.zone; const out = [];
    for (const dt of [2, 4, 6]) {
      window.__tstep("qSelf", M.three, dt);
      const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
      out.push({ dt, craft: s.craft, tier: s.tier });
    }
    return { zone, out };
  }, M);
  const accOk = !acc.bad && acc.out.every(r => near(r.craft, oracleAccrue(M.three, QNOW, WIN, r.dt, cfg.accruePerSec, cfg.minVariety)) && r.tier === oracleTier(r.craft, cfg.tiers));
  ok("8 ★ ACUMULADOR sostenido == ORÁCULO QA: 3 biomas distintos sostenido dt=2⇒2(T1); dt=4⇒4(T2); dt=6⇒6(T3) = accruePerSec·dt exacto",
     accOk, JSON.stringify(acc.out));

  // 9 ★ DIFERENCIADOR — OPUESTO a Wayfarer: MISMO bioma (muchas marcas/celdas)⇒variety1⇒NO abre; distintos⇒ABRE; 1-marca⇒NO; 1-tick⇒0 (permanencia)
  const diff = await page.evaluate((M) => {
    const w = window.__tpick("qSelf", 1); if (!w) return { bad: true };
    const zone = w.zone;
    const read = (marks, dt) => { window.__tstep("qSelf", marks, dt); const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone }); return { craft: s.craft, tier: s.tier, floor: s.floor }; };
    return {
      zone,
      same4: read(M.same4, 6),   // 4 marcas MISMO bioma (vueltas, muchas celdas) ⇒ variety 1 < min ⇒ NO abre (OPUESTO Wayfarer)
      one:   read(M.one, 6),     // 1 sola marca ⇒ variety 1 ⇒ NO abre
      four:  read(M.four, 6),    // 4 biomas distintos ⇒ variety 4 ⇒ ABRE
      tick:  read(M.four, 0.5),  // 1 tick dt=0.5 con variety 4 ⇒ craft 0.5 < 2 ⇒ NO abre (permanencia)
    };
  }, M);
  const diffOk = !diff.bad && near(diff.same4.craft, 0) && diff.same4.tier === 0 && diff.same4.floor === "" &&
    near(diff.one.craft, 0) && diff.one.tier === 0 &&
    diff.four.craft >= 6 && diff.four.tier === 3 && diff.four.floor === "rare" &&
    near(diff.tick.craft, 0.5) && diff.tick.tier === 0 && diff.tick.floor === "";
  ok("9 ★ DIFERENCIADOR (OPUESTO Wayfarer): MISMO bioma×4 (muchas celdas)⇒variety1⇒NO abre; 1-marca⇒NO; 4 distintos⇒ABRE(T3/rare); 1-tick dt=0.5⇒0 (permanencia)",
     diffOk, JSON.stringify(diff));

  // 10 ★ DECAY determinista 0-RNG por vida-media (25s) == ORÁCULO a tres instantes
  const decay = await page.evaluate(() => {
    const w = window.__tpick("qSelf", 1); if (!w) return { bad: true };
    const zone = w.zone;
    const at0 = window.__tat("qSelf", 8, 0, zone);
    const hl1 = window.__tat("qSelf", 8, 25, zone);
    const hl2 = window.__tat("qSelf", 8, 50, zone);
    return { zone, base: at0.craft, baseT: at0.tier, hl1: hl1.craft, hl1T: hl1.tier, hl2: hl2.craft, hl2T: hl2.tier };
  });
  const decOk = !decay.bad && near(decay.base, oracleDecay(8, 0, cfg.halfLifeSec, cfg.cap)) &&
    near(decay.hl1, oracleDecay(8, 25, cfg.halfLifeSec, cfg.cap)) && near(decay.hl2, oracleDecay(8, 50, cfg.halfLifeSec, cfg.cap)) &&
    decay.baseT === 3 && decay.hl1T === 2 && decay.hl2T === 1;
  ok("10 ★ DECAY determinista 0-RNG por vida-media == ORÁCULO QA: base 8(T3); +25s⇒4(T2); +50s⇒2(T1)",
     decOk, JSON.stringify(decay));

  // 11 ★ PATH→bioma (zoneOf REAL) diferenciador Wayfarer: vueltas en 1 zona⇒variety1⇒NO; cruzar 3 zonas distintas⇒variety3⇒ABRE
  const pathRes = await page.evaluate(() => {
    window.__dev.trailcraft({ enabled: true });
    const zones = window.__dev.trailcraft().zones || [];
    // recoge spots reales de 3 zonas de caza distintas (pulseSpot vía toZone)
    const spots = [];
    for (const z of zones) { const s = window.__dev.trailcraft({ toZone: z }); if (s.zone === z) spots.push({ z, x: window.__dev.trailcraft().hero.x, y: window.__dev.trailcraft().hero.y }); if (spots.length >= 3) break; }
    if (spots.length < 3) return { bad: true, got: spots.length };
    const home = spots[0].z;
    // (a) LOOP en 1 zona: 5 posiciones todas en spots[0] ⇒ marcas mismo bioma ⇒ variety 1 ⇒ step 0 ⇒ NO abre
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    const loopPath = [0, 1, 2, 3, 4].map(i => ({ x: spots[0].x + (i % 2), y: spots[0].y + (i % 2), t: window.__TNOW }));
    window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, path: { qSelf: loopPath } });
    window.__dev.trailcraft({ nowMs: window.__TNOW, step: { qSelf: { dt: 6 } } });
    const loop = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: home });
    // (b) CROSS 3 zonas distintas ⇒ marcas 3 biomas ⇒ variety 3 ⇒ step dt6 ⇒ ABRE
    window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
    const crossPath = spots.map(s => ({ x: s.x, y: s.y, t: window.__TNOW }));
    window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, path: { qSelf: crossPath } });
    window.__dev.trailcraft({ nowMs: window.__TNOW, step: { qSelf: { dt: 6 } } });
    const cross = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: home });
    return { home, biomes: spots.map(s => s.z), loopCraft: loop.craft, loopTier: loop.tier, crossCraft: cross.craft, crossTier: cross.tier, crossFloor: cross.floor };
  });
  const pathOk = !pathRes.bad && near(pathRes.loopCraft, 0) && pathRes.loopTier === 0 &&
    pathRes.crossCraft >= 6 && pathRes.crossTier === 3 && pathRes.crossFloor === "rare";
  ok("11 ★ PATH→bioma (zoneOf REAL): LOOP en 1 zona (muchas posiciones)⇒variety1⇒NO abre; CRUZAR 3 zonas distintas⇒variety3⇒ABRE(T3/rare) — diferenciador Wayfarer con biomas reales",
     pathOk, JSON.stringify(pathRes));

  // 12 ★ CANAL lootQuality wired + BYTE-NEUTRO seam (seed-fijo) — OFF ⇒ floorRarity==baseRarity byte-id; abierto ⇒ floorRarity≥baseRarity y ≥ piso del tier
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function trailcraftFloor\(\)/.test(simSrc) && /rollGearInst\(srand,win\[0\],win\[1\],\s*trailcraftFloor\(\)\|\|undefined\)/.test(simSrc) && /if\(!TRAILCRAFT\.enabled\)\s*return\s*"";/.test(simSrc);
  const loot = await page.evaluate(() => {
    // OFF: floorRarity == baseRarity (byte-id vs HEAD) para varias semillas
    window.__dev.trailcraft({ enabled: false });
    const seeds = [0x1111, 0x2222, 0x3333, 0x4444];
    const offSame = seeds.map(seed => { const lp = window.__dev.trailcraft({ lootTick: { seed, tmin: 1, tmax: 2 } }).lootPicked; return lp && lp.floor === "" && lp.baseRarity === lp.floorRarity; });
    // ABIERTO T3 en zona: floorRarity >= baseRarity y >= "rare"
    const w = window.__tpick("qSelf", 6); const zone = w.zone;
    window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
    const open = seeds.map(seed => window.__dev.trailcraft({ lootTick: { seed, tmin: 1, tmax: 2 } }).lootPicked);
    window.__dev.trailcraft({ enabled: false });
    return { offSame, open, steps: window.__dev.trailcraft().steps };
  });
  const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const lootOk = seamWired && loot.offSame.every(Boolean) &&
    loot.open.every(lp => lp && lp.floor === "rare" && RANK[lp.floorRarity] >= RANK[lp.baseRarity] && RANK[lp.floorRarity] >= RANK.rare);
  ok("12 ★ CANAL lootQuality wired + BYTE-NEUTRO seam: OFF ⇒ floorRarity==baseRarity (byte-id vs HEAD, 4 semillas); sendero T3 abierto ⇒ floor rare, floorRarity≥baseRarity y ≥rare",
     lootOk, `wired=${seamWired} offSame=${JSON.stringify(loot.offSame)} open=${JSON.stringify(loot.open)}`);

  // 13 ★ ORTOGONALIDAD 5 canales: abrir lootQuality (rareza) NO toca goldFind/restedMult/wardRegen/oocMitigation; y abrir esos NO crea floor
  const orth = await page.evaluate(() => {
    // aísla: los 4 canales previos apagados en memoria
    window.__dev.kinship({ enabled: false }); window.__dev.focus({ enabled: false }); window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false }); window.__dev.wayfarerRoam({ enabled: false });
    const w = window.__tpick("qSelf", 6); if (!w) return { bad: true };   // craft 6 ⇒ T3 ⇒ floor rare
    const zone = w.zone;
    const a = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
    const floorAlone = a.lootQualityFloor, goldAlone = a.goldFindMul, restedAlone = a.restedXpMult, wardAlone = a.wardRegenMul, oocAlone = a.oocMitigMul;
    // abrir los OTROS canales en la MISMA zona ⇒ suben SUS muls, pero lootQualityFloor de trailcraft NO cambia
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: window.__TNOW }); window.__dev.kinship({ nowMs: window.__TNOW, push: { [zone]: { kinship: 6, atMs: window.__TNOW } }, toZone: zone });
    window.__dev.convoy({ enabled: true }); window.__dev.convoy({ clear: true, nowMs: window.__TNOW }); window.__dev.convoy({ nowMs: window.__TNOW, push: { [zone]: { march: 6, atMs: window.__TNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: window.__TNOW }); window.__dev.ward({ nowMs: window.__TNOW, push: { [zone]: { ward: 6, atMs: window.__TNOW } }, toZone: zone });
    const b = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
    window.__dev.kinship({ enabled: false }); window.__dev.convoy({ enabled: false }); window.__dev.ward({ enabled: false });
    return { zone, channel: a.channel, floorAlone, goldAlone, restedAlone, wardAlone, oocAlone,
      floorAfter: b.lootQualityFloor, goldAfter: b.goldFindMul, restedAfter: b.restedXpMult, wardAfter: b.wardRegenMul };
  });
  const orthOk = !orth.bad && orth.channel === "lootQuality" && orth.floorAlone === "rare" &&
    orth.goldAlone === 0 && orth.wardAlone === 0 && orth.oocAlone === 0 &&        // trail solo NO toca los otros canales
    orth.floorAfter === "rare" &&                                                // abrir kinship/convoy/ward NO cambia el floor de trail
    orth.goldAfter > 0 && orth.wardAfter > 0 && orth.restedAfter > orth.restedAlone; // los otros SÍ suben SUS canales (independientes)
  ok("13 ★ ORTOGONALIDAD 5 canales: trail solo ⇒ floor rare, goldFind/wardRegen/oocMitigation 0 (⊥); abrir kinship(goldFind)/convoy(restedMult)/ward(wardRegen) ⇒ suben SUS muls PERO floor de trail INTACTO (0 doble-conteo)",
     orthOk, JSON.stringify(orth));

  // 14 ★ 0-REGRESIÓN: 15 flags del arco served enabled:true; TRAILCRAFT served false (DARK #63)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["FOCUS_FIRE", "WAYFARER_ROAM", "KINSHIP_BOND", "WARDING_RING", "CONVOY_MARCH", "BATTLE_SYNC", "FELLOWSHIP_BOND", "INFLUX_SURGE", "FRONTIER_SPREAD", "LONG_WATCH", "DIVERSE_COMPANY", "SOUL_RECOVERY", "WORLD_PULSE", "WAYFARER_TRAIL", "CONGREGATION"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const trailDark = flag("TRAILCRAFT") === "false";
  ok("14 ★ 0-REGRESIÓN: 15 flags del arco served enabled:true (FOCUS_FIRE, WAYFARER_ROAM, KINSHIP_BOND, WARDING_RING, CONVOY_MARCH, BATTLE_SYNC, FELLOWSHIP_BOND, INFLUX_SURGE, FRONTIER_SPREAD, LONG_WATCH, DIVERSE_COMPANY, SOUL_RECOVERY, WORLD_PULSE, WAYFARER_TRAIL, CONGREGATION); TRAILCRAFT served false (DARK)",
     arcAllOn && trailDark, `trailcraft=${flag("TRAILCRAFT")} arcAllOn=${arcAllOn} ${JSON.stringify(arcLive)}`);

  // 15 ★ TRAILCRAFT en las 6 zonas broken=[]
  const zonesRes = await page.evaluate(() => {
    window.__dev.trailcraft({ enabled: true });
    const zones = window.__dev.trailcraft().zones; const broken = [];
    for (const z of zones) {
      window.__dev.trailcraft({ clear: true, nowMs: window.__TNOW });
      const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: 6, atMs: window.__TNOW } }, toZone: z });
      if (!(s.zone === z && s.craftable && s.tier === 3 && s.steps === 2 && s.floor === "rare")) broken.push(z);
    }
    return { zones, broken };
  });
  ok("15 ★ TRAILCRAFT 6 zonas: las 6 de TRAILCRAFT.zones hospedan un sendero observable (craft 6 ⇒ T3 / floor rare) broken=[]",
     zonesRes.zones.length === 6 && zonesRes.broken.length === 0, `zones=${JSON.stringify(zonesRes.zones)} broken=${JSON.stringify(zonesRes.broken)}`);

  // 16 render badge "Sendero:" (con colon — único, ≠ "Sendero Trillado" de WAYFARER_TRAIL) drawn ON / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0, cntTrillado = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string") { if (t.indexOf("Sendero:") >= 0) cnt++; if (t.indexOf("Sendero Trillado") >= 0) cntTrillado++; } return orig(t, x, y); };
    window.__dev.trailcraft({ enabled: true });
    const w = window.__tpick("qSelf", 6);
    window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: 6, atMs: window.__TNOW } }, toZone: w.zone });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.trailcraft({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps, cntTrillado };
  });
  ok("16 render badge \"Sendero:\" (con colon, único vs \"Sendero Trillado\" de WAYFARER_TRAIL) se DIBUJA ON (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} trillado=${badge.cntTrillado}`);

  await page.evaluate(() => { window.__dev.trailcraft({ enabled: true }); const w = window.__tpick("qSelf", 6); window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, push: { qSelf: { craft: 6, atMs: window.__TNOW } }, toZone: w.zone }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 17 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL (per-pid A vs B)
  await page.evaluate(() => window.__dev.trailcraft({ enabled: false }));
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  await installQA(pageB);
  // ambos clientes reciben el MISMO snapshot crudo per-pid {A,B}; cada uno se declara self=su-pid; MISMO reloj ⇒ craft/tier/steps/floor byte-id per-pid
  const zone = await page.evaluate(() => (window.__dev.trailcraft({ enabled: true }).zones || [])[2]);   // ruins idx2 (North Star canónico del arco)
  const readBoth = async (craftA, craftB, elapsedSec) => {
    const push = { A: { craft: craftA, atMs: QNOW }, B: { craft: craftB, atMs: QNOW } };
    const inj = (pg, selfPid) => pg.evaluate(({ push, zone, elapsedSec, QNOW, selfPid }) => {
      window.__dev.trailcraft({ enabled: true }); window.__dev.trailcraft({ clear: true, nowMs: QNOW });
      const s = window.__dev.trailcraft({ self: selfPid, nowMs: QNOW + (elapsedSec || 0) * 1000, push, toZone: zone });
      return { self: s.self, craft: s.craft, tier: s.tier, steps: s.steps, floor: s.floor, nowMs: s.nowMs, map: s.craftMap };
    }, { push, zone, elapsedSec, QNOW, selfPid });
    const [a, b] = await Promise.all([inj(page, "A"), inj(pageB, "B")]);
    return { a, b };
  };
  // A y B con MISMO craft ⇒ self-craft byte-id (mismo snapshot/reloj), y craftMap idéntico en ambos (server-auth)
  const sustain = await readBoth(6, 6, 0);   // ambos T3 sostenido byte-idéntico
  const mapEq = JSON.stringify(sustain.a.map) === JSON.stringify(sustain.b.map);
  const sustainEq = sustain.a.craft === sustain.b.craft && sustain.a.tier === sustain.b.tier && sustain.a.steps === sustain.b.steps && sustain.a.floor === sustain.b.floor;
  // per-pid: A alto (craft 6→T3) vs B bajo (craft 3→T1) — cada self ve SU craft, pero el craftMap (autoridad) es idéntico
  const perpid = await readBoth(6, 3, 0);
  const perpidOk = perpid.a.self === "A" && near(perpid.a.craft, 6) && perpid.a.tier === 3 &&
    perpid.b.self === "B" && near(perpid.b.craft, 3) && perpid.b.tier === 1 &&
    JSON.stringify(perpid.a.map) === JSON.stringify(perpid.b.map);
  // decay converge: base 8 +25s ⇒ 4 (T2) en ambos
  const decayed = await readBoth(8, 8, 25);
  const decayEq = decayed.a.craft === decayed.b.craft && near(decayed.a.craft, 4) && decayed.a.tier === 2 && decayed.b.tier === 2;
  // A SALE de zona ⇒ floor "" (Δ_A=0) PERO craftMap server-auth + Δ_B INTACTOS. Reestablece snapshot limpio craft 6 en ambos antes del leave (estado determinista).
  await readBoth(6, 6, 0);
  const aLeaves = await page.evaluate(() => { const s = window.__dev.trailcraft({ self: "A", leave: true }); return { floor: s.floor, lootQualityFloor: s.lootQualityFloor, tier: s.tier, map: s.craftMap }; });
  const bIntact = await pageB.evaluate(({ zone, QNOW }) => { const s = window.__dev.trailcraft({ self: "B", nowMs: QNOW, toZone: zone }); return { craft: s.craft, tier: s.tier, floor: s.floor }; }, { zone, QNOW });
  const nsOk = mapEq && sustainEq && sustain.a.tier === 3 && near(sustain.a.craft, 6) && perpidOk && decayEq &&
    aLeaves.floor === "" && aLeaves.lootQualityFloor === "" && aLeaves.map && (aLeaves.map.A || 0) > 0 && (aLeaves.map.B || 0) > 0 &&
    near(bIntact.craft, 6) && bIntact.tier === 3 && bIntact.floor === "rare";
  ok("17 ★ NORTH STAR 2-CLIENTE: MISMO snapshot+reloj ⇒ craft/tier/steps/floor byte-idénticos + craftMap idéntico; per-pid A(T3) vs B(T1); decay converge (T2); A sale ⇒ floor \"\" (Δ_A=0) PERO craftMap+Δ_B INTACTOS (0 desync)",
     nsOk && errB.length === 0, JSON.stringify({ mapEq, sustainEq, perpidOk, decayEq, aFloor: aLeaves.floor, bCraft: bIntact.craft, bTier: bIntact.tier, errB: errB.length }));

  // 18 ★ CO-EXISTENCIA: con los 5 canales previos LIVE (served true) + trailcraft abierto, cada canal reporta su mul SIN colisión (lootQuality ⊥ los 4 muls)
  const coexist = await page.evaluate(() => {
    const w = window.__tpick("qSelf", 6); if (!w) return { bad: true };
    const zone = w.zone;
    // abre TODOS los canales del arco en la MISMA zona (los que usan snapshot por-zona)
    window.__dev.kinship({ enabled: true }); window.__dev.kinship({ clear: true, nowMs: window.__TNOW }); window.__dev.kinship({ nowMs: window.__TNOW, push: { [zone]: { kinship: 6, atMs: window.__TNOW } }, toZone: zone });
    window.__dev.ward({ enabled: true }); window.__dev.ward({ clear: true, nowMs: window.__TNOW }); window.__dev.ward({ nowMs: window.__TNOW, push: { [zone]: { ward: 6, atMs: window.__TNOW } }, toZone: zone });
    const s = window.__dev.trailcraft({ self: "qSelf", nowMs: window.__TNOW, toZone: zone });
    window.__dev.kinship({ enabled: false }); window.__dev.ward({ enabled: false });
    return { floor: s.lootQualityFloor, tier: s.tier, gold: s.goldFindMul, ward: s.wardRegenMul };
  });
  ok("18 ★ CO-EXISTENCIA con canales previos LIVE: trailcraft abierto (floor rare/T3) mientras kinship(goldFind>0) + ward(wardRegen>0) ABIERTOS ⇒ los 3 canales reportan sin colisión (RAREZA ⊥ oro ⊥ HP)",
     !coexist.bad && coexist.floor === "rare" && coexist.tier === 3 && coexist.gold > 0 && coexist.ward > 0, JSON.stringify(coexist));

  ok("0 no JS errors during full run", errors.length === 0, errors.slice(0, 3).join(" | "));

  console.log(`\n${FAIL === 0 ? "ALL PASS" : "HAS FAIL"}  ${PASS}/${PASS + FAIL}  build=${build}`);
  process.exit(FAIL === 0 ? 0 : 1);
} catch (e) {
  console.error("HARNESS ERROR", e);
  process.exit(2);
} finally {
  await browser.close();
  await server.stop();
}
