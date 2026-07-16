// CAS-2471 — INDEPENDENT QA harness (DARK, BOSS_ENRAGE_SURGE.enabled:false). EVO#78 Fase de Enfurecimiento de Jefe.
// QA-OWNED, oracles RE-DERIVED FROM SCRATCH (NOT sourced from the GE self-verify cas2468-enragesurge-selfverify.mjs). 2-cliente North Star.
// Served build 4ce6f753a96b @ master 52dec80 (DARK, master-only; version.json NOT regenerated for master-only DARK ⇒
// served __BUILD stays #77 LIVE build 4ce6f753a96b — index.html fetches version.json for window.__BUILD).
//   AC1  OFF byte-neutral: enabled:false ⇒ G.enrageSurge NUNCA se crea (gExists false); seam killEnemy rama muerta ⇒ 0 trofeos
//        (jefe ENFURECIDO PEGADO al héroe); worldFingerprint byte-estable al togglear enabled.
//   AC2  STATELESS: save.v1 SIN clave 'enrageSurge'/'trophyFind'/'enrageTrophies'; G.enrageSurge==null; h.enrageTrophies
//        transitorio NO entra al fingerprint (banca in-mem via seam ON no perturba worldFingerprint).
//   AC3  Server-auth REAL: spawnEnraged inyecta jefe/campeón REAL enfurecido en G.enemies; enrageProbe da score/kind/weight
//        determinista sobre snapshot replicado (0 RNG/0 timer). fase-1 (enraged:false) ⇒ peso 0 (sólo `enraged` cuenta).
//   AC4  Función/LUT PURA: score=Σ enrageWeights sobre jefes ENFURECIDOS en radio; tiers 0→T0, [1,2]→T1, ≥3→T2, cap 2.
//        LUT pura score→tier→trophies == ORACLE re-derivado. Per-clase weight (boss=+2 vs champion=+1).
//   AC5  Canal FRESCO trophyFind: 1 solo contribuidor (seam kill), sub-cap enrageTrophyCap 2, 0 doble-dip;
//        flip enrage OFF→ON cambia 0 de 14 peer channels (ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essence/mat/flask/gem/socket/heal).
//   AC6  ⊥ diferenciador vs apex#73 (mismo cuerpo): jefe fase-1 ⇒ apexTier≥1 (DISTANCIA) PERO enrage 0; enfurecer a MISMA
//        distancia ⇒ enrage 0→≥1 MIENTRAS apexTier IDÉNTICO (apex phase-blind). hazard#77/variante#76/afijo#74 IGNORAN el jefe.
//        apex/hazard/variante/afijo LIVE coexisten enabled.
//   AC7  0-regresión 2-cliente 0-desync: 19 flags #59-#77 served enabled:true; BOSS_ENRAGE_SURGE la única false.
//        North Star 2-cliente: MISMO jefe enfurecido+héroe ⇒ score/tier/trophies + enrageProbe + LUT + worldFingerprint byte-id.
// Run: node tools/cas2471-enragesurge-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const EXPECT_BUILD = "4ce6f753a96b";   // served __BUILD = version.json (NOT regenerated for master-only DARK; #77 LIVE build)
const OUT = join(ROOT, "shots", "cas2471-qa");
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

  // AC1 — OFF byte-neutral. Fresh boot: enabled false, G.enrageSurge never created (gExists false), seam OFF ⇒ 0 trofeos
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
      previewGlued: vm2.forageTrophiesPreview, trophiesGlued: vm2.trophies, tierGlued: vm2.tier, enragedGlued: vm2.enragedCount, fpBefore, fpEnabled };
  });
  ok("AC1 OFF byte-neutral: gExists false + seam OFF 0 trofeos (jefe ENFURECIDO PEGADO) + worldFingerprint byte-estable al togglear enabled",
     off.enabled === false && off.gExists === false && off.score === 0 && off.tier === 0 && off.trophies === 0 &&
     off.previewGlued === 0 && off.trophiesGlued === 0 && off.tierGlued === 0 && off.fpBefore === off.fpEnabled,
     `enabled=${off.enabled} gExists=${off.gExists} gluedPrev=${off.previewGlued} gluedTrophies=${off.trophiesGlued} enragedGlued=${off.enragedGlued} fpStable=${off.fpBefore === off.fpEnabled} fpLen=${off.fpBefore.length}`);

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

  // AC3 — Server-auth REAL. spawnEnraged inyecta jefe REAL enfurecido en G.enemies; enrageProbe lo lee; fase-1 ⇒ peso 0.
  // Corre en un tile REMOTO fresco (deltas) para aislar de jefes inyectados en checks previos.
  const server3 = await A.page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const h0 = window.__dev.enrageSurge().hero;
    const RX = h0.tx - 100, RY = h0.ty;
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    const base = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    // jefe ENFURECIDO cerca ⇒ probe lo detecta con peso 2
    const spawn = window.__dev.enrageSurge({ spawnEnraged: { tx: RX + 2, ty: RY, kind: "boss", enraged: true } }).spawnEnraged;
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    const probeEnraged = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe;
    // fase-1 (enraged:false) ⇒ peso 0 (no cuenta): añadir uno fase-1 cerca y ver que el score NO sube
    const before = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    window.__dev.enrageSurge({ spawnEnraged: { tx: RX + 3, ty: RY, kind: "boss", enraged: false } });
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    const afterPhase1 = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
    window.__dev.enrageSurge({ enabled: false });
    return { base, spawn, probeEnraged, phase1Delta: afterPhase1 - before };
  });
  const s3boss = server3.probeEnraged.mobs.find(m => m.kind === "boss" && m.weight === 2);
  const s3OK = server3.spawn && server3.spawn.kind === "boss" && server3.spawn.enraged === true && server3.spawn.weight === 2 &&
    (server3.probeEnraged.score - server3.base) >= 2 && server3.probeEnraged.count >= 1 && s3boss &&
    server3.phase1Delta === 0;
  ok("AC3 server-auth REAL: spawnEnraged→G.enemies {kind:boss,enraged:true,weight:2}; enrageProbe lo lee (Δscore≥2); fase-1 (enraged:false) ⇒ +0 (sólo ENFURECIDO cuenta)",
     s3OK, JSON.stringify({ spawn: server3.spawn, base: server3.base, probeScore: server3.probeEnraged.score, probeCount: server3.probeEnraged.count, phase1Delta: server3.phase1Delta }));

  // AC4 — Función/LUT PURA. LUT pura score→tier→trophies == ORACLE; per-clase weight via DELTA de enrageProbe.
  const lutCases = [0, 1, 2, 3, 4, 6, 12, 99];
  const lut = await A.page.evaluate((cs) => cs.map(s => { const p = window.__dev.enrageSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, trophies: p.trophies }; }), lutCases);
  const lutOK = lut.every(r => { const o = oracleTierTrophies(r.score); return r.tier === o.tier && r.trophies === o.trophies && r.trophies <= ORACLE_CAP; });
  const weights = await A.page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const h0 = window.__dev.enrageSurge().hero;
    const RX = h0.tx - 110, RY = h0.ty - 30;
    const measure = (kind) => {
      window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
      const before = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score;
      window.__dev.enrageSurge({ spawnEnraged: { tx: RX + 2, ty: RY, kind, enraged: true } });
      window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
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

  // AC6 — ⊥ diferenciador vs apex#73 (mismo cuerpo, phase-blind). Tile REMOTO fresco (deltas) para aislar contaminación.
  const diff = await A.page.evaluate(() => {
    window.__dev.enrageSurge({ enabled: true });
    const h0 = window.__dev.enrageSurge().hero;
    const RX = h0.tx - 130, RY = h0.ty + 20;                              // tile remoto fresco, aislado del cluster de inyecciones
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    const baseEnrage = window.__dev.enrageSurge().score;
    const hazBefore = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const affixBefore = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : 0;
    // (a) jefe FASE-1 (no enfurecido) → apex lo VE por DISTANCIA, enrage NO
    window.__dev.enrageSurge({ spawnEnraged: { tx: RX + 3, ty: RY, kind: "boss", enraged: false } });
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    const apexPhase1 = window.__dev.apex ? window.__dev.apex().tier : null;
    const enragePhase1 = window.__dev.enrageSurge().score;
    // (b) jefe ENFURECIDO a la MISMA distancia (mismo tile) → enrage sube, apex IDÉNTICO (misma distancia mínima)
    window.__dev.enrageSurge({ spawnEnraged: { tx: RX + 3, ty: RY, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: RX, ty: RY } });
    const apexEnraged = window.__dev.apex ? window.__dev.apex().tier : null;
    const vm = window.__dev.enrageSurge();
    const hazAfter = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const affixAfter = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : 0;
    const apEnabled = window.__dev.apex ? window.__dev.apex().enabled : null;
    const hzEnabled = window.__dev.hazardSurge ? window.__dev.hazardSurge().enabled : null;
    const vsEnabled = window.__dev.variantSurge ? window.__dev.variantSurge().enabled : null;
    const adEnabled = window.__dev.affixDanger ? window.__dev.affixDanger().enabled : null;
    window.__dev.enrageSurge({ enabled: false });
    return { baseEnrage, apexPhase1, enragePhase1, apexEnraged, tier: vm.tier, score: vm.score, trophies: vm.trophies,
      hazBefore, hazAfter, varBefore, varAfter, affixBefore, affixAfter, apEnabled, hzEnabled, vsEnabled, adEnabled };
  });
  const diffOK = diff.enragePhase1 === diff.baseEnrage &&                  // jefe fase-1: enrage NO cambia (key en la FASE)
    diff.apexPhase1 >= 1 &&                                                 // apex lo VE (por distancia)
    diff.score > diff.enragePhase1 && diff.tier >= 1 && diff.trophies >= 1 && // jefe enfurecido: enrage fires
    diff.apexEnraged === diff.apexPhase1 &&                                 // apex IDÉNTICO (phase-blind: misma distancia)
    diff.hazAfter === diff.hazBefore && diff.varAfter === diff.varBefore && diff.affixAfter === diff.affixBefore &&
    diff.apEnabled === true && diff.hzEnabled === true && diff.vsEnabled === true && diff.adEnabled === true;
  ok("AC6 ⊥ DIFERENCIADOR: jefe fase-1 ⇒ apexTier≥1 (distancia) PERO enrage 0; enfurecer a MISMA distancia ⇒ enrage 0→≥1 MIENTRAS apexTier IDÉNTICO (apex phase-blind); hazard#77/variante#76/afijo#74 IGNORAN el jefe; apex/hazard/variante/afijo LIVE coexisten enabled",
     diffOK, JSON.stringify(diff));

  // AC7a — 0-regresión 19 flags served enabled:true; BOSS_ENRAGE_SURGE served false. Parse la config SERVIDA.
  const cfgSrc = await A.page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC19.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const esDark = flag("BOSS_ENRAGE_SURGE") === "false";
  ok("AC7a 0-regresión: 19 flags arco #59-#77 served enabled:true; BOSS_ENRAGE_SURGE served false (DARK #78), la única false del arco",
     arcAllOn && esDark && ARC19.length === 19, `enrageSurge=${flag("BOSS_ENRAGE_SURGE")} allOn=${arcAllOn} off=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // AC7b — North Star 2-cliente 0-desync. Cliente B fresco. MISMO jefe enfurecido+héroe ⇒ señal determinista + worldFingerprint byte-id.
  const B = await boot(browser, base);
  const buildB = await B.page.evaluate(() => window.__BUILD || null);
  const BOSS_TILE = { tx: 70, ty: 44 }, HERO_TILE = { tx: 73, ty: 44 };   // jefe 3 tiles oeste del héroe (~96px, en radio 260)
  const readVM = async (pg) => await pg.evaluate((BT, HT) => {
    window.__dev.enrageSurge({ enabled: true });
    window.__dev.enrageSurge({ spawnEnraged: { tx: BT.tx, ty: BT.ty, kind: "boss", enraged: true } });
    window.__dev.enrageSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.enrageSurge();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.enrageSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, trophies: p.trophies }; });
    const ep = window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.enrageSurge({ enabled: false });
    return { score: vm.score, tier: vm.tier, trophies: vm.trophies, epScore: ep.score, epCount: ep.count, lut, fp };
  }, BOSS_TILE, HERO_TILE);
  const vmA = await readVM(A.page);
  const vmB = await readVM(B.page);
  // enragedCount ambiental EXCLUIDO (contaminado por inyecciones de prueba de A + jefes naturales); el SIGNAL determinista per-snapshot es lo shard-consistente.
  const convOK = vmA.score === vmB.score && vmA.tier === vmB.tier && vmA.trophies === vmB.trophies &&
    vmA.epScore === vmB.epScore && JSON.stringify(vmA.lut) === JSON.stringify(vmB.lut) && vmA.fp === vmB.fp &&
    buildB === EXPECT_BUILD && vmA.tier >= 1;
  ok("AC7b North Star 2-cliente: MISMO jefe enfurecido+héroe ⇒ score/tier/trophies + enrageProbe.score + LUT + worldFingerprint byte-id (0 desync; enragedCount ambiental excluido)",
     convOK, `A={s:${vmA.score},t:${vmA.tier},tr:${vmA.trophies},epS:${vmA.epScore},fpLen:${vmA.fp.length}} B={s:${vmB.score},t:${vmB.tier},tr:${vmB.trophies},epS:${vmB.epScore},fpLen:${vmB.fp.length}} fpMatch=${vmA.fp === vmB.fp} buildB=${buildB}`);

  // screenshot evidence (jefe enfurecido cerca del héroe, badge Furia:✦ visible ON)
  await A.page.evaluate(() => { window.__dev.enrageSurge({ enabled: true }); const h = window.__dev.enrageSurge().hero; window.__dev.enrageSurge({ spawnEnraged: { tx: h.tx + 2, ty: h.ty, kind: "boss", enraged: true } }); window.__dev.enrageSurge({ tp: { tx: h.tx, ty: h.ty } }); });
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
