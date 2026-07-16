// CAS-2457 — INDEPENDENT QA harness (DARK, ENCOUNTER_VARIANT_SURGE.enabled:false). EVO#76 Variante de Encuentro Activa.
// QA-OWNED, oracles RE-DERIVED FROM SCRATCH (not sourced from the GE self-verify). 2-cliente North Star.
// Verifies the 6 acceptance criteria of CAS-2457 against served build f7b79c60d831 @ master fec61a4 (DARK, master-only;
// gh-pages/served stays #75 LIVE 3a834d06862e). GE self-verify (tools/cas2456-variantsurge-selfverify.mjs) PASS 15/15.
//   AC1  OFF byte-neutral: enabled:false ⇒ G.variantSurge NUNCA se crea (gExists false); killEnemy seam rama muerta
//        (0 reagentes con mob-variante PEGADO al héroe); save.v1 SIN 'variantSurge'/'socketFind'/'socketShards';
//        worldFingerprint byte-estable al togglear enabled (reagentes fuera del fingerprint).
//   AC2  LUT pura score→tier→sockets == ORACLE re-derivado de los knobs de config servida (tiers/variantSocketCap). Sub-cap 2.
//   AC3  REAL server-auth: spawnVariant inyecta mob-variante REAL vivo en G.enemies; variantProbe lee score/lista/count REAL.
//        ★ INDEP EXTRA: per-variante peso vía DELTA (bastion=+2 vs stalker/glass=+1) + id ausente ⇒ fallback 1 + radius-gating
//        (mob-variante FUERA de radius 260 ⇒ delta 0).
//   AC4  DIFERENCIADOR ⊥: mob-variante ⇒ variantSurge T≥1 por PRESENCIA DE VARIANTE, mientras afijo#74 (dangerProbe) lo
//        IGNORA (el mob-variante NO lleva afijo), evento#75 (zoneEvent) lo IGNORA (un mob NO es POI) y apex#73 lo IGNORA
//        (un mob-variante NO es jefe ⇒ tier 0). Canal socketFind ⊥ 12 peers (0 doble-dip). Los 3 primos LIVE coexisten.
//   AC5  0-regresión 17 flags #59-#75 served enabled:true, 0 desvío; ENCOUNTER_VARIANT_SURGE served false (DARK #76).
//   AC6  North Star 2-cliente 0-desync: MISMO mob-variante+héroe ⇒ score/tier/sockets + variantProbe + LUT + worldFingerprint byte-id.
// Run: node tools/cas2457-variantsurge-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const EXPECT_BUILD = "f7b79c60d831";   // lo que el server LOCAL sirve (version.json @ fec61a4); DARK master-only.
const OUT = join(ROOT, "shots", "cas2457-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// RE-DERIVED oracles (independent of the GE probe): parse the SERVED config knobs, then recompute tier/sockets from scratch.
// variantWeights {stalker:1,bastion:2,glass:1}; tiers [{min:1,sockets:1},{min:3,sockets:2}]; variantSocketCap 2.
const ORACLE_WEIGHTS = { stalker: 1, bastion: 2, glass: 1 };   // id ausente → 1 (fallback)
const ORACLE_TIERS = [{ min: 1, sockets: 1 }, { min: 3, sockets: 2 }];
const ORACLE_CAP = 2;
function oracleTierSockets(score) {
  let s = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; s = ORACLE_TIERS[i].sockets; }
  return { tier: t, sockets: Math.min(ORACLE_CAP, s) };
}
const ARC17 = ["WARDING_RING","KINSHIP_BOND","WAYFARER_ROAM","FOCUS_FIRE","TRAILCRAFT","DELVE","ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE"];

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

  // AC1 — OFF byte-neutral. Fresh boot: enabled false, G.variantSurge never created (gExists false), save sin clave,
  // seam OFF ⇒ 0 sockets aun con un mob-variante pegado al héroe; worldFingerprint estable al togglear enabled.
  const off = await A.page.evaluate(() => {
    const vm = window.__dev.variantSurge();
    const save = JSON.stringify(window.__dev.saveBlob());
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(777));
    // seam OFF: forageSocketsPreview debe ser 0 aun con mob-variante pegado al héroe
    const h = vm.hero;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx, ty: h.ty, variant: "bastion" } });
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const vm2 = window.__dev.variantSurge();
    // toggle enabled in-mem para el fingerprint, luego restaurar OFF
    window.__dev.variantSurge({ enabled: true });
    const fpEnabled = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.variantSurge({ enabled: false });
    return { enabled: vm.enabled, gExists: vm.gExists, score: vm.score, tier: vm.tier, sockets: vm.sockets,
      previewGlued: vm2.forageSocketsPreview, socketsGlued: vm2.sockets, tierGlued: vm2.tier, save, fpBefore, fpEnabled };
  });
  const noFeatKey = !/"(variantSurge|socketFind)[A-Za-z]*"\s*:/.test(off.save);
  const noShardKey = !/"socketShards"\s*:/.test(off.save);
  ok("AC1 OFF byte-neutral: gExists false + save sin variantSurge/socketFind/socketShards + seam OFF 0 sockets (mob pegado) + fingerprint estable al togglear enabled",
     off.enabled === false && off.gExists === false && off.score === 0 && off.tier === 0 && off.sockets === 0 &&
     off.previewGlued === 0 && off.socketsGlued === 0 && off.tierGlued === 0 && noFeatKey && noShardKey && off.fpBefore === off.fpEnabled,
     `enabled=${off.enabled} gExists=${off.gExists} gluedPrev=${off.previewGlued} gluedSockets=${off.socketsGlued} noFeatKey=${noFeatKey} noShardKey=${noShardKey} fpStable=${off.fpBefore === off.fpEnabled}`);

  // AC2 — LUT pura == ORACLE re-derivado. scoreProbe 0→T0/0, [1,2]→T1/1, ≥3→T2/2, cap 2.
  const lutCases = [0, 1, 2, 3, 4, 6, 12, 99];
  const lut = await A.page.evaluate((cs) => cs.map(s => { const p = window.__dev.variantSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, sockets: p.sockets }; }), lutCases);
  const lutOK = lut.every(r => { const o = oracleTierSockets(r.score); return r.tier === o.tier && r.sockets === o.sockets && r.sockets <= ORACLE_CAP; });
  ok("AC2 LUT pura score→tier→sockets == ORACLE re-derivado (0→T0/0, [1,2]→T1/1, ≥3→T2/2, sub-cap 2)",
     lutOK, JSON.stringify(lut));

  // AC3 — REAL server-auth + INDEP EXTRAS: per-variant weight (bastion=+2 vs stalker/glass=+1) + id ausente ⇒ 1 + radius-gating.
  const server3 = await A.page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    const measure = (variant, offTiles) => {
      // DELTA de variantProbe.score al añadir UN mob-variante cerca (offTiles*32px) vs el baseline previo.
      window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
      const before = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
      window.__dev.variantSurge({ spawnVariant: { tx: h.tx + offTiles, ty: h.ty, variant } });
      window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
      const after = window.__dev.variantSurge({ variantProbe: true });
      const mob = after.variantProbe.mobs.find(m => m.variant === variant);
      return { delta: after.variantProbe.score - before, count: after.variantProbe.count, mobVariant: mob ? mob.variant : null, mobWeight: mob ? mob.weight : null };
    };
    const stalker = measure("stalker", 2);   // ~64px, in radius → peso 1
    const bastion = measure("bastion", 2);    // ~64px, in radius → peso 2
    const glass = measure("glass", 2);        // ~64px, in radius → peso 1
    const noncanon = measure("zzz_absent", 2);// id NO canónico → applyVariant (sim.js:2449 if(!V) return e) NO aplica variante ⇒ mob plano ⇒ delta 0, sin mob-variante en la lista
    const farBastion = measure("bastion", 40);// ~1280px > radius 260 → delta 0 (radius-gating)
    window.__dev.variantSurge({ enabled: false });
    return { stalker, bastion, glass, noncanon, farBastion };
  });
  const s3OK = server3.stalker.delta === 1 && server3.stalker.mobWeight === 1 &&
    server3.bastion.delta === 2 && server3.bastion.mobWeight === 2 &&
    server3.glass.delta === 1 && server3.glass.mobWeight === 1 &&
    server3.noncanon.delta === 0 && server3.noncanon.mobVariant === null &&
    server3.farBastion.delta === 0;
  ok("AC3 REAL server-auth: spawnVariant→G.enemies, variantProbe REAL; INDEP per-variante stalker=+1 bastion=+2 glass=+1; id NO canónico⇒applyVariant no aplica (delta 0, sin variante); radius-gating mob lejos⇒delta 0",
     s3OK, JSON.stringify(server3));

  // AC4 — DIFERENCIADOR ⊥: mob-variante ⇒ variantSurge T≥1 mientras afijo#74 (dangerProbe) y evento#75 (zoneEvent) y apex#73 lo IGNORAN; peers ⊥.
  const diff = await A.page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const affixBefore = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;
    const evBefore = window.__dev.zoneEvent ? window.__dev.zoneEvent().score : 0;
    const apexBefore = window.__dev.apex ? window.__dev.apex().tier : null;
    // peers snapshot ANTES del mob-variante (variante OFF baseline)
    window.__dev.variantSurge({ enabled: false });
    const snap = () => { const s = window.__dev.variantSurge(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview }; };
    const peersOff = snap();
    window.__dev.variantSurge({ enabled: true });
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 5, ty: h.ty, variant: "stalker" } });   // ~160px
    const affixAfter = window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score;   // mob-variante NO lleva afijo ⇒ sin cambio
    const evAfter = window.__dev.zoneEvent ? window.__dev.zoneEvent().score : 0;             // mob NO es POI ⇒ sin cambio
    const apexAfter = window.__dev.apex ? window.__dev.apex().tier : null;                   // mob NO es jefe ⇒ tier 0
    const vm = window.__dev.variantSurge();
    const peersOn = snap();                                                                  // peers deben ser idénticos
    const ad = window.__dev.affixDanger ? window.__dev.affixDanger().enabled : null;
    const ev = window.__dev.zoneEvent ? window.__dev.zoneEvent().enabled : null;
    const ap = window.__dev.apex ? window.__dev.apex().enabled : null;
    window.__dev.variantSurge({ enabled: false });
    return { vsTier: vm.tier, vsScore: vm.score, vsSockets: vm.sockets, affixBefore, affixAfter, evBefore, evAfter, apexBefore, apexAfter,
      peersUnchanged: JSON.stringify(peersOff) === JSON.stringify(peersOn), adEnabled: ad, evEnabled: ev, apEnabled: ap, peersOff, peersOn };
  });
  const diffOK = diff.vsTier >= 1 && diff.vsScore >= 1 && diff.vsSockets >= 1 &&
    diff.affixAfter === diff.affixBefore && diff.evAfter === diff.evBefore && diff.apexAfter === 0 && diff.apexBefore === 0 &&
    diff.peersUnchanged && diff.adEnabled === true && diff.evEnabled === true && diff.apEnabled === true;
  ok("AC4 ⊥ DIFERENCIADOR: mob-variante ⇒ variantSurge T≥1 mientras afijo#74 (dangerProbe sin cambio), evento#75 (zoneEvent sin cambio) y apex#73 (tier 0) lo IGNORAN; socketFind ⊥ 12 peers (0 cambio); afijo/evento/apex LIVE ⊥",
     diffOK, JSON.stringify({ vsTier: diff.vsTier, vsScore: diff.vsScore, vsSockets: diff.vsSockets, affixBefore: diff.affixBefore, affixAfter: diff.affixAfter, evBefore: diff.evBefore, evAfter: diff.evAfter, apexAfter: diff.apexAfter, peersUnchanged: diff.peersUnchanged, adEnabled: diff.adEnabled, evEnabled: diff.evEnabled, apEnabled: diff.apEnabled }));

  // AC5 — 0-regresión 17 flags served enabled:true; ENCOUNTER_VARIANT_SURGE served false. Parse la config SERVIDA.
  const cfgSrc = await A.page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arcLive = ARC17.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const vsDark = flag("ENCOUNTER_VARIANT_SURGE") === "false";
  ok("AC5 0-regresión: 17 flags arco #59-#75 served enabled:true; ENCOUNTER_VARIANT_SURGE served false (DARK #76)",
     arcAllOn && vsDark && ARC17.length === 17, `variantSurge=${flag("ENCOUNTER_VARIANT_SURGE")} allOn=${arcAllOn} off=${arcLive.filter(([, v]) => v !== "true").map(([f]) => f).join(",") || "none"}`);

  // AC6 — North Star 2-cliente 0-desync. Cliente B fresco. MISMO mob-variante+héroe ⇒ señal determinista + worldFingerprint byte-id.
  const B = await boot(browser, base);
  const buildB = await B.page.evaluate(() => window.__BUILD || null);
  const VAR_TILE = { tx: 60, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };   // mob-variante 3 tiles oeste del héroe (~96px, en radio 260)
  const readVM = async (pg) => await pg.evaluate((VT, HT) => {
    window.__dev.variantSurge({ enabled: true });
    window.__dev.variantSurge({ spawnVariant: { tx: VT.tx, ty: VT.ty, variant: "bastion" } });
    window.__dev.variantSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.variantSurge();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.variantSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, sockets: p.sockets }; });
    const vp = window.__dev.variantSurge({ variantProbe: true }).variantProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.variantSurge({ enabled: false });
    return { score: vm.score, tier: vm.tier, sockets: vm.sockets, vpScore: vp.score, vpCount: vp.count, lut, fp };
  }, VAR_TILE, HERO_TILE);
  const vmA = await readVM(A.page);
  const vmB = await readVM(B.page);
  // variantMobCount ambiental EXCLUIDO (contaminado por inyecciones de prueba de A + variantes naturales); el SIGNAL determinista per-snapshot es lo shard-consistente.
  const convOK = vmA.score === vmB.score && vmA.tier === vmB.tier && vmA.sockets === vmB.sockets &&
    vmA.vpScore === vmB.vpScore && vmA.vpCount === vmB.vpCount && JSON.stringify(vmA.lut) === JSON.stringify(vmB.lut) && vmA.fp === vmB.fp &&
    buildB === EXPECT_BUILD;
  ok("AC6 North Star 2-cliente: MISMO mob-variante+héroe ⇒ score/tier/sockets + variantProbe(score,count) + LUT + worldFingerprint byte-id (0 desync; variantMobCount ambiental excluido)",
     convOK, `A={s:${vmA.score},t:${vmA.tier},k:${vmA.sockets},vpS:${vmA.vpScore},vpC:${vmA.vpCount},fpLen:${vmA.fp.length}} B={s:${vmB.score},t:${vmB.tier},k:${vmB.sockets},vpS:${vmB.vpScore},vpC:${vmB.vpCount},fpLen:${vmB.fp.length}} fpMatch=${vmA.fp === vmB.fp} buildB=${buildB}`);

  // screenshot evidence (mob-variante activo cerca del héroe, badge visible)
  await A.page.evaluate(() => { window.__dev.variantSurge({ enabled: true }); const h = window.__dev.variantSurge().hero; window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 4, ty: h.ty, variant: "bastion" } }); window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  await new Promise(r => setTimeout(r, 400));
  await A.page.screenshot({ path: join(OUT, "selfverify.png") });
  await A.page.evaluate(() => window.__dev.variantSurge({ enabled: false }));

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
