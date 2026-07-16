// CAS-2465 — INDEPENDENT QA harness (DARK, ARENA_HAZARD_SURGE.enabled:false). EVO#77 Hazard de Arena Activo.
// QA-OWNED, oracles RE-DERIVED FROM SCRATCH (NOT sourced from the GE self-verify cas2464-hazardsurge-selfverify.mjs). 2-cliente North Star.
// Validates the 7 acceptance criteria of CAS-2465 against served build f7b79c60d831 @ master 31d242f (DARK, master-only;
// version.json NOT regenerated for master-only DARK — served __BUILD stays #76 LIVE build; DARK computed id ad5af488cddd is irrelevant to served).
//   AC1  OFF byte-neutral: enabled:false ⇒ G.hazardSurge NUNCA se crea (gExists false); seam killEnemy rama muerta ⇒ 0 motes
//        (hazard activo PEGADO al héroe); worldFingerprint byte-estable al togglear enabled (fp 15920977B).
//   AC2  STATELESS: save.v1 SIN clave 'hazardSurge'/'healPotency'/'hazardMotes'; G.hazardSurge==null; h.hazardMotes
//        transitorio NO entra al fingerprint (banca in-mem via seam ON no perturba worldFingerprint).
//   AC3  Server-auth REAL: spawnHazard inyecta hazard REAL en G.hazards {x,y,r,type,phase}; hazardProbe da score/type/phase
//        determinista sobre snapshot replicado (0 RNG/0 timer). telegraph/fade ⇒ peso 0 (sólo `active` cuenta).
//   AC4  Función/LUT PURA: score=Σ hazardWeights sobre hazards ACTIVOS en radio; tiers 0→T0, [1,2]→T1, ≥3→T2, cap 2.
//        LUT pura score→tier→motes == ORACLE re-derivado. Per-tipo weight (magma/poison=+2 vs bramble/collapse/ice/void=+1).
//   AC5  Canal FRESCO healPotency: 1 solo contribuidor (seam kill), sub-cap hazardMoteCap 2, 0 doble-dip;
//        flip hazard OFF→ON cambia 0 de 13 peer channels (ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essence/mat/flask/gem/socket).
//   AC6  ⊥ diferenciador: con hazard T≥1, los previews de afijo#74/evento#75/variante#76/apex#73 NO cambian (ortogonalidad;
//        un hazard NO es un mob/POI/jefe). afijo/evento/variante/apex LIVE coexisten enabled.
//   AC7  0-regresión 2-cliente 0-desync: 18 flags #59-#76 served enabled:true; ARENA_HAZARD_SURGE la única false.
//        North Star 2-cliente: MISMO hazard+héroe ⇒ score/tier/motes + hazardProbe + LUT + worldFingerprint byte-id.
// Run: node tools/cas2465-hazardsurge-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const EXPECT_BUILD = "f7b79c60d831";   // served __BUILD = version.json (NOT regenerated for master-only DARK; DARK id ad5af488cddd unused by served)
const OUT = join(ROOT, "shots", "cas2465-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// RE-DERIVED oracles (independent of the GE probe): re-parse the SERVED config knobs, then recompute tier/motes from scratch.
// hazardWeights {magma:2,poison:2,bramble:1,collapse:1,ice:1,void:1} (ausente→1 fallback); tiers [{min:1,motes:1},{min:3,motes:2}]; hazardMoteCap 2.
const ORACLE_WEIGHTS = { magma: 2, poison: 2, bramble: 1, collapse: 1, ice: 1, void: 1 };
const ORACLE_TIERS = [{ min: 1, motes: 1 }, { min: 3, motes: 2 }];
const ORACLE_CAP = 2;
function oracleTierMotes(score) {
  let s = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; s = ORACLE_TIERS[i].motes; }
  return { tier: t, motes: Math.min(ORACLE_CAP, s) };
}
// 18 flags LIVE #59-#76 (17 del arco previo + ENCOUNTER_VARIANT_SURGE flipped LIVE en #76)
const ARC18 = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE"];

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

  // AC1 — OFF byte-neutral. Fresh boot: enabled false, G.hazardSurge never created (gExists false), seam OFF ⇒ 0 motes
  // aun con un hazard ACTIVO PEGADO al héroe; worldFingerprint estable al togglear enabled (brasas NO entran al fp).
  const off = await A.page.evaluate(() => {
    const vm = window.__dev.hazardSurge();
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(777));
    const h = vm.hero;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 1, ty: h.ty, type: "magma", phase: "active" } });   // ~32px, dentro de radio
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const vm2 = window.__dev.hazardSurge();
    // toggle enabled in-mem para el fingerprint, luego restaurar OFF
    window.__dev.hazardSurge({ enabled: true });
    const fpEnabled = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.hazardSurge({ enabled: false });
    return { enabled: vm.enabled, gExists: vm.gExists, score: vm.score, tier: vm.tier, motes: vm.motes,
      previewGlued: vm2.forageMotesPreview, motesGlued: vm2.motes, tierGlued: vm2.tier, activeGlued: vm2.activeHazardCount, fpBefore, fpEnabled };
  });
  ok("AC1 OFF byte-neutral: gExists false + seam OFF 0 motes (hazard ACTIVO PEGADO) + worldFingerprint byte-estable al togglear enabled",
     off.enabled === false && off.gExists === false && off.score === 0 && off.tier === 0 && off.motes === 0 &&
     off.previewGlued === 0 && off.motesGlued === 0 && off.tierGlued === 0 && off.fpBefore === off.fpEnabled,
     `enabled=${off.enabled} gExists=${off.gExists} gluedPrev=${off.previewGlued} gluedMotes=${off.motesGlued} activeGlued=${off.activeGlued} fpStable=${off.fpBefore === off.fpEnabled} fpLen=${off.fpBefore.length}`);

  // AC2 — STATELESS. save.v1 sin clave hazardSurge/healPotency/hazardMotes; G.hazardSurge==null; h.hazardMotes
  // transitorio NO entra al fingerprint (banca in-mem via seam ON no perturba worldFingerprint).
  const st = await A.page.evaluate(() => {
    const save = JSON.stringify(window.__dev.saveBlob());
    const gExists = window.__dev.hazardSurge().gExists;
    const fp0 = JSON.stringify(window.__dev.worldFingerprint(555));
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 1, ty: h.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const motesBefore = window.__dev.hazardSurge().hero.hazardMotes;
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(555));
    window.__dev.hazardSurge({ enabled: false });
    const save2 = JSON.stringify(window.__dev.saveBlob());
    return { save, save2, gExists, fp0, fp1, motesBefore };
  });
  const noFeatKey = !/"(hazardSurge|healPotency)[A-Za-z]*"\s*:/.test(st.save) && !/"(hazardSurge|healPotency)[A-Za-z]*"\s*:/.test(st.save2);
  const noMoteKey = !/"hazardMotes"\s*:/.test(st.save) && !/"hazardMotes"\s*:/.test(st.save2);
  ok("AC2 STATELESS: save.v1 SIN hazardSurge/healPotency/hazardMotes + G.hazardSurge==null (gExists false) + h.hazardMotes transitorio NO entra al worldFingerprint (fp estable bajo banca)",
     noFeatKey && noMoteKey && st.gExists === false && st.fp0 === st.fp1,
     `noFeatKey=${noFeatKey} noMoteKey=${noMoteKey} gExists=${st.gExists} fpStableUnderBank=${st.fp0 === st.fp1} saveLen=${st.save.length}`);

  // AC3 — Server-auth REAL. spawnHazard inyecta hazard REAL en G.hazards; hazardProbe lo lee; telegraph/fade ⇒ peso 0.
  const server3 = await A.page.evaluate(() => {
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    // active magma cerca ⇒ probe lo detecta con peso 2
    const spawn = window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type: "magma", phase: "active" } }).spawnHazard;
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const probeActive = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe;
    // telegraph ⇒ peso 0 (no cuenta): añadir uno telegraph cerca y ver que el score NO sube
    const before = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 3, ty: h.ty, type: "magma", phase: "telegraph" } });
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const afterTele = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
    // fade ⇒ peso 0 tampoco
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 3, ty: h.ty, type: "poison", phase: "fade" } });
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const afterFade = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
    window.__dev.hazardSurge({ enabled: false });
    return { spawn, probeActive, teleDelta: afterTele - before, fadeDelta: afterFade - afterTele };
  });
  const s3magma = server3.probeActive.hazards.find(h => h.type === "magma" && h.phase === "active");
  const s3OK = server3.spawn && server3.spawn.type === "magma" && server3.spawn.phase === "active" && server3.spawn.weight === 2 &&
    server3.probeActive.score >= 2 && server3.probeActive.count >= 1 && s3magma && s3magma.weight === 2 &&
    server3.teleDelta === 0 && server3.fadeDelta === 0;
  ok("AC3 server-auth REAL: spawnHazard→G.hazards {type:magma,phase:active,weight:2}; hazardProbe lo lee (score≥2); telegraph/fade ⇒ +0 (sólo `active` cuenta)",
     s3OK, JSON.stringify({ spawn: server3.spawn, probeScore: server3.probeActive.score, probeCount: server3.probeActive.count, teleDelta: server3.teleDelta, fadeDelta: server3.fadeDelta }));

  // AC4 — Función/LUT PURA. LUT pura score→tier→motes == ORACLE; per-tipo weight via DELTA de hazardProbe.
  const lutCases = [0, 1, 2, 3, 4, 6, 12, 99];
  const lut = await A.page.evaluate((cs) => cs.map(s => { const p = window.__dev.hazardSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, motes: p.motes }; }), lutCases);
  const lutOK = lut.every(r => { const o = oracleTierMotes(r.score); return r.tier === o.tier && r.motes === o.motes && r.motes <= ORACLE_CAP; });
  const weights = await A.page.evaluate(() => {
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    const measure = (type) => {
      window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
      const before = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score;
      window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type, phase: "active" } });
      window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
      const after = window.__dev.hazardSurge({ hazardProbe: true });
      const hz = after.hazardProbe.hazards.find(x => x.type === type);
      return { delta: after.hazardProbe.score - before, weight: hz ? hz.weight : null };
    };
    const r = { magma: measure("magma"), poison: measure("poison"), bramble: measure("bramble"), collapse: measure("collapse"), ice: measure("ice"), void: measure("void") };
    window.__dev.hazardSurge({ enabled: false });
    return r;
  });
  const wOK = Object.keys(ORACLE_WEIGHTS).every(t => weights[t].delta === ORACLE_WEIGHTS[t] && weights[t].weight === ORACLE_WEIGHTS[t]);
  ok("AC4 LUT PURA score→tier→motes == ORACLE re-derivado (0→T0/0, [1,2]→T1/1, ≥3→T2/2, cap 2) + per-tipo weight (magma/poison=+2, bramble/collapse/ice/void=+1)",
     lutOK && wOK, `lut=${JSON.stringify(lut)} weights=${JSON.stringify(weights)}`);

  // AC5 — Canal FRESCO healPotency. flip OFF→ON cambia 0 de 13 peers; sub-cap 2 (raw>cap ⇒ cap).
  const peers = await A.page.evaluate(() => {
    const snap = () => { const s = window.__dev.hazardSurge(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, atk: s.atkspdBonus, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview }; };
    window.__dev.hazardSurge({ enabled: false });
    const peersOff = snap();
    window.__dev.hazardSurge({ enabled: true });
    const peersOn = snap();
    window.__dev.hazardSurge({ enabled: false });
    return { peersUnchanged: JSON.stringify(peersOff) === JSON.stringify(peersOn), peersOff, peersOn };
  });
  // sub-cap: score 99 ⇒ raw motes del tier 2 = 2, cap 2 ⇒ 2 (no explota por encima del cap)
  const subcap = await A.page.evaluate(() => window.__dev.hazardSurge({ scoreProbe: { score: 999 } }).scoreProbe.motes);
  ok("AC5 canal FRESCO healPotency: flip OFF→ON cambia 0 de 13 peer channels (ward/gold/atk/crit/xp/vamp/loot/det/ess/mat/flask/gem/socket) + sub-cap hazardMoteCap 2 (score 999 ⇒ 2)",
     peers.peersUnchanged && subcap === 2, `peersUnchanged=${peers.peersUnchanged} subcap=${subcap} peersOff=${JSON.stringify(peers.peersOff)}`);

  // AC6 — ⊥ diferenciador. Con hazard T≥1, los previews de afijo#74/evento#75/variante#76/apex#73 NO cambian.
  const diff = await A.page.evaluate(() => {
    window.__dev.hazardSurge({ enabled: true });
    const h = window.__dev.hazardSurge().hero;
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const affixBefore = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : null;
    const eventBefore = window.__dev.zoneEvent ? window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score : null;
    const variantBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : null;
    const apexBefore = window.__dev.apex ? window.__dev.apex().tier : null;
    // hazard DoT×2 activos ⇒ score ≥3 ⇒ T2
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 3, ty: h.ty, type: "poison", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } });
    const vm = window.__dev.hazardSurge();
    const affixAfter = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : null;   // hazard NO es afijo ⇒ sin cambio
    const eventAfter = window.__dev.zoneEvent ? window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score : null;         // hazard NO es POI ⇒ sin cambio
    const variantAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : null; // hazard NO es mob ⇒ sin cambio
    const apexAfter = window.__dev.apex ? window.__dev.apex().tier : null;                                                    // hazard NO es jefe ⇒ tier 0
    const adEnabled = window.__dev.affixDanger ? window.__dev.affixDanger().enabled : null;
    const evEnabled = window.__dev.zoneEvent ? window.__dev.zoneEvent().enabled : null;
    const varEnabled = window.__dev.variantSurge ? window.__dev.variantSurge().enabled : null;
    const apEnabled = window.__dev.apex ? window.__dev.apex().enabled : null;
    window.__dev.hazardSurge({ enabled: false });
    return { hsTier: vm.tier, hsScore: vm.score, hsMotes: vm.motes, affixBefore, affixAfter, eventBefore, eventAfter, variantBefore, variantAfter, apexBefore, apexAfter, adEnabled, evEnabled, varEnabled, apEnabled };
  });
  const diffOK = diff.hsTier >= 2 && diff.hsScore >= 3 && diff.hsMotes >= 2 &&
    diff.affixAfter === diff.affixBefore && diff.eventAfter === diff.eventBefore && diff.variantAfter === diff.variantBefore &&
    diff.apexAfter === 0 && diff.apexBefore === 0 &&
    diff.adEnabled === true && diff.evEnabled === true && diff.varEnabled === true && diff.apEnabled === true;
  ok("AC6 ⊥ DIFERENCIADOR: hazard DoT×2 ⇒ hazardSurge T2 mientras afijo#74/evento#75/variante#76 (probes sin cambio) y apex#73 (tier 0) lo IGNORAN; afijo/evento/variante/apex LIVE coexisten enabled",
     diffOK, JSON.stringify(diff));

  // AC7a — 0-regresión 18 flags served enabled:true; ARENA_HAZARD_SURGE served false. Parse la config SERVIDA.
  const cfgSrc = await A.page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC18.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const hsDark = flag("ARENA_HAZARD_SURGE") === "false";
  ok("AC7a 0-regresión: 18 flags arco #59-#76 served enabled:true; ARENA_HAZARD_SURGE served false (DARK #77), la única false del arco",
     arcAllOn && hsDark && ARC18.length === 18, `hazardSurge=${flag("ARENA_HAZARD_SURGE")} allOn=${arcAllOn} off=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // AC7b — North Star 2-cliente 0-desync. Cliente B fresco. MISMO hazard+héroe ⇒ señal determinista + worldFingerprint byte-id.
  const B = await boot(browser, base);
  const buildB = await B.page.evaluate(() => window.__BUILD || null);
  const HAZ_TILE = { tx: 70, ty: 44 }, HERO_TILE = { tx: 74, ty: 44 };   // hazard 4 tiles oeste del héroe (~128px, en radio 260)
  const readVM = async (pg) => await pg.evaluate((HZ, HT) => {
    window.__dev.hazardSurge({ enabled: true });
    window.__dev.hazardSurge({ spawnHazard: { tx: HZ.tx, ty: HZ.ty, type: "magma", phase: "active" } });
    window.__dev.hazardSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.hazardSurge();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.hazardSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, motes: p.motes }; });
    const hp = window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.hazardSurge({ enabled: false });
    return { score: vm.score, tier: vm.tier, motes: vm.motes, hpScore: hp.score, hpCount: hp.count, lut, fp };
  }, HAZ_TILE, HERO_TILE);
  const vmA = await readVM(A.page);
  const vmB = await readVM(B.page);
  // activeHazardCount ambiental EXCLUIDO (contaminado por inyecciones de prueba de A + hazards naturales); el SIGNAL determinista per-snapshot es lo shard-consistente.
  const convOK = vmA.score === vmB.score && vmA.tier === vmB.tier && vmA.motes === vmB.motes &&
    vmA.hpScore === vmB.hpScore && JSON.stringify(vmA.lut) === JSON.stringify(vmB.lut) && vmA.fp === vmB.fp &&
    buildB === EXPECT_BUILD && vmA.tier >= 1;
  ok("AC7b North Star 2-cliente: MISMO hazard+héroe ⇒ score/tier/motes + hazardProbe.score + LUT + worldFingerprint byte-id (0 desync; activeHazardCount ambiental excluido)",
     convOK, `A={s:${vmA.score},t:${vmA.tier},m:${vmA.motes},hpS:${vmA.hpScore},fpLen:${vmA.fp.length}} B={s:${vmB.score},t:${vmB.tier},m:${vmB.motes},hpS:${vmB.hpScore},fpLen:${vmB.fp.length}} fpMatch=${vmA.fp === vmB.fp} buildB=${buildB}`);

  // screenshot evidence (hazard activo cerca del héroe, badge Hazard:▲ visible ON)
  await A.page.evaluate(() => { window.__dev.hazardSurge({ enabled: true }); const h = window.__dev.hazardSurge().hero; window.__dev.hazardSurge({ spawnHazard: { tx: h.tx + 2, ty: h.ty, type: "magma", phase: "active" } }); window.__dev.hazardSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  await new Promise(r => setTimeout(r, 400));
  await A.page.screenshot({ path: join(OUT, "selfverify.png") });
  await A.page.evaluate(() => window.__dev.hazardSurge({ enabled: false }));

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
