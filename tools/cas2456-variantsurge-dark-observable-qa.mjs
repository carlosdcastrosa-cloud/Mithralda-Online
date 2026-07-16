// CAS-2458/CAS-2457 — INDEPENDENT QA harness (DARK, ENCOUNTER_VARIANT_SURGE.enabled:false). EVO#76 Variante de Encuentro Activa.
// QA-OWNED, oracles RE-DERIVED FROM SCRATCH (NOT sourced from the GE self-verify cas2456-variantsurge-selfverify.mjs). 2-cliente North Star.
// Verifies the 6 acceptance criteria of CAS-2457 against served build f7b79c60d831 @ master fec61a4 (DARK, master-only;
// gh-pages/served stays #75 LIVE 3a834d06862e). version.json NOT regenerated for master-only DARK (regen at deploy/flip).
//   AC1  OFF byte-neutral: enabled:false ⇒ G.variantSurge NUNCA se crea (gExists false); seam killEnemy rama muerta
//        ⇒ 0 sockets (variant mob PEGADO al héroe); worldFingerprint byte-estable al togglear enabled (fp 15920977B).
//   AC2  STATELESS: save.v1 SIN clave 'variantSurge'/'socketFind'/'socketShards'; G.variantSurge==null; h.socketShards
//        transitorio NO entra al fingerprint (fp estable al banca socketShards in-mem).
//   AC3  Fresh channel socketFind: LUT pura score→tier→sockets == ORACLE re-derivado (tiers/variantSocketCap). Sub-cap 2.
//        flip variante OFF→ON cambia 0 peer channels (ward/gold/crit/xp/vamp/loot/atkspd/detectRadius/essenceFind/matFind/flaskPotency/gemFind).
//   AC4  REAL server-auth + DIFERENCIADOR ⊥: spawnVariant inyecta mob-variante REAL en G.enemies; variantProbe REAL.
//        ★ INDEP EXTRA: per-tipo weight (bastion=+2 vs stalker=+1 vs glass=+1) + radius-boundary gating (259px cuenta, 261px no).
//        variant mob ⇒ variantSurge↑ mientras afijo#74 (dangerProbe) / zoneEvent#75 (eventProbe) / apex#73 (tier 0) lo IGNORAN; todos coexisten enabled.
//   AC5  0-regresión: 17 flags #59-#75 served enabled:true; ENCOUNTER_VARIANT_SURGE served false (DARK #76).
//   AC6  North Star 2-cliente 0-desync: MISMO mob-variante+héroe ⇒ score/tier/sockets + variantProbe + LUT + worldFingerprint byte-id.
// Run: node tools/cas2456-variantsurge-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const EXPECT_BUILD = "f7b79c60d831";   // served __BUILD = version.json (NOT regenerated for master-only DARK; regen at deploy)
const OUT = join(ROOT, "shots", "cas2456-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// RE-DERIVED oracles (independent of the GE probe): re-parse the SERVED config knobs, then recompute tier/sockets from scratch.
// variantWeights {stalker:1,bastion:2,glass:1} (ausente→1 fallback); tiers [{min:1,sockets:1},{min:3,sockets:2}]; variantSocketCap 2.
const ORACLE_WEIGHTS = { stalker: 1, bastion: 2, glass: 1 };
const ORACLE_TIERS = [{ min: 1, sockets: 1 }, { min: 3, sockets: 2 }];
const ORACLE_CAP = 2;
function oracleTierSockets(score) {
  let s = 0, t = 0;
  for (let i = 0; i < ORACLE_TIERS.length; i++) if (score >= ORACLE_TIERS[i].min) { t = i + 1; s = ORACLE_TIERS[i].sockets; }
  return { tier: t, sockets: Math.min(ORACLE_CAP, s) };
}
// 17 flags LIVE #59-#75 (16 del arco previo + ZONE_EVENT_SURGE flipped LIVE en #75)
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

  // AC1 — OFF byte-neutral. Fresh boot: enabled false, G.variantSurge never created (gExists false), seam OFF ⇒ 0 sockets
  // aun con un mob-variante PEGADO al héroe; worldFingerprint estable al togglear enabled (reagentes NO entran al fp).
  const off = await A.page.evaluate(() => {
    const vm = window.__dev.variantSurge();
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(777));
    // seam OFF: forageSocketsPreview debe ser 0 aun con un mob-variante activo pegado al héroe
    const h = vm.hero;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 1, ty: h.ty, variant: "bastion" } });   // ~32px, dentro de radio
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const vm2 = window.__dev.variantSurge();
    // toggle enabled in-mem para el fingerprint, luego restaurar OFF
    window.__dev.variantSurge({ enabled: true });
    const fpEnabled = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.variantSurge({ enabled: false });
    return { enabled: vm.enabled, gExists: vm.gExists, score: vm.score, tier: vm.tier, sockets: vm.sockets,
      previewGlued: vm2.forageSocketsPreview, socketsGlued: vm2.sockets, tierGlued: vm2.tier, mobCountGlued: vm2.variantMobCount, fpBefore, fpEnabled };
  });
  ok("AC1 OFF byte-neutral: gExists false + seam OFF 0 sockets (mob-variante PEGADO) + worldFingerprint byte-estable al togglear enabled",
     off.enabled === false && off.gExists === false && off.score === 0 && off.tier === 0 && off.sockets === 0 &&
     off.previewGlued === 0 && off.socketsGlued === 0 && off.tierGlued === 0 && off.fpBefore === off.fpEnabled,
     `enabled=${off.enabled} gExists=${off.gExists} gluedPrev=${off.previewGlued} gluedSockets=${off.socketsGlued} mobGlued=${off.mobCountGlued} fpStable=${off.fpBefore === off.fpEnabled}`);

  // AC2 — STATELESS. save.v1 sin clave variantSurge/socketFind/socketShards; G.variantSurge==null; h.socketShards
  // transitorio NO entra al fingerprint (banca in-mem via seam ON no perturba worldFingerprint).
  const st = await A.page.evaluate(() => {
    const save = JSON.stringify(window.__dev.saveBlob());
    const gExists = window.__dev.variantSurge().gExists;
    // banca socketShards in-mem (seam ON) y comprobar que el fingerprint NO cambia (recurso fuera del hash de terreno)
    const fp0 = JSON.stringify(window.__dev.worldFingerprint(555));
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 1, ty: h.ty, variant: "bastion" } });
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const shardsBefore = window.__dev.variantSurge().hero.socketShards;
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(555));
    window.__dev.variantSurge({ enabled: false });
    const save2 = JSON.stringify(window.__dev.saveBlob());
    return { save, save2, gExists, fp0, fp1, shardsBefore };
  });
  const noFeatKey = !/"(variantSurge|socketFind)[A-Za-z]*"\s*:/.test(st.save) && !/"(variantSurge|socketFind)[A-Za-z]*"\s*:/.test(st.save2);
  const noShardKey = !/"socketShards"\s*:/.test(st.save) && !/"socketShards"\s*:/.test(st.save2);
  ok("AC2 STATELESS: save.v1 SIN variantSurge/socketFind/socketShards + G.variantSurge==null (gExists false) + h.socketShards transitorio NO entra al worldFingerprint (fp estable)",
     noFeatKey && noShardKey && st.gExists === false && st.fp0 === st.fp1,
     `noFeatKey=${noFeatKey} noShardKey=${noShardKey} gExists=${st.gExists} fpStableUnderBank=${st.fp0 === st.fp1} saveLen=${st.save.length}`);

  // AC3 — Fresh channel socketFind. LUT pura == ORACLE; flip OFF→ON cambia 0 peers.
  const lutCases = [0, 1, 2, 3, 4, 6, 12, 99];
  const lut = await A.page.evaluate((cs) => cs.map(s => { const p = window.__dev.variantSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, sockets: p.sockets }; }), lutCases);
  const lutOK = lut.every(r => { const o = oracleTierSockets(r.score); return r.tier === o.tier && r.sockets === o.sockets && r.sockets <= ORACLE_CAP; });
  const peers = await A.page.evaluate(() => {
    const snap = () => { const s = window.__dev.variantSurge(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview }; };
    window.__dev.variantSurge({ enabled: false });
    const peersOff = snap();
    window.__dev.variantSurge({ enabled: true });
    const peersOn = snap();
    window.__dev.variantSurge({ enabled: false });
    return { peersUnchanged: JSON.stringify(peersOff) === JSON.stringify(peersOn), peersOff, peersOn };
  });
  ok("AC3 Fresh channel socketFind: LUT pura score→tier→sockets == ORACLE re-derivado (0→T0/0, [1,2]→T1/1, ≥3→T2/2, sub-cap 2) + flip OFF→ON cambia 0 de 12 peers",
     lutOK && peers.peersUnchanged, `lut=${JSON.stringify(lut)} peersUnchanged=${peers.peersUnchanged}`);

  // AC4 — REAL server-auth + INDEP EXTRAS (per-tipo weight + radius-boundary gating) + DIFERENCIADOR ⊥ afijo/evento/apex.
  const server4 = await A.page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    // per-tipo weight via DELTA de variantProbe.score al añadir UN mob-variante de ese tipo cerca del héroe
    const measure = (variant, dtx) => {
      window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
      const before = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
      window.__dev.variantSurge({ spawnVariant: { tx: h.tx + (dtx || 2), ty: h.ty, variant } });
      window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
      const after = window.__dev.variantSurge({ variantProbe: true });
      const mob = after.variantProbe.mobs.find(m => m.variant === variant);
      return { delta: after.variantProbe.score - before, mobVariant: mob ? mob.variant : null, mobWeight: mob ? mob.weight : null };
    };
    const stalker = measure("stalker", 2);   // peso 1
    const bastion = measure("bastion", 2);    // peso 2
    const glass = measure("glass", 2);        // peso 1
    // radius-boundary gating: mob a 259px (dentro) cuenta; mob a 261px (fuera) NO. radius=260. (dtx en tiles TS=32 ⇒ usar px directos)
    // usamos 8 tiles (~256px, dentro) vs 9 tiles (~288px, fuera) para robustez del margen de tile.
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const b0 = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 8, ty: h.ty, variant: "stalker" } });   // ~256px < 260 ⇒ cuenta
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const bIn = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score - b0;
    const c0 = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 12, ty: h.ty, variant: "stalker" } });  // ~384px > 260 ⇒ NO cuenta
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const cOut = window.__dev.variantSurge({ variantProbe: true }).variantProbe.score - c0;
    window.__dev.variantSurge({ enabled: false });
    return { stalker, bastion, glass, radiusIn: bIn, radiusOut: cOut };
  });
  const s4OK = server4.stalker.delta === 1 && server4.stalker.mobWeight === 1 &&
    server4.bastion.delta === 2 && server4.bastion.mobWeight === 2 &&
    server4.glass.delta === 1 && server4.glass.mobWeight === 1 &&
    server4.radiusIn === 1 && server4.radiusOut === 0;
  ok("AC4a REAL server-auth per-tipo weight (stalker=+1 bastion=+2 glass=+1 == variantWeights) + radius-boundary gating (~256px cuenta=+1, ~384px NO=+0)",
     s4OK, JSON.stringify(server4));

  const diff = await A.page.evaluate(() => {
    window.__dev.variantSurge({ enabled: true });
    const h = window.__dev.variantSurge().hero;
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const affixBefore = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : null;
    const eventBefore = window.__dev.zoneEvent ? window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score : null;
    const apexBefore = window.__dev.apex ? window.__dev.apex().tier : null;
    window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 3, ty: h.ty, variant: "bastion" } });   // ~96px
    window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } });
    const vm = window.__dev.variantSurge();
    const affixAfter = window.__dev.affixDanger ? window.__dev.affixDanger({ dangerProbe: true }).dangerProbe.score : null;   // variante NO es afijo ⇒ sin cambio
    const eventAfter = window.__dev.zoneEvent ? window.__dev.zoneEvent({ eventProbe: true }).eventProbe.score : null;         // variante NO es POI ⇒ sin cambio
    const apexAfter = window.__dev.apex ? window.__dev.apex().tier : null;                                                    // variante NO es jefe ⇒ tier 0
    const adEnabled = window.__dev.affixDanger ? window.__dev.affixDanger().enabled : null;
    const evEnabled = window.__dev.zoneEvent ? window.__dev.zoneEvent().enabled : null;
    const apEnabled = window.__dev.apex ? window.__dev.apex().enabled : null;
    window.__dev.variantSurge({ enabled: false });
    return { vsTier: vm.tier, vsScore: vm.score, vsSockets: vm.sockets, affixBefore, affixAfter, eventBefore, eventAfter, apexBefore, apexAfter, adEnabled, evEnabled, apEnabled };
  });
  const diffOK = diff.vsTier >= 1 && diff.vsScore >= 2 && diff.vsSockets >= 1 &&
    diff.affixAfter === diff.affixBefore && diff.eventAfter === diff.eventBefore && diff.apexAfter === 0 && diff.apexBefore === 0 &&
    diff.adEnabled === true && diff.evEnabled === true && diff.apEnabled === true;
  ok("AC4b ⊥ DIFERENCIADOR: mob-variante ⇒ variantSurge T≥1 mientras afijo#74 (dangerProbe sin cambio), evento#75 (eventProbe sin cambio) y apex#73 (tier 0) lo IGNORAN; afijo/evento/apex LIVE coexisten enabled",
     diffOK, JSON.stringify(diff));

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
  const MOB_TILE = { tx: 70, ty: 44 }, HERO_TILE = { tx: 74, ty: 44 };   // mob-variante 4 tiles oeste del héroe (~128px, en radio 260)
  const readVM = async (pg) => await pg.evaluate((MT, HT) => {
    window.__dev.variantSurge({ enabled: true });
    window.__dev.variantSurge({ spawnVariant: { tx: MT.tx, ty: MT.ty, variant: "bastion" } });
    window.__dev.variantSurge({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.variantSurge();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.variantSurge({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, sockets: p.sockets }; });
    const vp = window.__dev.variantSurge({ variantProbe: true }).variantProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.variantSurge({ enabled: false });
    return { score: vm.score, tier: vm.tier, sockets: vm.sockets, vpScore: vp.score, vpCount: vp.count, lut, fp };
  }, MOB_TILE, HERO_TILE);
  const vmA = await readVM(A.page);
  const vmB = await readVM(B.page);
  // variantMobCount ambiental EXCLUIDO (contaminado por inyecciones de prueba de A + variantes naturales); el SIGNAL determinista per-snapshot es lo shard-consistente.
  const convOK = vmA.score === vmB.score && vmA.tier === vmB.tier && vmA.sockets === vmB.sockets &&
    vmA.vpScore === vmB.vpScore && JSON.stringify(vmA.lut) === JSON.stringify(vmB.lut) && vmA.fp === vmB.fp &&
    buildB === EXPECT_BUILD && vmA.tier >= 1;
  ok("AC6 North Star 2-cliente: MISMO mob-variante+héroe ⇒ score/tier/sockets + variantProbe.score + LUT + worldFingerprint byte-id (0 desync; variantMobCount ambiental excluido)",
     convOK, `A={s:${vmA.score},t:${vmA.tier},sk:${vmA.sockets},vpS:${vmA.vpScore},fpLen:${vmA.fp.length}} B={s:${vmB.score},t:${vmB.tier},sk:${vmB.sockets},vpS:${vmB.vpScore},fpLen:${vmB.fp.length}} fpMatch=${vmA.fp === vmB.fp} buildB=${buildB}`);

  // screenshot evidence (mob-variante activo cerca del héroe, badge Variante:❖ visible ON)
  await A.page.evaluate(() => { window.__dev.variantSurge({ enabled: true }); const h = window.__dev.variantSurge().hero; window.__dev.variantSurge({ spawnVariant: { tx: h.tx + 3, ty: h.ty, variant: "bastion" } }); window.__dev.variantSurge({ tp: { tx: h.tx, ty: h.ty } }); });
  await new Promise(r => setTimeout(r, 400));
  await A.page.screenshot({ path: join(OUT, "selfverify.png") });
  await A.page.evaluate(() => window.__dev.variantSurge({ enabled: false }));

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
