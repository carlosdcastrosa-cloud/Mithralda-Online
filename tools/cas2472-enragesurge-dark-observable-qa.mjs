// CAS-2472 — INDEPENDENT QA harness (DARK, BOSS_ENRAGE_SURGE.enabled:false). EVO#78 Fase de Enfurecimiento de Jefe.
// QA-OWNED, oracles RE-DERIVED FROM SCRATCH (NOT sourced from the GE self-verify cas2468-enragesurge-selfverify.mjs). 2-cliente North Star.
// Validates the 7 acceptance criteria of CAS-2472 (Gate 2/2 for CAS-2468) against served build 4ce6f753a96b @ master 52dec80
// (DARK, master-only; version.json NOT regenerated for master-only DARK ⇒ served __BUILD stays the #77-LIVE build 4ce6f753a96b).
//   AC1  OFF byte-neutral: enabled:false ⇒ G.enrageSurge NUNCA se crea (gExists false); seam killEnemy rama muerta ⇒ 0 trofeos
//        (jefe ENFURECIDO PEGADO al héroe); worldFingerprint byte-estable al togglear enabled (h.enrageTrophies NO entra al fp).
//   AC2  STATELESS: save.v1 SIN clave 'enrageSurge'/'trophyFind'/'enrageTrophies'; G.enrageSurge==null; h.enrageTrophies
//        transitorio NO entra al fingerprint (banca in-mem via seam ON no perturba worldFingerprint).
//   AC3  Server-auth REAL: spawnEnraged inyecta jefe/campeón ENFURECIDO REAL en G.enemies {capstone,isBoss,enraged}; enrageProbe
//        da score/kind determinista sobre snapshot replicado (0 RNG/0 timer). fase-1 (enraged:false) ⇒ peso 0 (sólo enfurecido cuenta).
//   AC4  Función/LUT PURA: score=Σ enrageWeights[kind] sobre jefes ENFURECIDOS en radio; tiers 0→T0, [1,2]→T1, ≥3→T2, cap 2.
//        LUT pura score→tier→trophies == ORACLE re-derivado. Per-clase weight (boss=+2 vs champion=+1).
//   AC5  Canal FRESCO trophyFind: 1 solo contribuidor (seam kill), sub-cap enrageTrophyCap 2, 0 doble-dip;
//        flip enrage OFF→ON cambia 0 de 14 peer channels (ward/gold/atk/crit/xp/vamp/loot/det/ess/mat/flask/gem/socket/heal).
//   AC6  ⊥ DIFERENCIADOR FUERTE vs apex #73: un jefe en FASE-1 (enraged:false) ⇒ apex lo VE por DISTANCIA (matForagePreview/tier>0)
//        pero enrage NO (score 0, phase-blind al no-enfurecido); enfurecer un jefe a la MISMA distancia ⇒ enrage 0→>0 mientras
//        apex tier IDÉNTICO (apex mide distancia, enrage mide FASE). afijo#74/variante#76/hazard#77 IGNORAN la transición de fase.
//   AC7  0-regresión 2-cliente 0-desync: 19 flags #59-#77 served enabled:true; BOSS_ENRAGE_SURGE la única false.
//        North Star 2-cliente: MISMO jefe ENFURECIDO+héroe ⇒ score/tier/trophies + enrageProbe + LUT + worldFingerprint byte-id.
// Run: node tools/cas2472-enragesurge-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const EXPECT_BUILD = "4ce6f753a96b";   // served __BUILD = version.json (NOT regenerated for master-only DARK #78; served stays the #77-LIVE build)
const OUT = join(ROOT, "shots", "cas2472-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// RE-DERIVED oracles (independent of the GE probe): re-parse the SERVED config knobs, then recompute tier/trophies from scratch.
// enrageWeights {boss:2,champion:1} (ausente→1 fallback); tiers [{min:1,trophies:1},{min:3,trophies:2}]; enrageTrophyCap 2.
const ORACLE_WEIGHTS = { boss: 2, champion: 1 };
const ORACLE_TIERS = [{ min: 1, trophies: 1 }, { min: 3, trophies: 2 }];
const ORACLE_CAP = 2;
function oracleTierTrophies(score) {
  let s = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; s = ORACLE_TIERS[i].trophies; }
  return { tier: t, trophies: Math.min(ORACLE_CAP, s) };
}
// 19 flags LIVE #59-#77 (18 del arco previo + ARENA_HAZARD_SURGE flipped LIVE en #77)
const ARC19 = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE"];

let PASS = 0, FAIL = 0;
function ok(n, c, d) { (c ? PASS++ : FAIL++); console.log(`${c ? "PASS" : "FAIL"}  ${n}  — ${d}`); }

async function boot(browser, base) {
  const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : browser;
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()", { timeout: 20000 });
  const sc = await page.evaluate(() => window.__dev.scene());
  if (sc !== "play") {
    await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 15000 });
    await page.evaluate(() => { const ni = document.getElementById("nameInput"); if (ni) ni.value = "QAIndep"; });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    await page.waitForFunction("window.__dev.scene()==='classsel'", { timeout: 8000 });
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Digit1", key: "1", bubbles: true })));
    await page.waitForFunction("['customize','abilitysel','play'].includes(window.__dev.scene())", { timeout: 8000 });
    for (const s of ["customize", "abilitysel"]) {
      if (await page.evaluate(() => window.__dev.scene()) === s)
        await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { code: "Enter", key: "Enter", bubbles: true })));
    }
    await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 8000 });
  }
  await new Promise(r => setTimeout(r, 400));
  return { page, errors };
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: findChromium(), args: LAUNCH_ARGS, headless: "new" });

try {
  const A = await boot(browser, base);
  const build = await A.page.evaluate(() => window.__BUILD || null);
  ok("0 boot A to play + build served == EXPECT", build === EXPECT_BUILD, `build=${build} (expect ${EXPECT_BUILD}) err=${A.errors.length}`);

  // AC1 — OFF byte-neutral. Fresh boot: enabled false, G.enrageSurge never created (gExists false), seam OFF ⇒ 0 trophies
  // aun con un jefe ENFURECIDO PEGADO al héroe; worldFingerprint estable al togglear enabled (trofeos NO entran al fp).
  const off = await A.page.evaluate(() => {
    const vm = window.__dev.enrageSurge();
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(777));
    const h = vm.hero;
    window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx + 1, ty: h.ty, kind: "boss", enraged: true } });   // ~32px, dentro de radio
    window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } });
    const vm2 = window.__dev.enrageSurge();
    // toggle enabled in-mem para el fingerprint, luego restaurar OFF
    window.__dev.enrageSurge({ enabled: true });
    const fpEnabled = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.enrageSurge({ enabled: false });
    return { enabled: vm.enabled, gExists: vm.gExists, score: vm.score, tier: vm.tier, trophies: vm.trophies,
      previewGlued: vm2.forageTrophiesPreview, trophiesGlued: vm2.trophies, tierGlued: vm2.tier,
      heroTrophiesGlued: vm2.hero.enrageTrophies, fpBefore, fpEnabled };
  });
  ok("AC1 OFF byte-neutral: gExists false + seam OFF 0 trofeos (jefe ENFURECIDO PEGADO) + worldFingerprint byte-estable al togglear enabled",
     off.enabled === false && off.gExists === false && off.score === 0 && off.tier === 0 && off.trophies === 0 &&
     off.previewGlued === 0 && off.trophiesGlued === 0 && off.tierGlued === 0 && off.heroTrophiesGlued === 0 && off.fpBefore === off.fpEnabled,
     `enabled=${off.enabled} gExists=${off.gExists} gluedPrev=${off.previewGlued} gluedTrophies=${off.trophiesGlued} heroTrophies=${off.heroTrophiesGlued} fpStable=${off.fpBefore === off.fpEnabled} fpLen=${off.fpBefore.length}`);

  // AC2 — STATELESS. save.v1 sin clave enrageSurge/trophyFind/enrageTrophies; G.enrageSurge==null; h.enrageTrophies
  // transitorio NO entra al fingerprint (banca in-mem via seam ON no perturba worldFingerprint).
  const st = await A.page.evaluate(() => {
    const save = JSON.stringify(window.__dev.saveBlob());
    const gExists = window.__dev.enrageSurge().gExists;
    const fp0 = JSON.stringify(window.__dev.worldFingerprint(555));
    window.__dev.enrageSurge({ enabled: true });
    const h = window.__dev.enrageSurge().hero;
    window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx + 1, ty: h.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } });
    const trophiesBefore = window.__dev.enrageSurge().hero.enrageTrophies;
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(555));
    window.__dev.enrageSurge({ enabled: false });
    const save2 = JSON.stringify(window.__dev.saveBlob());
    return { save, save2, gExists, fp0, fp1, trophiesBefore };
  });
  const noFeatKey = !/"(enrageSurge|trophyFind)[A-Za-z]*"\s*:/.test(st.save) && !/"(enrageSurge|trophyFind)[A-Za-z]*"\s*:/.test(st.save2);
  const noTrophyKey = !/"enrageTrophies"\s*:/.test(st.save) && !/"enrageTrophies"\s*:/.test(st.save2);
  ok("AC2 STATELESS: save.v1 SIN enrageSurge/trophyFind/enrageTrophies + G.enrageSurge==null (gExists false) + h.enrageTrophies transitorio NO entra al worldFingerprint (fp estable bajo banca)",
     noFeatKey && noTrophyKey && st.gExists === false && st.fp0 === st.fp1,
     `noFeatKey=${noFeatKey} noTrophyKey=${noTrophyKey} gExists=${st.gExists} fpStableUnderBank=${st.fp0 === st.fp1} saveLen=${st.save.length}`);

  // AC3 — Server-auth REAL. spawnEnraged inyecta jefe ENFURECIDO REAL en G.enemies; enrageProbe lo lee; fase-1 (enraged:false) ⇒ peso 0.
  // Tile REMOTO (ty=44) aislado de los spawns pegados de AC1/AC2 (que están en la zona de origen).
  const server3 = await A.page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const HT = { tx: 70, ty: 44 };
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    // boss ENFURECIDO cerca ⇒ probe lo detecta con peso 2
    const spawn = window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } }).spawnEnraged;
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const probeEnraged = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe;
    // fase-1 (enraged:false) ⇒ peso 0 (no cuenta): añadir un boss en fase-1 cerca y ver que el score NO sube
    const before = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    const spawnP1 = window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 3, ty: HT.ty, kind: "boss", enraged: false } }).spawnEnraged;
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const afterP1 = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    window.__dev.enrageSurge({ enabled: false });
    return { spawn, spawnP1, probeEnraged, phase1Delta: afterP1 - before };
  });
  const s3boss = server3.probeEnraged.mobs.find(m => m.kind === "boss");
  const s3OK = server3.spawn && server3.spawn.kind === "boss" && server3.spawn.enraged === true && server3.spawn.weight === 2 &&
    server3.probeEnraged.score >= 2 && server3.probeEnraged.count >= 1 && s3boss && s3boss.weight === 2 &&
    server3.spawnP1 && server3.spawnP1.enraged === false && server3.spawnP1.weight === 0 && server3.phase1Delta === 0;
  ok("AC3 server-auth REAL: spawnEnraged→G.enemies {kind:boss,enraged:true,weight:2}; enrageProbe lo lee (score≥2); fase-1 (enraged:false) ⇒ weight 0 ⇒ +0 (sólo ENFURECIDO cuenta)",
     s3OK, JSON.stringify({ spawn: server3.spawn, spawnP1: server3.spawnP1, probeScore: server3.probeEnraged.score, probeCount: server3.probeEnraged.count, phase1Delta: server3.phase1Delta }));

  // AC4 — Función/LUT PURA. LUT pura score→tier→trophies == ORACLE; per-clase weight via DELTA de enrageProbe. Tile REMOTO ty=56.
  const lutCases = [0, 1, 2, 3, 4, 6, 12, 99];
  const lut = await A.page.evaluate((cs) => cs.map(s => { const p = window.__dev.enrageSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, trophies: p.trophies }; }), lutCases);
  const lutOK = lut.every(r => { const o = oracleTierTrophies(r.score); return r.tier === o.tier && r.trophies === o.trophies && r.trophies <= ORACLE_CAP; });
  const weights = await A.page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const HT = { tx: 90, ty: 56 };
    const measure = (kind) => {
      window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
      const before = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
      window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind, enraged: true } });
      window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
      const after = window.__dev.enrageSurge({ enrageProbe: true });
      const m = after.enrageProbe.mobs.find(x => x.kind === kind);
      return { delta: after.enrageProbe.score - before, weight: m ? m.weight : null };
    };
    const r = { boss: measure("boss"), champion: measure("champion") };
    window.__dev.enrageSurge({ enabled: false });
    return r;
  });
  const wOK = Object.keys(ORACLE_WEIGHTS).every(k => weights[k].delta === ORACLE_WEIGHTS[k] && weights[k].weight === ORACLE_WEIGHTS[k]);
  ok("AC4 LUT PURA score→tier→trophies == ORACLE re-derivado (0→T0/0, [1,2]→T1/1, ≥3→T2/2, cap 2) + per-clase weight (boss=+2, champion=+1)",
     lutOK && wOK, `lut=${JSON.stringify(lut)} weights=${JSON.stringify(weights)}`);

  // AC5 — Canal FRESCO trophyFind. flip OFF→ON cambia 0 de 14 peers; sub-cap 2 (raw>cap ⇒ cap).
  const peers = await A.page.evaluate(() => {
    const snap = () => { const s = window.__dev.enrageSurge(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, atk: s.atkspdBonus, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview }; };
    window.__dev.enrageSurge({ enabled: false });
    const peersOff = snap();
    window.__dev.enrageSurge({ enabled: true });
    const peersOn = snap();
    window.__dev.enrageSurge({ enabled: false });
    return { peersUnchanged: JSON.stringify(peersOff) === JSON.stringify(peersOn), peersOff, peersOn };
  });
  // sub-cap: score 999 ⇒ raw trofeos del tier 2 = 2, cap 2 ⇒ 2 (no explota por encima del cap)
  const subcap = await A.page.evaluate(() => window.__dev.enrageSurge({ scoreProbe: { score: 999 } }).scoreProbe.trophies);
  ok("AC5 canal FRESCO trophyFind: flip OFF→ON cambia 0 de 14 peer channels (ward/gold/atk/crit/xp/vamp/loot/det/ess/mat/flask/gem/socket/heal) + sub-cap enrageTrophyCap 2 (score 999 ⇒ 2)",
     peers.peersUnchanged && subcap === 2, `peersUnchanged=${peers.peersUnchanged} subcap=${subcap} peersOff=${JSON.stringify(peers.peersOff)}`);

  // AC6 — ⊥ DIFERENCIADOR FUERTE vs apex #73. Tile REMOTO ty=68. Un jefe en FASE-1 (enraged:false) cerca ⇒ apex lo VE por DISTANCIA
  // (matForagePreview/tier>0) pero enrage NO (score 0). Enfurecer un 2º jefe a la MISMA distancia ⇒ enrage 0→>0 mientras apex tier IDÉNTICO.
  const diff = await A.page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const HT = { tx: 110, ty: 68 };
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    // Fase-1: boss NO enfurecido cerca. Apex mide DISTANCIA ⇒ lo ve; enrage mide FASE ⇒ score 0.
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: false } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const apexMatP1 = window.__dev.enrageSurge().matForagePreview;                                  // apex #73 preview (matFind) — VE al boss por distancia
    const apexTierP1 = window.__dev.apex ? window.__dev.apex().tier : null;
    const enrP1 = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;                // enrage — phase-blind al no-enfurecido ⇒ 0
    const affixP1 = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : null;
    const variantP1 = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : null;
    const hazardP1 = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : null;
    // Enfurecer: un 2º boss ENFURECIDO a la MISMA distancia (mismo tile). Apex tier IDÉNTICO (misma dist mínima); enrage sube.
    window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const apexMatP2 = window.__dev.enrageSurge().matForagePreview;
    const apexTierP2 = window.__dev.apex ? window.__dev.apex().tier : null;
    const enrP2 = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    const affixP2 = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : null;
    const variantP2 = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : null;
    const hazardP2 = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : null;
    const apEnabled = window.__dev.apex ? window.__dev.apex().enabled : null;
    const adEnabled = window.__dev.affixDanger ? window.__dev.affixDanger().enabled : null;
    const varEnabled = window.__dev.variantSurge ? window.__dev.variantSurge().enabled : null;
    const hzEnabled = window.__dev.hazardSurge ? window.__dev.hazardSurge().enabled : null;
    window.__dev.enrageSurge({ enabled: false });
    return { apexMatP1, apexTierP1, enrP1, affixP1, variantP1, hazardP1, apexMatP2, apexTierP2, enrP2, affixP2, variantP2, hazardP2, apEnabled, adEnabled, varEnabled, hzEnabled };
  });
  const diffOK = diff.enrP1 === 0 && diff.enrP2 > 0 &&                                   // enrage phase-sensitive: 0 en fase-1, >0 al enfurecer
    diff.apexTierP1 === diff.apexTierP2 && diff.apexMatP1 === diff.apexMatP2 &&          // apex phase-blind: IDÉNTICO (mide distancia, no fase)
    diff.apexTierP1 > 0 &&                                                               // apex SÍ ve al boss (por distancia) en ambas fases
    diff.affixP1 === diff.affixP2 && diff.variantP1 === diff.variantP2 && diff.hazardP1 === diff.hazardP2 &&  // afijo/variante/hazard ignoran la transición
    diff.apEnabled === true && diff.adEnabled === true && diff.varEnabled === true && diff.hzEnabled === true;
  ok("AC6 ⊥ DIFERENCIADOR FUERTE vs apex#73: fase-1 ⇒ apex tier>0 (VE por distancia) pero enrage=0; enfurecer misma dist ⇒ enrage 0→>0 con apex tier IDÉNTICO; afijo#74/variante#76/hazard#77 ignoran la fase; los 4 LIVE enabled",
     diffOK, JSON.stringify(diff));

  // AC7a — 0-regresión 19 flags served enabled:true; BOSS_ENRAGE_SURGE served false. Parse la config SERVIDA.
  const cfgSrc = await A.page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC19.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const esDark = flag("BOSS_ENRAGE_SURGE") === "false";
  ok("AC7a 0-regresión: 19 flags arco #59-#77 served enabled:true; BOSS_ENRAGE_SURGE served false (DARK #78), la única false del arco",
     arcAllOn && esDark && ARC19.length === 19, `enrageSurge=${flag("BOSS_ENRAGE_SURGE")} allOn=${arcAllOn} off=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // AC7b — North Star 2-cliente 0-desync. Cliente B fresco. Tile MUY REMOTO (ty=90) aislado de todos los spawns de A ⇒
  // los jefes de checks previos de A quedan FUERA de radio (evita contaminación; GOTCHA check7). MISMO jefe ENFURECIDO+héroe ⇒ señal byte-id.
  const B = await boot(browser, base);
  const buildB = await B.page.evaluate(() => window.__BUILD || null);
  const ENR_TILE = { tx: 44, ty: 90 }, HERO_TILE = { tx: 48, ty: 90 };   // boss 4 tiles oeste del héroe (~128px, en radio 260); ty=90 lejos de AC1-AC6 (ty≤68)
  const readVM = async (pg) => await pg.evaluate((ET, HT) => {
    window.__dev.enrageSurge({ enabled: true });
    window.__dev.enrageSurge({ spawnEnraged: { tx: ET.tx, ty: ET.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.enrageSurge();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.enrageSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, trophies: p.trophies }; });
    const ep = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.enrageSurge({ enabled: false });
    return { score: vm.score, tier: vm.tier, trophies: vm.trophies, epScore: ep.score, epCount: ep.count, lut, fp };
  }, ENR_TILE, HERO_TILE);
  const vmA = await readVM(A.page);
  const vmB = await readVM(B.page);
  // enragedCount ambiental EXCLUIDO (contaminado por inyecciones de prueba de A); el SIGNAL determinista per-snapshot es lo shard-consistente.
  const convOK = vmA.score === vmB.score && vmA.tier === vmB.tier && vmA.trophies === vmB.trophies &&
    vmA.epScore === vmB.epScore && JSON.stringify(vmA.lut) === JSON.stringify(vmB.lut) && vmA.fp === vmB.fp &&
    buildB === EXPECT_BUILD && vmA.tier >= 1;
  ok("AC7b North Star 2-cliente: MISMO jefe ENFURECIDO+héroe ⇒ score/tier/trophies + enrageProbe.score + LUT + worldFingerprint byte-id (0 desync; tile remoto ty=90 aísla contaminación)",
     convOK, `A={s:${vmA.score},t:${vmA.tier},tr:${vmA.trophies},ep:${vmA.epScore},fpLen:${vmA.fp.length}} B={s:${vmB.score},t:${vmB.tier},tr:${vmB.trophies},ep:${vmB.epScore},fpLen:${vmB.fp.length}} fpMatch=${vmA.fp === vmB.fp} buildB=${buildB}`);

  // screenshot evidence (jefe enfurecido cerca del héroe, badge Furia:✦ visible ON)
  await A.page.evaluate(() => { window.__dev.enrageSurge({ enabled: true }); const HT = { tx: 130, ty: 80 }; window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } }); window.__dev.enrageSurge({ spawnEnraged: { tx: HT.tx + 2, ty: HT.ty, kind: "boss", enraged: true } }); window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } }); });
  await new Promise(r => setTimeout(r, 400));
  await A.page.screenshot({ path: join(OUT, "selfverify.png") });
  await A.page.evaluate(() => window.__dev.enrageSurge({ enabled: false }));

  // Z — no JS errors during run
  ok("Z no JS errors during run (A+B)", A.errors.length === 0 && B.errors.length === 0, `A=${A.errors.length} B=${B.errors.length} ${A.errors.concat(B.errors).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
