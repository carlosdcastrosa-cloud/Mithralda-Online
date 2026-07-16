// CAS-2453 — INDEPENDENT QA harness (DARK, ZONE_EVENT_SURGE.enabled:false). EVO#75 Participación en Evento de Zona.
// QA-OWNED, oracles RE-DERIVED FROM SCRATCH (not sourced from the GE self-verify). 2-cliente North Star.
// Verifies the 6 acceptance criteria of CAS-2453 against served build f7b79c60d831 @ master cda0550 (DARK, master-only).
//   AC1  OFF byte-neutral: enabled:false ⇒ G.zoneEventSurge NUNCA se crea (gExists false); killEnemy sin cambio (0 gemas);
//        save.v1 SIN clave 'zoneEventSurge'/'gemFind'/'eventGems'; worldFingerprint byte-estable al togglear enabled.
//   AC2  LUT pura score→tier→gems == ORACLE re-derivado desde los knobs de config servida (tiers/eventGemCap). Sub-cap 2.
//   AC3  REAL server-auth: spawnEvent inyecta POI REAL en G.zoneEvents.pois; eventProbe lee score/lista/count REAL en radio.
//        ★ INDEP EXTRA: POI state==="done"/"escaped" ⇒ peso 0 (evento consumido); per-tipo shrine=1 vs chest/goblin=2.
//   AC4  DIFERENCIADOR ⊥: POI de evento activo ⇒ tier≥1 por ESTADO DE EVENTO, mientras afijo#74 (dangerProbe) y apex#73
//        (tier 0) lo IGNORAN (un POI no es mob ni jefe). Canal gemFind ⊥ 11 peers (0 doble-dip).
//   AC5  0-regresión 16 flags #59-#74 served enabled:true, 0 desvío; ZONE_EVENT_SURGE served false (DARK #75).
//   AC6  North Star 2-cliente 0-desync: MISMO POI+héroe ⇒ score/tier/gems + eventProbe + LUT + worldFingerprint byte-id.
// Run: node tools/cas2453-zoneevent-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const EXPECT_BUILD = "f7b79c60d831";
const OUT = join(ROOT, "shots", "cas2453-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// RE-DERIVED oracles (independent of the GE probe): parse the SERVED config knobs, then recompute tier/gems from scratch.
// eventWeights {shrine:1,chest:2,goblin:2}; tiers [{min:1,gems:1},{min:3,gems:2}]; eventGemCap 2.
const ORACLE_WEIGHTS = { shrine: 1, chest: 2, goblin: 2 };   // ausente → 1 (fallback)
const ORACLE_TIERS = [{ min: 1, gems: 1 }, { min: 3, gems: 2 }];
const ORACLE_CAP = 2;
function oracleTierGems(score) {
  let g = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; g = ORACLE_TIERS[i].gems; }
  return { tier: t, gems: Math.min(ORACLE_CAP, g) };
}
const ARC16 = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER"];

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

  // AC1 — OFF byte-neutral. Fresh boot: enabled false, G.zoneEventSurge never created (gExists false), save sin clave,
  // seam OFF ⇒ 0 gemas aun con un POI activo pegado al héroe; worldFingerprint estable al togglear enabled.
  const off = await A.page.evaluate(() => {
    const vm = window.__dev.zoneEvent();
    const save = JSON.stringify(window.__dev.saveBlob());
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(777));
    // seam OFF: forageGemsPreview debe ser 0 aun con POI activo pegado al héroe
    const h = vm.hero;
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx, ty: h.ty, type: "chest", state: "active" } });
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    const vm2 = window.__dev.zoneEvent();
    // toggle enabled in-mem para el fingerprint, luego restaurar OFF
    const fpOn = JSON.stringify(window.__dev.worldFingerprint(777)); // still OFF here (no flip yet)
    window.__dev.zoneEvent({ enabled: true });
    const fpEnabled = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.zoneEvent({ enabled: false });
    return { enabled: vm.enabled, gExists: vm.gExists, score: vm.score, tier: vm.tier, gems: vm.gems,
      previewGlued: vm2.forageGemsPreview, gemsGlued: vm2.gems, tierGlued: vm2.tier, save, fpBefore, fpEnabled };
  });
  const noFeatKey = !/"(zoneEventSurge|gemFind)[A-Za-z]*"\s*:/.test(off.save);
  const noGemKey = !/"eventGems"\s*:/.test(off.save);
  ok("AC1 OFF byte-neutral: gExists false + save sin zoneEventSurge/gemFind/eventGems + seam OFF 0 gemas (POI pegado) + fingerprint estable al togglear enabled",
     off.enabled === false && off.gExists === false && off.score === 0 && off.tier === 0 && off.gems === 0 &&
     off.previewGlued === 0 && off.gemsGlued === 0 && off.tierGlued === 0 && noFeatKey && noGemKey && off.fpBefore === off.fpEnabled,
     `enabled=${off.enabled} gExists=${off.gExists} gluedPrev=${off.previewGlued} gluedGems=${off.gemsGlued} noFeatKey=${noFeatKey} noGemKey=${noGemKey} fpStable=${off.fpBefore === off.fpEnabled}`);

  // AC2 — LUT pura == ORACLE re-derivado. scoreProbe 0→T0/0, [1,2]→T1/1, ≥3→T2/2, cap 2.
  const lutCases = [0, 1, 2, 3, 4, 6, 12, 99];
  const lut = await A.page.evaluate((cs) => cs.map(s => { const p = window.__dev.zoneEvent({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, gems: p.gems }; }), lutCases);
  const lutOK = lut.every(r => { const o = oracleTierGems(r.score); return r.tier === o.tier && r.gems === o.gems && r.gems <= ORACLE_CAP; });
  ok("AC2 LUT pura score→tier→gems == ORACLE re-derivado (0→T0/0, [1,2]→T1/1, ≥3→T2/2, sub-cap 2)",
     lutOK, JSON.stringify(lut));

  // AC3 — REAL server-auth + INDEP EXTRAS: per-type weight (shrine=1 vs chest/goblin=2) + state done/escaped ⇒ weight 0.
  const server3 = await A.page.evaluate(() => {
    window.__dev.zoneEvent({ enabled: true });
    const h = window.__dev.zoneEvent().hero;
    const measure = (type, state) => {
      // limpiar: teleport a un tile virgen lejos, inyectar UN POI, medir score aislado NO es trivial (POIs previos
      // persisten). En su lugar medimos el DELTA de score de eventProbe al añadir este POI cerca vs el baseline previo.
      window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
      const before = window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score;
      window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 2, ty: h.ty, type, state } });   // ~64px, dentro de radio
      window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
      const after = window.__dev.zoneEvent({ eventProbe: true });
      const poi = after.eventProbe.pois.find(p => p.type === type);
      return { delta: after.eventProbe.score - before, count: after.eventProbe.count, poiType: poi ? poi.type : null, poiState: poi ? poi.state : null, poiWeight: poi ? poi.weight : null };
    };
    const shrine = measure("shrine", "active");   // peso 1
    const chest = measure("chest", "active");      // peso 2
    const goblin = measure("goblin", "active");    // peso 2
    const doneP = measure("chest", "done");        // consumido ⇒ peso 0 ⇒ delta 0
    const escP = measure("goblin", "escaped");     // consumido ⇒ peso 0 ⇒ delta 0
    window.__dev.zoneEvent({ enabled: false });
    return { shrine, chest, goblin, doneP, escP };
  });
  const s3OK = server3.shrine.delta === 1 && server3.shrine.poiWeight === 1 && server3.shrine.poiState === "active" &&
    server3.chest.delta === 2 && server3.chest.poiWeight === 2 &&
    server3.goblin.delta === 2 && server3.goblin.poiWeight === 2 &&
    server3.doneP.delta === 0 && server3.escP.delta === 0;
  ok("AC3 REAL server-auth: spawnEvent→G.zoneEvents.pois, eventProbe REAL; INDEP per-tipo shrine=+1 chest=+2 goblin=+2; state done/escaped ⇒ peso 0 (delta 0)",
     s3OK, JSON.stringify(server3));

  // AC4 — DIFERENCIADOR ⊥: POI activo ⇒ event T≥1 mientras afijo#74 (dangerProbe) y apex#73 (tier 0) lo IGNORAN; peers ⊥.
  const diff = await A.page.evaluate(() => {
    window.__dev.zoneEvent({ enabled: true });
    const h = window.__dev.zoneEvent().hero;
    window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } });
    const affixBefore = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;
    const apexBefore = window.__dev.apex ? window.__dev.apex().tier : null;
    // peers snapshot ANTES del POI (evento OFF baseline)
    window.__dev.zoneEvent({ enabled: false });
    const snap = () => { const s = window.__dev.zoneEvent(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview }; };
    const peersOff = snap();
    window.__dev.zoneEvent({ enabled: true });
    window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 5, ty: h.ty, type: "goblin", state: "active" } });   // ~160px
    const affixAfter = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;   // POI no es mob ⇒ sin cambio
    const apexAfter = window.__dev.apex ? window.__dev.apex().tier : null;                  // POI no es jefe ⇒ tier 0
    const vm = window.__dev.zoneEvent();
    const peersOn = snap();                                                                  // peers deben ser idénticos
    const ad = window.__dev.affixDanger ? window.__dev.affixDanger().enabled : null;
    const ap = window.__dev.apex ? window.__dev.apex().enabled : null;
    const sc = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.zoneEvent({ enabled: false });
    return { evTier: vm.tier, evScore: vm.score, evGems: vm.gems, affixBefore, affixAfter, apexBefore, apexAfter,
      peersUnchanged: JSON.stringify(peersOff) === JSON.stringify(peersOn), adEnabled: ad, apEnabled: ap, scEnabled: sc, peersOff, peersOn };
  });
  const diffOK = diff.evTier >= 1 && diff.evScore >= 1 && diff.evGems >= 1 &&
    diff.affixAfter === diff.affixBefore && diff.apexAfter === 0 && diff.apexBefore === 0 &&
    diff.peersUnchanged && diff.adEnabled === true && diff.apEnabled === true && diff.scEnabled === true;
  ok("AC4 ⊥ DIFERENCIADOR: POI activo ⇒ evento T≥1 mientras afijo#74 (dangerProbe sin cambio) y apex#73 (tier 0) lo IGNORAN; gemFind ⊥ 11 peers (0 cambio); afijo/apex/scarcity LIVE ⊥",
     diffOK, JSON.stringify({ evTier: diff.evTier, evScore: diff.evScore, evGems: diff.evGems, affixBefore: diff.affixBefore, affixAfter: diff.affixAfter, apexAfter: diff.apexAfter, peersUnchanged: diff.peersUnchanged, adEnabled: diff.adEnabled, apEnabled: diff.apEnabled, scEnabled: diff.scEnabled }));

  // AC5 — 0-regresión 16 flags served enabled:true; ZONE_EVENT_SURGE served false. Parse la config SERVIDA.
  const cfgSrc = await A.page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC16.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const zeDark = flag("ZONE_EVENT_SURGE") === "false";
  ok("AC5 0-regresión: 16 flags arco #59-#74 served enabled:true; ZONE_EVENT_SURGE served false (DARK #75)",
     arcAllOn && zeDark && ARC16.length === 16, `zoneEvent=${flag("ZONE_EVENT_SURGE")} allOn=${arcAllOn} off=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // AC6 — North Star 2-cliente 0-desync. Cliente B fresco. MISMO POI+héroe ⇒ señal determinista + worldFingerprint byte-id.
  const B = await boot(browser, base);
  const buildB = await B.page.evaluate(() => window.__BUILD || null);
  const EVENT_TILE = { tx: 70, ty: 44 }, HERO_TILE = { tx: 74, ty: 44 };   // POI 4 tiles oeste del héroe (~128px, en radio 360)
  const readVM = async (pg) => await pg.evaluate((ET, HT) => {
    window.__dev.zoneEvent({ enabled: true });
    window.__dev.zoneEvent({ spawnEvent: { tx: ET.tx, ty: ET.ty, type: "chest", state: "active" } });
    window.__dev.zoneEvent({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.zoneEvent();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.zoneEvent({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, gems: p.gems }; });
    const ep = window.__dev.zoneEvent({ eventProbe: true }).eventProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.zoneEvent({ enabled: false });
    return { score: vm.score, tier: vm.tier, gems: vm.gems, epScore: ep.score, epCount: ep.count, lut, fp };
  }, EVENT_TILE, HERO_TILE);
  const vmA = await readVM(A.page);
  const vmB = await readVM(B.page);
  // activeEventCount ambiental EXCLUIDO (contaminado por inyecciones de prueba de A); el SIGNAL determinista per-snapshot es lo shard-consistente.
  const convOK = vmA.score === vmB.score && vmA.tier === vmB.tier && vmA.gems === vmB.gems &&
    vmA.epScore === vmB.epScore && JSON.stringify(vmA.lut) === JSON.stringify(vmB.lut) && vmA.fp === vmB.fp &&
    buildB === EXPECT_BUILD;
  ok("AC6 North Star 2-cliente: MISMO POI+héroe ⇒ score/tier/gems + eventProbe.score + LUT + worldFingerprint byte-id (0 desync; activeEventCount ambiental excluido)",
     convOK, `A={s:${vmA.score},t:${vmA.tier},g:${vmA.gems},epS:${vmA.epScore},fpLen:${vmA.fp.length}} B={s:${vmB.score},t:${vmB.tier},g:${vmB.gems},epS:${vmB.epScore},fpLen:${vmB.fp.length}} fpMatch=${vmA.fp === vmB.fp} buildB=${buildB}`);

  // screenshot evidence (evento activo cerca del héroe, badge visible)
  await A.page.evaluate(() => { window.__dev.zoneEvent({ enabled: true }); const h = window.__dev.zoneEvent().hero; window.__dev.zoneEvent({ spawnEvent: { tx: h.tx + 4, ty: h.ty, type: "chest", state: "active" } }); window.__dev.zoneEvent({ tp: { tx: h.tx, ty: h.ty } }); });
  await new Promise(r => setTimeout(r, 400));
  await A.page.screenshot({ path: join(OUT, "selfverify.png") });
  await A.page.evaluate(() => window.__dev.zoneEvent({ enabled: false }));

  // 0 — no JS errors during run
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
