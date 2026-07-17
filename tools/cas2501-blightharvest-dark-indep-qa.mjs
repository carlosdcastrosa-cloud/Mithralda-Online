// CAS-2501 — Gate 2/2 DARK QA INDEPENDIENTE para COSECHA DE PLAGA (DARK, BLIGHT_HARVEST_SURGE.enabled:false) @ 96df5d8.
// EVO mecánica #83 (serializa tras #82 MAELSTROM_FIELD_SURGE LIVE&closed). Oráculos RE-DERIVADOS aquí en JS puro — NO confío
// en el harness del GE (cas2497) ni en el mío previo. Verifico contra el estado SERVIDO del clone fresco 96df5d8 (==origin/master).
//
// EJE FRESCO = PRESENCIA/DENSIDAD DE AFLICCIONES DE ESTADO (DoT) ACTIVAS sobre los MOBS VIVOS de la vecindad server-auth:
//   blightHarvestScore(hero) = Σ blightAfflict(e) sobre los mobs VIVOS de G.enemies cuyo centro cae en radius(260) del héroe.
//   blightAfflict(e) = Σ blightWeights[tipo] sobre las claves de e.dots (poison/burn); un mob veneno+quemadura pesa 2. FILTRA !e.dead.
//   e.dots = estado REPLICADO/AUTORITATIVO: poblado por applyStatus (afijo Ardiente/boons/resinas/ataques), tickeado por updateEnemies/tickDots.
// CANAL FRESCO = blightFind → h.blightHarvest (esencias de plaga, recurso TRANSITORIO, fuera del save allowlist + worldFingerprint).
//
// Oráculos re-derivados (JS puro, independientes del código servido):
//   LUT: score<2→T0/0 · [2,3]→T1/1 · ≥4→T2/2 · sub-cap blightHarvestCap=2.
//   PESOS: poison=1, burn=1 ⇒ poison-solo=1, burn-solo=1, veneno+quemadura=2.
//   RADIO: 260px. TS=32 ⇒ Δ8 tiles=256px IN, Δ9 tiles=288px OUT.
// Checks:
//   1  boots play + __dev.blightHarvest + arc hooks + saveBlob/worldFingerprint + __BUILD, 0 err
//   2  BYTE-NEUTRAL OFF fresh boot: enabled false, gExists false, score/tier/harvest/preview 0, channel blightFind, tag ""
//   3  STATELESS save: saveBlob() SIN clave blightFind*/blightHarvest*
//   4  STATELESS fingerprint: worldFingerprint byte-idéntico a través del toggle enabled
//   5  LUT re-derivada (JS puro) == scoreProbe servida
//   6  PESOS re-derivados == spawnBlight servido: poison-solo⇒1, burn-solo⇒1, veneno+quemadura⇒2
//   7  RADIO re-derivado (260px): Δ8=256px IN (count≥1,score≥1), Δ9=288px OUT (count 0,score 0)
//   8  REAL SERVER-AUTH: spawnBlight→G.enemies real; blightProbe score REAL>0 + mob listado (weight2,dots2) + mobCount≥1
//   9  SUB-CAP blightHarvestCap=2: ningún score 0..50 produce harvest>2
//  10  TABLA/UMBRAL: 1 mob poison-solo score1⇒harvest0 (T0, mob afligido aislado NO cosecha); 1 mob doble score2⇒harvest1 (pack genuino)
//  11  BYTE-NEUTRAL OFF con mob PEGADO: harvest 0 / preview 0 / tag '' (seam código muerto)
//  12  ⊥24 DIFERENCIADOR: inyectar mobs afligidos ⇒ plaga sube (score≥4) MIENTRAS afijo#74/variante#76/furia#78/vorágine#82/loot Δ0
//  13  0-REGRESIÓN: surge arc hooks #72-#82 served enabled:true; BLIGHT served false (por check 2 fresh boot)
//  14  NORTH STAR 2-cliente: MISMOS mobs afligidos + héroe ⇒ score/tier/harvest + blightProbe + LUT + worldFingerprint byte-id (fp id 15920977)
//   0  no JS errors durante el run
// Run: node tools/cas2501-blightharvest-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2501-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ---- Oráculos RE-DERIVADOS en JS puro (independientes del servido) ----
const RADIUS = 260, TS = 32, CAP = 2;
const WEIGHTS = { poison: 1, burn: 1 };
const TIERS = [{ min: 2, harvest: 1 }, { min: 4, harvest: 2 }];
function oTier(score) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; }
function oHarvest(score) { const t = oTier(score); if (t <= 0) return 0; const raw = TIERS[t - 1].harvest; return Math.min(CAP, raw); }
function oAfflict(dots) { let s = 0; for (const k of dots) s += (WEIGHTS[k] != null ? WEIGHTS[k] : 1); return s; }
const EXPECT_SCORE = [
  { score: 0, t: 0, h: 0 }, { score: 1, t: 0, h: 0 },
  { score: 2, t: 1, h: 1 }, { score: 3, t: 1, h: 1 },
  { score: 4, t: 2, h: 2 }, { score: 99, t: 2, h: 2 },
];
// surge peers con dev hook observable #72-#82 (0-regr): scarcity#72,apex#73,affixDanger#74,zoneEvent#75,variantSurge#76,
// hazardSurge#77,enrageSurge#78,spoilsField#79,carnageField#80,crossfireFray#81,maelstromField#82
const ARC_HOOKS = ["scarcity", "apex", "affixDanger", "zoneEvent", "variantSurge", "hazardSurge",
  "enrageSurge", "spoilsField", "carnageField", "crossfireFray", "maelstromField"];

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene && window.__dev.scene()==='menu'", { timeout: 45000 });
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

// ancla el héroe a un tile fijo (tp-snap a centro) y limpia mobs de prueba; devuelve el tile del héroe
async function anchorHero(page, tx, ty) {
  return await page.evaluate((tx, ty) => {
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ tp: { tx, ty } });
    return window.__dev.blightHarvest().hero;
  }, tx, ty);
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

  // 1 boot + hooks
  const hooks = await page.evaluate((arc) => {
    const d = window.__dev; if (!d || !d.blightHarvest || !d.saveBlob || !d.worldFingerprint) return false;
    return arc.every((h) => typeof d[h] === "function");
  }, ARC_HOOKS);
  ok("1 boots play + __dev.blightHarvest + arc hooks + saveBlob/worldFingerprint + __BUILD, 0 err",
     hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 BYTE-NEUTRAL OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.blightHarvest());
  ok("2 BYTE-NEUTRAL OFF: enabled false, gExists false, score/tier/harvest/preview 0, channel blightFind, tag ''",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 &&
     dark.harvest === 0 && dark.forageHarvestPreview === 0 && dark.channel === "blightFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} harvest=${dark.harvest} preview=${dark.forageHarvestPreview} tag="${dark.tag}"`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(blightFind|blightHarvest)[A-Za-z]*"\s*:/.test(saveOff);
  ok("3 STATELESS save: SIN clave blightFind*/blightHarvest* (esencias transitorias, fuera del allowlist)",
     noFeatKey, `noFeatKey=${noFeatKey} len=${saveOff.length}`);

  // 4 STATELESS fingerprint toggle-neutral
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.blightHarvest({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.blightHarvest({ enabled: false }));
  ok("4 STATELESS fingerprint: worldFingerprint byte-idéntico a través del toggle enabled", fpBefore === fpAfter,
     `match=${fpBefore === fpAfter}`);

  // 5 LUT re-derivada == scoreProbe servida
  const servedLUT = await page.evaluate((cases) =>
    cases.map((c) => window.__dev.blightHarvest({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const lutOK = EXPECT_SCORE.every((c, i) => servedLUT[i] && servedLUT[i].tier === oTier(c.score) && servedLUT[i].harvest === oHarvest(c.score) &&
    servedLUT[i].tier === c.t && servedLUT[i].harvest === c.h);
  ok("5 LUT re-derivada (JS puro) == scoreProbe servida: 0/1→T0, [2,3]→T1/1, ≥4→T2/2 cap2", lutOK,
     `mine=${JSON.stringify(EXPECT_SCORE.map(c => [c.t, c.h]))} served=${JSON.stringify(servedLUT.map(x => [x.tier, x.harvest]))}`);

  // 6 PESOS re-derivados == spawnBlight servido
  await page.evaluate(() => window.__dev.blightHarvest({ enabled: true }));
  const hero6 = await anchorHero(page, 40, 40);
  const wPoison = await page.evaluate((tx, ty) => window.__dev.blightHarvest({ spawnBlight: { tx, ty, poison: true } }).spawnBlight, hero6.tx, hero6.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  const wBurn = await page.evaluate((tx, ty) => window.__dev.blightHarvest({ spawnBlight: { tx, ty, poison: false, burn: true } }).spawnBlight, hero6.tx, hero6.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  const wBoth = await page.evaluate((tx, ty) => window.__dev.blightHarvest({ spawnBlight: { tx, ty, poison: true, burn: true } }).spawnBlight, hero6.tx, hero6.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  ok("6 PESOS re-derivados == servido: poison-solo⇒1, burn-solo⇒1, veneno+quemadura⇒2",
     wPoison && wBurn && wBoth &&
     wPoison.weight === oAfflict(["poison"]) && wPoison.weight === 1 &&
     wBurn.weight === oAfflict(["burn"]) && wBurn.weight === 1 &&
     wBoth.weight === oAfflict(["poison", "burn"]) && wBoth.weight === 2,
     `poison=${wPoison && wPoison.weight}(dots${JSON.stringify(wPoison && wPoison.dots)}) burn=${wBurn && wBurn.weight} both=${wBoth && wBoth.weight}(dots${JSON.stringify(wBoth && wBoth.dots)})`);

  // 7 RADIO re-derivado: Δ8=256px IN, Δ9=288px OUT
  const hero7 = await anchorHero(page, 60, 60);
  const inMob = await page.evaluate((tx, ty) => { window.__dev.blightHarvest({ spawnBlight: { tx: tx + 8, ty, poison: true } });
    return window.__dev.blightHarvest({ blightProbe: true }).blightProbe; }, hero7.tx, hero7.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  const outMob = await page.evaluate((tx, ty) => { window.__dev.blightHarvest({ spawnBlight: { tx: tx + 9, ty, poison: true } });
    return window.__dev.blightHarvest({ blightProbe: true }).blightProbe; }, hero7.tx, hero7.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  ok("7 RADIO re-derivado (260px): Δ8=256px IN (count≥1,score≥1), Δ9=288px OUT (count 0,score 0)",
     inMob && outMob && inMob.count >= 1 && inMob.score >= 1 && outMob.count === 0 && outMob.score === 0,
     `IN{count=${inMob && inMob.count},score=${inMob && inMob.score}} OUT{count=${outMob && outMob.count},score=${outMob && outMob.score}}`);

  // 8 REAL SERVER-AUTH
  const hero8 = await anchorHero(page, 80, 80);
  const server8 = await page.evaluate((tx, ty) => {
    const sp = window.__dev.blightHarvest({ spawnBlight: { tx, ty, poison: true, burn: true } }).spawnBlight;  // mob doble en tile del héroe
    const bp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    const mc = window.__dev.blightHarvest().mobCount;
    return { sp, bp, mc };
  }, hero8.tx, hero8.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  ok("8 REAL SERVER-AUTH: spawnBlight→G.enemies real; blightProbe score≥2 + mob listado (weight2,dots2) + mobCount≥1 (NO render-only)",
     server8.sp && server8.bp && server8.bp.score >= 2 && server8.bp.count >= 1 &&
     server8.bp.mobs.some((m) => m.weight === 2 && m.dots.length === 2) && server8.mc >= 1,
     `spawnW=${server8.sp && server8.sp.weight} probeScore=${server8.bp && server8.bp.score} count=${server8.bp && server8.bp.count} mobCount=${server8.mc}`);

  // 9 SUB-CAP
  const capViol = await page.evaluate(() => {
    for (let s = 0; s <= 50; s++) { const h = window.__dev.blightHarvest({ scoreProbe: { score: s } }).scoreProbe.harvest; if (h > 2) return s; }
    return -1;
  });
  ok("9 SUB-CAP blightHarvestCap=2: ningún score 0..50 produce harvest>2", capViol === -1, `firstViol=${capViol}`);

  // 10 TABLA/UMBRAL: 1 mob poison-solo (score1)⇒harvest0 ; 1 mob doble (score2)⇒harvest1
  const hero10 = await anchorHero(page, 100, 100);
  const onePoison = await page.evaluate((tx, ty) => { window.__dev.blightHarvest({ spawnBlight: { tx, ty, poison: true } });
    const bp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    return { score: bp.score, h: window.__dev.blightHarvest({ scoreProbe: { score: bp.score } }).scoreProbe.harvest }; }, hero10.tx, hero10.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  const oneDouble = await page.evaluate((tx, ty) => { window.__dev.blightHarvest({ spawnBlight: { tx, ty, poison: true, burn: true } });
    const bp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    return { score: bp.score, h: window.__dev.blightHarvest({ scoreProbe: { score: bp.score } }).scoreProbe.harvest }; }, hero10.tx, hero10.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  ok("10 TABLA/UMBRAL: 1 mob poison-solo score1⇒harvest0 (T0, afligido aislado NO cosecha); 1 mob doble score2⇒harvest1 (pack genuino)",
     onePoison.score === 1 && onePoison.h === 0 && oneDouble.score === 2 && oneDouble.h === 1,
     `poison{score=${onePoison.score},h=${onePoison.h}} double{score=${oneDouble.score},h=${oneDouble.h}}`);

  // 11 BYTE-NEUTRAL OFF con mob PEGADO
  const hero11 = await anchorHero(page, 120, 120);
  const offStuck = await page.evaluate((tx, ty) => {
    window.__dev.blightHarvest({ enabled: false });
    window.__dev.blightHarvest({ spawnBlight: { tx, ty, poison: true, burn: true } });  // mob doble SOBRE el héroe
    const vm = window.__dev.blightHarvest();
    return { harvest: vm.harvest, preview: vm.forageHarvestPreview, tag: vm.tag, tier: vm.tier };
  }, hero11.tx, hero11.ty);
  await page.evaluate(() => { window.__dev.blightHarvest({ clearBlight: true }); window.__dev.blightHarvest({ enabled: true }); });
  ok("11 BYTE-NEUTRAL OFF con mob doble PEGADO: harvest 0 / preview 0 / tag '' / tier 0 (seam código muerto)",
     offStuck.harvest === 0 && offStuck.preview === 0 && offStuck.tag === "" && offStuck.tier === 0,
     `harvest=${offStuck.harvest} preview=${offStuck.preview} tag="${offStuck.tag}" tier=${offStuck.tier}`);

  // 12 ⊥24 DIFERENCIADOR
  const hero12 = await anchorHero(page, 140, 140);
  const diff = await page.evaluate((tx, ty) => {
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    const snap = () => ({
      flask: window.__dev.blightHarvest().flaskForagePreview,       // afijo #74
      socket: window.__dev.blightHarvest().socketForagePreview,     // variante #76
      trophy: window.__dev.blightHarvest().trophyForagePreview,     // furia #78
      mael: window.__dev.blightHarvest().maelstromForagePreview,    // vorágine #82
      loot: window.__dev.blightHarvest().lootQualityFloor,
      blight: window.__dev.blightHarvest({ blightProbe: true }).blightProbe.score,
    });
    const pre = snap();
    // inyecta 2 mobs DOBLES (veneno+quemadura, cada uno weight2) ⇒ pack densamente carcomido (score 4, T2)
    window.__dev.blightHarvest({ spawnBlight: { tx, ty, poison: true, burn: true } });
    window.__dev.blightHarvest({ spawnBlight: { tx: tx + 2, ty, poison: true, burn: true } });
    const post = snap();
    return { pre, post };
  }, hero12.tx, hero12.ty);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  const d = diff;
  const peersFlat = ["flask", "socket", "trophy", "mael"].every((k) => d.pre[k] === d.post[k]) && d.pre.loot === d.post.loot;
  const blightRose = d.post.blight > d.pre.blight && d.post.blight >= 4;
  ok("12 ⊥24 DIFERENCIADOR: 2 mobs DOBLES ⇒ plaga sube (score≥4) MIENTRAS afijo#74/variante#76/furia#78/vorágine#82/loot Δ0",
     peersFlat && blightRose, `blightΔ=${d.pre.blight}→${d.post.blight} peersFlat=${peersFlat} pre=${JSON.stringify(d.pre)} post=${JSON.stringify(d.post)}`);

  // 13 0-REGRESIÓN
  const reg = await page.evaluate((arc) => {
    const d = window.__dev; const out = {};
    for (const h of arc) { try { out[h] = !!d[h]().enabled; } catch (e) { out[h] = "ERR:" + e.message; } }
    return out;
  }, ARC_HOOKS);
  const regOK = ARC_HOOKS.every((h) => reg[h] === true);
  ok("13 0-REGRESIÓN: surge arc hooks #72-#82 served enabled:true (BLIGHT served false por check 2 fresh boot)",
     regOK, JSON.stringify(reg));

  // 14 NORTH STAR 2-cliente byte-id
  await sleep(500);
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();
  await sleep(500);
  await toPlay(page2);
  const drive = async (pg) => await pg.evaluate(() => {
    window.__dev.blightHarvest({ enabled: true });
    window.__dev.blightHarvest({ clearBlight: true });
    window.__dev.blightHarvest({ tp: { tx: 200, ty: 200 } });
    const h = window.__dev.blightHarvest().hero;
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx, ty: h.ty, poison: true, burn: true } });        // doble w2
    window.__dev.blightHarvest({ spawnBlight: { tx: h.tx + 3, ty: h.ty, poison: true, burn: true } });    // doble w2 (Δ3=96<260)
    const vm = window.__dev.blightHarvest();
    const bp = window.__dev.blightHarvest({ blightProbe: true }).blightProbe;
    const lut = window.__dev.blightHarvest({ scoreProbe: { score: bp.score } }).scoreProbe;
    const wfp = window.__dev.worldFingerprint(393);
    return { score: vm.score, tier: vm.tier, harvest: vm.harvest, blightProbeScore: bp.score, mobCount: bp.count,
             lutTier: lut.tier, lutHarvest: lut.harvest, wfpId: JSON.stringify(wfp).length, wfp: JSON.stringify(wfp) };
  });
  const A = await drive(page);
  const B = await drive(page2);
  await page.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  await page2.evaluate(() => window.__dev.blightHarvest({ clearBlight: true }));
  const byteId = A.wfp === B.wfp && A.score === B.score && A.tier === B.tier && A.harvest === B.harvest &&
    A.blightProbeScore === B.blightProbeScore && A.lutTier === B.lutTier && A.lutHarvest === B.lutHarvest;
  // score esperado: 2 mobs dobles = 2+2 = 4 ⇒ T2 ⇒ harvest2
  const shapeOK = A.score === 4 && A.tier === 2 && A.harvest === 2 && A.blightProbeScore === 4 && A.wfpId === 15920977;
  ok("14 NORTH STAR 2-cliente: score/tier/harvest + blightProbe + LUT + worldFingerprint byte-idénticos (fp id 15920977)",
     byteId && shapeOK,
     `A={sc${A.score},T${A.tier},h${A.harvest},bp${A.blightProbeScore},fpId${A.wfpId}} B={sc${B.score},T${B.tier},h${B.harvest},bp${B.blightProbeScore},fpId${B.wfpId}} byteId=${byteId}`);

  await page.screenshot({ path: join(OUT, "selfverify.png") });
  console.log(`\nfp byte-id: ${A.wfpId}   build: ${build}   errors: ${errors.length}`);
  ok("0 no JS errors durante el run", errors.length === 0, errors.slice(0, 4).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} FAIL)`);
process.exit(FAIL ? 1 : 0);
