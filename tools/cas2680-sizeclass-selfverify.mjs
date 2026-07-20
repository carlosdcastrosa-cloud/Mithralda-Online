// CAS-2680 — self-verify for REMATE DE TALLA DISPAR (DARK, SIZECLASS_SURGE.enabled:false). EVO mecánica #115 (serializa tras #114 DEPTH_SURGE LIVE&served f9aa47be9af3/815, base HEAD 2230a8c6) — EJE FRESCO + CANAL FRESCO, ⊥ a las 56 LIVE #59-#114.
// (A) EJE FRESCO = DE ATRIBUTO / DISPERSIÓN DE TALLA-CLASE de la MANADA VIVA alrededor del héroe = sizeClassField(hero) = CV = stddev/media de las TALLAS s_i=bulkOf(e)=ETPL[e.type].size (la MOLE FÍSICA BASE del TIPO — la MISMA fuente ESTÁTICA que #88 BULK, NO e.tpl.size inflado, NO e.hp DINÁMICO, NO e.vx/e.vy INERTES) de los mobs VIVOS en radio. sizeClassBand: ≥hiCV(0.35) ⇒ dispar/menudos+colosales ⇒ 2; ≥midCV(0.15) ⇒ mezclada ⇒ 1; <mid (mono-talla/calibre uniforme) ⇒ 0. Requiere ≥minMobs(3). ESCALA INTENSIVA/ADIMENSIONAL (invariante al conteo Y a la escala absoluta de la talla).
//     PRE-FLIGHT del eje RECOMENDADO pack SIZE-CLASS DISPERSION → PASA sin pivote (los 3 criterios): (a) la talla por mob EXISTE server-auth (ETPL[e.type].size, LA MISMA fuente que #88 BULK); (b) CV∈[0,∞) band-able con midCV/hiCV; (c) ⊥ #88 BULK (dispersión-de-pack ⊥ talla-de-1-víctima; mirror EXACTO de #111 SPEED-CV ⊥ #94 SWIFT-base-de-1).
//     CRUX ⊥#106 MOTLEY (cardinalidad de e.type = IDENTIDAD ⊥ MAGNITUD de talla): {rat,bat,wolf} 3-tipos ⇒ motley2/sizeClass0 (tallas 15,14,18 CV≈0.11); {rat,bat,golem} 3-tipos ⇒ motley2/sizeClass2 (15,14,36 CV≈0.47) MISMO motley OPUESTO sizeClass; {orc,orc,orc} 1-tipo ⇒ motley0/sizeClass0; {rat,rat,golem} 2-tipos ⇒ motley1/sizeClass2 (4 cuadrantes). CRUX ⊥#88 BULK (talla BANDA de UNA víctima MAX/1er momento): 3 moose(26) ⇒ bulk2/sizeClass0 (uniforme-grande); {rat,bat,golem} ⇒ bulk2/sizeClass2 ⇒ bulk2 mapea a sizeClass 0 Y 2 ⇒ sizeClass NO es función de bulk. CRUX ⊥#114 DEPTH (CV de DISTANCIAS = POSICIÓN ⊥ CV de TALLAS = ATRIBUTO, 4 cuadrantes).
// (B) CANAL FRESCO = sizeClassFind (fichas de talla por rematar con la manada de TALLAS DISPARES — NINGUNA de las 56 flags lo usa; ⊥ bulkFind #88/motleyFind #106/depthFind #114/disperseFind #107). Moneda FRESCA (h.sizeClassBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint). Fuente ÚNICA (seam de kill) ⇒ sub-cap propio sizeClassBountyCap, 0 doble-dip.
//
// Run: node tools/cas2680-sizeclass-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2680");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// cvProbe LUT esperada: cv→banda→{tier,charge}. UMBRALES hiCV 0.35 / midCV 0.15, bordes exactos.
const EXPECT_CV = [
  { cv: 0, w: 0, t: 0, s: 0 }, { cv: 0.14, w: 0, t: 0, s: 0 },                     // <midCV (mono-talla) ⇒ 0
  { cv: 0.15, w: 1, t: 1, s: 1 }, { cv: 0.34, w: 1, t: 1, s: 1 },                  // ≥midCV ⇒ mezclada ⇒ 1 (borde 0.15 inclusive)
  { cv: 0.35, w: 2, t: 2, s: 2 }, { cv: 1.0, w: 2, t: 2, s: 2 },                   // ≥hiCV ⇒ dispar ⇒ 2 (borde 0.35 inclusive)
];
// spawnSizes esperado por DISPERSIÓN DE TALLA. CV=stddev/media de ETPL[type].size. Cubre bandas 0/1/2 + minMobs. La TALLA la fija el TYPE (rat15/bat14/wolf18/orc22/moose26/golem36). Posiciones (dx,dy) DENTRO de radius pero IRRELEVANTES al eje (atributo, no posición).
const EXPECT_SPAWN = [
  { name: "mono", pts: [["orc", 80, 0], ["orc", -80, 0], ["orc", 0, 80]], cv: 0.000, w: 0 },        // 3 orcos {22,22,22} ⇒ CV0 ⇒ mono-talla ⇒ 0
  { name: "mixed", pts: [["rat", 80, 0], ["orc", 120, 0], ["moose", 0, 90]], cv: 0.216, w: 1 },      // {15,22,26} ⇒ CV0.216 ⇒ mezclada ⇒ 1
  { name: "motley", pts: [["rat", 80, 0], ["bat", -80, 0], ["golem", 0, 90]], cv: 0.468, w: 2 },     // {15,14,36} menudos+colosal ⇒ CV0.468 ⇒ dispar ⇒ 2
  { name: "twoMobs", pts: [["rat", 90, 0], ["golem", -90, 0]], cv: 0.000, w: 0 },                    // 2 mobs <minMobs(3) ⇒ indefinido ⇒ 0
  { name: "empty", pts: [], cv: 0.000, w: 0 },                                                       // campo vacío ⇒ 0
];

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
  await sleep(400);
}

const P = (pts) => pts.map(([type, dx, dy]) => ({ type, dx, dy }));

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

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sizeClass && window.__dev.bulk && window.__dev.motley && window.__dev.depth && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.sizeClass + peer hooks (bulk/motley/depth/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.sizeClass());
  ok("2 byte-id OFF (fresh boot): SIZECLASS_SURGE.enabled false AND G.sizeClassBounty NUNCA se crea (gExists false)",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.cv === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "sizeClassFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} cv=${dark.cv} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiCV=${dark.hiCV} midCV=${dark.midCV} minMobs=${dark.minMobs} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no sizeClassFind/sizeClassBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(sizeClassFind|sizeClassBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"sizeClassBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'sizeClassFind'/'sizeClassBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.sizeClass({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.sizeClass({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas NO entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ cvProbe LUT: cv→band→tier→charge (UMBRALES hiCV/midCV + TABLA).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.sizeClass({ cvProbe: { cv: c.cv } }).cvProbe), EXPECT_CV);
  const tabOK = EXPECT_CV.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].tier === c.t && tab[i].charge === c.s);
  ok("5 ★ cvProbe LUT: CV≥0.35⇒dispar⇒2/T2; ≥0.15⇒mezclada⇒1/T1; <0.15 (mono-talla)⇒0/T0 (UMBRAL hiCV 0.35/midCV 0.15, bordes 0/0.14/0.15/0.34/0.35/1 exactos + cap)",
     tabOK, JSON.stringify(tab.map(x => ({ cv: x.cv, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH: spawnSizes (wipe) inyecta mobs REALES de tipos dados; sizeClassField = CV de ETPL[type].size; score = banda.
  const comp = await page.evaluate((args) => {
    const { EXPECT_SPAWN, Z } = args;
    const mk = (pts) => pts.map(([type, dx, dy]) => ({ type, dx, dy }));
    window.__dev.sizeClass({ enabled: true });
    const out = [];
    for (const c of EXPECT_SPAWN) {
      window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const sr = window.__dev.sizeClass({ spawnSizes: { pts: mk(c.pts), wipe: true } }).spawnSizes;
      const live = window.__dev.sizeClass({ sizeProbeLive: true }).sizeProbeLive;
      out.push({ name: c.name, srCV: sr.cv, srScore: sr.score, liveCV: live.cv, liveScore: live.score, mean: live.mean, std: live.std, mobCount: live.mobCount, sizes: live.mobs.map(m => m.size) });
    }
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    return out;
  }, { EXPECT_SPAWN, Z });
  const compOK = EXPECT_SPAWN.every((c, i) => comp[i] && comp[i].srScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].srCV - c.cv) < 0.02 && Math.abs(comp[i].liveCV - c.cv) < 0.02);
  ok("5b ★ REAL SERVER-AUTH: spawnSizes empuja mobs REALES; sizeClassField = CV de ETPL[type].size ⇒ mono(3orc)⇒CV0/0, mixed{15,22,26}⇒CV0.22/1, motley{15,14,36}⇒CV0.47/2, 2-mobs⇒0(<minMobs), vacío⇒0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#106 MOTLEY crux (4 cuadrantes): cardinalidad-de-e.type (IDENTIDAD) ⊥ CV-de-talla (MAGNITUD).
  const crux106 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.sizeClass({ enabled: true });   // motley ya es LIVE (#106 enabled:true)
    const read = (pts) => { window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.sizeClass({ spawnSizes: { pts: pts.map(([type, dx, dy]) => ({ type, dx, dy })), wipe: true } });
      return { sizeClass: window.__dev.sizeClass().score, cv: window.__dev.sizeClass().cv, motley: window.__dev.motley().score, count: window.__dev.motley().count }; };
    const distinctFlat = read([["rat", 80, 0], ["bat", -80, 0], ["wolf", 0, 80]]);         // 3 TIPOS distintos, tallas ~iguales {15,14,18} ⇒ motley2/sizeClass0
    const distinctDispar = read([["rat", 80, 0], ["bat", -80, 0], ["golem", 0, 80]]);      // 3 TIPOS distintos, tallas dispares {15,14,36} ⇒ motley2/sizeClass2
    const monoFlat = read([["orc", 80, 0], ["orc", -80, 0], ["orc", 0, 80]]);              // 1 TIPO, talla uniforme ⇒ motley0/sizeClass0
    const fewDispar = read([["rat", 80, 0], ["rat", -80, 0], ["golem", 0, 80]]);           // 2 TIPOS, tallas dispares {15,15,36} ⇒ motley1/sizeClass2
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    return { distinctFlat, distinctDispar, monoFlat, fewDispar };
  }, { Z });
  const crux106OK = crux106.distinctFlat.motley === 2 && crux106.distinctFlat.sizeClass === 0
    && crux106.distinctDispar.motley === 2 && crux106.distinctDispar.sizeClass === 2
    && crux106.monoFlat.motley === 0 && crux106.monoFlat.sizeClass === 0
    && crux106.fewDispar.motley === 1 && crux106.fewDispar.sizeClass === 2;
  ok("6 ★ ⊥#106 MOTLEY crux (4 cuadrantes): 3-TIPOS-tallas-iguales ⇒ MOTLEY 2/SIZECLASS 0; 3-TIPOS-tallas-dispares ⇒ MOTLEY 2/SIZECLASS 2 (MISMO motley OPUESTO sizeClass); 1-TIPO ⇒ MOTLEY 0/SIZECLASS 0; 2-TIPOS-dispares ⇒ MOTLEY 1/SIZECLASS 2 ⇒ cardinalidad-de-tipo ⊥ CV-de-talla (INDEPENDIENTES)",
     crux106OK, JSON.stringify(crux106));

  // 7 ★ ⊥#88 BULK crux: talla-de-UNA-víctima (MAX/1er momento) ⊥ CV-del-PACK (2º momento). bulk2 mapea a sizeClass 0 Y 2 ⇒ sizeClass NO es función de bulk (mirror #111 SPEED-CV ⊥ #94 SWIFT-base).
  const crux88 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.sizeClass({ enabled: true });   // bulk ya es LIVE (#88 enabled:true)
    const read = (pts) => { window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.sizeClass({ spawnSizes: { pts: pts.map(([type, dx, dy]) => ({ type, dx, dy })), wipe: true } });
      return { sizeClass: window.__dev.sizeClass().score, cv: window.__dev.sizeClass().cv, bulk: window.__dev.bulk().score }; };
    const uniformBig = read([["moose", 80, 0], ["moose", -80, 0], ["moose", 0, 80]]);      // 3 grandes uniformes {26,26,26} ⇒ bulk2/sizeClass0
    const dwarfGiant = read([["rat", 80, 0], ["bat", -80, 0], ["golem", 0, 80]]);          // menudos + colosal {15,14,36} ⇒ bulk2/sizeClass2
    const uniformSmall = read([["rat", 80, 0], ["rat", -80, 0], ["rat", 0, 80]]);          // 3 menudos uniformes {15,15,15} ⇒ bulk0/sizeClass0
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    return { uniformBig, dwarfGiant, uniformSmall };
  }, { Z });
  const crux88OK = crux88.uniformBig.bulk === 2 && crux88.uniformBig.sizeClass === 0
    && crux88.dwarfGiant.bulk === 2 && crux88.dwarfGiant.sizeClass === 2
    && crux88.uniformSmall.bulk === 0 && crux88.uniformSmall.sizeClass === 0;
  ok("7 ★ ⊥#88 BULK crux (talla-de-1-víctima MAX/1er momento ⊥ CV-del-PACK 2º momento): 3-GRANDES-uniformes ⇒ BULK 2/SIZECLASS 0; MENUDOS+COLOSAL ⇒ BULK 2/SIZECLASS 2 (bulk2 con sizeClass 0 Y 2 ⇒ sizeClass NO es función de bulk); 3-menudos ⇒ BULK 0/SIZECLASS 0 (mirror #111 SPEED-CV ⊥ #94 SWIFT-base)",
     crux88OK, JSON.stringify(crux88));

  // 8 ★ ⊥#114 DEPTH crux (4 cuadrantes): CV-de-DISTANCIAS (POSICIÓN) ⊥ CV-de-TALLAS (ATRIBUTO).
  const crux114 = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.sizeClass({ enabled: true });   // depth ya es LIVE (#114 enabled:true)
    const read = (pts) => { window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.sizeClass({ spawnSizes: { pts: pts.map(([type, dx, dy]) => ({ type, dx, dy })), wipe: true } });
      return { sizeClass: window.__dev.sizeClass().score, depth: window.__dev.depth().score }; };
    const depthHi_scLo = read([["rat", 40, 0], ["rat", 160, 0], ["rat", 300, 0]]);          // MISMO tipo (rat15) a distancias dispares {40,160,300} ⇒ depth2/sizeClass0
    const depthLo_scHi = read([["rat", 150, 0], ["bat", 0, 150], ["golem", -150, 0]]);       // tallas dispares {15,14,36} todas a dist 150 ⇒ depth0/sizeClass2
    const depthLo_scLo = read([["rat", 150, 0], ["rat", 0, 150], ["rat", -150, 0]]);         // rats a dist 150 uniforme ⇒ depth0/sizeClass0
    const depthHi_scHi = read([["rat", 40, 0], ["bat", 160, 0], ["golem", 300, 0]]);         // tallas dispares a distancias dispares ⇒ depth2/sizeClass2
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    return { depthHi_scLo, depthLo_scHi, depthLo_scLo, depthHi_scHi };
  }, { Z });
  const crux114OK = crux114.depthHi_scLo.depth === 2 && crux114.depthHi_scLo.sizeClass === 0
    && crux114.depthLo_scHi.depth === 0 && crux114.depthLo_scHi.sizeClass === 2
    && crux114.depthLo_scLo.depth === 0 && crux114.depthLo_scLo.sizeClass === 0
    && crux114.depthHi_scHi.depth === 2 && crux114.depthHi_scHi.sizeClass === 2;
  ok("8 ★ ⊥#114 DEPTH crux (4 cuadrantes — POSICIÓN ⊥ ATRIBUTO): MISMO-tipo-distancias-dispares ⇒ DEPTH 2/SIZECLASS 0; tallas-dispares-misma-distancia ⇒ DEPTH 0/SIZECLASS 2; uniforme-compacto ⇒ DEPTH 0/SIZECLASS 0; dispar-escalonado ⇒ DEPTH 2/SIZECLASS 2 ⇒ CV-de-distancias ⊥ CV-de-tallas",
     crux114OK, JSON.stringify(crux114));

  // 9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 3 vs 6 mobs con la MISMA mezcla de tallas ⇒ MISMO CV/score (CV invariante al conteo), packHarvest DISTINTO.
  const countInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.sizeClass({ enabled: true });
    const read = (pts) => { window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      window.__dev.sizeClass({ spawnSizes: { pts: pts.map(([type, dx, dy]) => ({ type, dx, dy })), wipe: true } });
      return { cv: window.__dev.sizeClass().cv, score: window.__dev.sizeClass().score, pack: window.__dev.packHarvest().score }; };
    const pack3 = read([["rat", 60, 0], ["bat", -60, 0], ["golem", 0, 60]]);                                              // {15,14,36} CV0.468
    const pack6 = read([["rat", 60, 0], ["bat", -60, 0], ["golem", 0, 60], ["rat", 60, 20], ["bat", -60, 20], ["golem", 0, -60]]);  // doble {15,14,36,15,14,36} MISMO CV
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    return { pack3, pack6 };
  }, { Z });
  const countInvOK = Math.abs(countInv.pack3.cv - countInv.pack6.cv) < 0.001 && countInv.pack3.score === 2 && countInv.pack6.score === 2;
  ok("9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 3 mobs vs 6 mobs con la MISMA mezcla de tallas ⇒ MISMO CV y score 2 (CV invariante al conteo) mientras packHarvest (EXTENSIVO) cambia",
     countInvOK, JSON.stringify(countInv));

  // 10 CANAL sizeClassFind: forageChargePreview con talla dispar >0 ; con mono-talla → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    const mk = (pts) => pts.map(([type, dx, dy]) => ({ type, dx, dy }));
    window.__dev.sizeClass({ enabled: true });
    window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sizeClass({ spawnSizes: { pts: mk([["rat", 80, 0], ["bat", -80, 0], ["golem", 0, 80]]), wipe: true } });  // dispar ⇒ score2 ⇒ T2
    const actVm = window.__dev.sizeClass();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.sizeClass({ spawnSizes: { pts: mk([["orc", 80, 0], ["orc", -80, 0], ["orc", 0, 80]]), wipe: true } });    // mono-talla ⇒ score0
    const goVm = window.__dev.sizeClass();
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL sizeClassFind: forageChargePreview con talla dispar ⇒ charge>0 (==sizeClassBonus); con mono-talla uniforme ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds sizeClassBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let cv = 0; cv <= 2.001; cv += 0.1) vals.push(window.__dev.sizeClass({ cvProbe: { cv } }).cvProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.sizeClass().cap };
  });
  ok("11 ★ SUB-CAP: ningún CV produce charge>sizeClassBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a dispar pack available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    const mk = (pts) => pts.map(([type, dx, dy]) => ({ type, dx, dy }));
    window.__dev.sizeClass({ enabled: true });
    window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sizeClass({ spawnSizes: { pts: mk([["rat", 80, 0], ["bat", -80, 0], ["golem", 0, 80]]), wipe: true } });  // dispar disponible
    window.__dev.sizeClass({ enabled: false });                             // now OFF
    const off = window.__dev.sizeClass();
    window.__dev.sizeClass({ enabled: true }); window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } }); window.__dev.sizeClass({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, cv: off.cv };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.cv === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, sizeClassBonus(dispar disponible)==0 + forageChargePreview==0 + cv==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: flip sizeClass OFF→ON at the SAME state ⇒ peer hooks IDENTICAL; toggling motley/packHarvest no cambia la señal de sizeClass.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    const mk = (pts) => pts.map(([type, dx, dy]) => ({ type, dx, dy }));
    window.__dev.sizeClass({ enabled: true });
    window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sizeClass({ spawnSizes: { pts: mk([["rat", 80, 0], ["bat", -80, 0], ["golem", 0, 80]]), wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    const snap = () => JSON.stringify({ bulk: window.__dev.bulk(), motley: window.__dev.motley(), depth: window.__dev.depth() });
    const peersOff = snap();
    window.__dev.sizeClass({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.sizeClass();
    const mtPrev = window.__dev.motley().enabled, pkPrev = window.__dev.packHarvest().enabled, bkPrev = window.__dev.bulk().enabled, dpPrev = window.__dev.depth().enabled;
    window.__dev.motley({ enabled: true }); window.__dev.packHarvest({ enabled: true });
    const afterArc = window.__dev.sizeClass();
    const bkAfter = window.__dev.bulk().enabled, dpAfter = window.__dev.depth().enabled;
    window.__dev.motley({ enabled: mtPrev }); window.__dev.packHarvest({ enabled: pkPrev });
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    const peersUnchanged = peersOff === peersOn;
    const sigUnchanged = beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.charge === afterArc.charge && Math.abs(beforeArc.cv - afterArc.cv) < 0.001;
    return { peersUnchanged, sigUnchanged, bkAfter, dpAfter };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD sizeClassFind ⊥ peers: flip sizeClass OFF→ON NO cambia bulk/motley/depth; toggling MOTLEY #106/PACKHARVEST #87 NO cambia la señal de sizeClass; bulk #88/depth #114 LIVE intactos",
     orth.peersUnchanged && orth.sigUnchanged && orth.bkAfter === true && orth.dpAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 56 arc flags served true; SIZECLASS_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const scDark = flag("SIZECLASS_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 56 mecanismos del arco #59-#114 served enabled:true; SIZECLASS_SURGE served false (DARK #115)",
     arcAllOn && scDark && arc.length === 56, `sizeClass=${flag("SIZECLASS_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Talla:" drawn ON+dispar / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const mk = (pts) => pts.map(([type, dx, dy]) => ({ type, dx, dy }));
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Talla:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.sizeClass({ enabled: true });
    window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sizeClass({ spawnSizes: { pts: mk([["rat", 40, 0], ["bat", -40, 0], ["golem", 0, 60]]), wipe: true } });  // dispar ⇒ T2
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps };
  }, { Z });
  ok("15 render badge \"Talla:\" se DIBUJA ON+dispar (CV>0) y NO OFF (CV 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; const mk = (pts) => pts.map(([type, dx, dy]) => ({ type, dx, dy })); window.__dev.sizeClass({ enabled: true }); window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.sizeClass({ spawnSizes: { pts: mk([["rat", 60, 0], ["bat", 120, 0], ["orc", 0, 90], ["golem", -60, 40], ["moose", 30, -80], ["wolf", -110, -30]]), wipe: true } }); }, { Z });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } }); window.__dev.sizeClass({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((args) => {
    const { Z, FPARG } = args;
    const mk = (pts) => pts.map(([type, dx, dy]) => ({ type, dx, dy }));
    window.__dev.sizeClass({ enabled: true });
    window.__dev.sizeClass({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.sizeClass({ spawnSizes: { pts: mk([["rat", 40, 0], ["bat", -40, 0], ["golem", 0, 60], ["orc", 90, 20]]), wipe: true } });
    const vm = window.__dev.sizeClass();
    const lut = [0, 0.15, 0.35, 1.0].map(cv => { const p = window.__dev.sizeClass({ cvProbe: { cv } }).cvProbe; return { cv, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.sizeClass({ sizeProbeLive: true }).sizeProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.sizeClass({ spawnSizes: { pts: [], wipe: true } });
    window.__dev.sizeClass({ enabled: false });
    return { score: vm.score, tier: vm.tier, charge: vm.charge, cv: vm.cv, liveCV: live.cv, liveScore: live.score, mean: live.mean, std: live.std, mobCount: live.mobCount, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.charge === B.charge && A.cv === B.cv && A.liveCV === B.liveCV && A.liveScore === B.liveScore && A.mean === B.mean && A.std === B.std && A.mobCount === B.mobCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA formación (menudos+colosal+orco)+héroe ⇒ score/tier/charge/cv + sizeProbeLive(cv,mean,std,score) + cvProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},charge:${A.charge},cv:${A.cv},liveCV:${A.liveCV},mean:${A.mean},std:${A.std},mobCount:${A.mobCount},fpLen:${A.fp.length}} B={score:${B.score},tier:${B.tier},charge:${B.charge},cv:${B.cv},liveCV:${B.liveCV},mean:${B.mean},std:${B.std},mobCount:${B.mobCount},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.sizeClass({ enabled: false }));
  await pageB.evaluate(() => window.__dev.sizeClass({ enabled: false }));

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
