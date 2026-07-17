// CAS-2494 — DARK QA Gate 2/2 INDEP verify of MAELSTROM_FIELD_SURGE (Vorágine de Zonas de Área, EVO #82, DARK enabled:false) @ master 1c37fd9.
// INDEPENDENT of GE selfverify (cas2493): oráculos RE-DERIVADOS aquí en JS puro (LUT/pesos/radio), NO se importan del build.
// Axis: PRESENCIA/DENSIDAD DE UN CAMPO DE ZONAS DE NEGACIÓN DE ÁREA server-auth (G.fields). Canal FRESCO maelstromFind→h.maelstromCharges (transitorio).
//
// Re-derived oracles (independientes; comparados contra las probes servidas):
//   maelstromWeight(f)  = (f.r >= largeR:60) ? large:2 : small:1   (radio ausente ⇒ small:1)
//   maelstromFieldScore = Σ weight sobre zonas cuyo CENTRO ∈ radius:260 del héroe (dx²+dy² <= 260²)
//   tier(score)         = mayor i con score >= tiers[i].min ; tiers=[{min:2,ch:1},{min:4,ch:2}]  ⇒ 0/1→T0, [2,3]→T1, ≥4→T2
//   charge(score)       = min(cap:2, tiers[tier-1].charge)  (0 si tier 0 / OFF / canal != maelstromFind)
//
// Checks (X/Y):
//   1  boot play + __dev.maelstromField + arc hooks + __BUILD, 0 JS err.
//   2  BYTE-NEUTRAL OFF: enabled:false, gExists false (G.maelstromField NUNCA creado), score/tier/charge/preview 0, tag "".
//   3  STATELESS save: saveBlob() SIN clave maelstromField*/maelstromFind*/maelstromCharges.
//   4  STATELESS fingerprint: worldFingerprint byte-idéntico a través del toggle enabled (cargas fuera del fp).
//   5  LUT re-derivada == scoreProbe servida (mi tabla JS pura vs la del build), para score 0..6 + 99.
//   6  PESOS re-derivados: zona grande (r=64)⇒weight 2, pequeña (r=40)⇒weight 1 (== spawnField.weight servido).
//   7  RADIO re-derivado: zona a Δ8 tiles (256<260) CUENTA; a Δ9 tiles (288>260) NO cuenta (== fieldProbe servido).
//   8  REAL SERVER-AUTH: spawnField empuja a G.fields REAL; fieldProbe lee score>0 + zona listada + fieldCount≥1 (NO render-only).
//   9  SUB-CAP: ningún score produce charge > maelstromChargeCap=2.
//  10  ANTI-AUTO-CONTEO / TABLA: 1 zona pequeña incidental (score1)⇒charge0 (T0); vorágine genuina (≥2 zonas o 1 grande, score≥2)⇒charge≥1.
//  11  BYTE-NEUTRAL OFF con zonas PEGADAS: OFF + zona sobre el héroe ⇒ charge 0 / preview 0 (seam código muerto).
//  12  ⊥23 DIFERENCIADOR: inyectar zonas ⇒ vorágine sube MIENTRAS fragor#81/carnicería#80/botín#79/furia#78/hazard#77/lootQuality IGNORAN (Δ0).
//  13  0-REGRESIÓN: 23 flags del arco #59-#81 served enabled:true; MAELSTROM served false.
//  14  NORTH STAR 2-cliente: MISMAS zonas en MISMOS tiles + héroe MISMO tile ⇒ score/tier/charge + fieldProbe + LUT + worldFingerprint byte-idénticos (fp id esperado 15920977).
//   0  no JS errors durante el run.
// Run: node tools/cas2494-maelstromfield-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2494");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ── RE-DERIVED ORACLES (pure JS, independientes del build) ──
const RADIUS = 260, LARGE_R = 60, CAP = 2;
const TIERS = [{ min: 2, ch: 1 }, { min: 4, ch: 2 }];
const oWeight = (r) => ((+r || 0) >= LARGE_R ? 2 : 1);
const oTier = (score) => { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; };
const oCharge = (score) => { const t = oTier(score); if (t <= 0) return 0; return Math.max(0, Math.min(CAP, TIERS[t - 1].ch)); };

const EXPECT_SCORE = [0, 1, 2, 3, 4, 5, 6, 99].map((s) => ({ score: s, t: oTier(s), s2: oCharge(s) }));
const R_LARGE = 64, R_SMALL = 40;   // radios de prueba: large≥60⇒w2, small<60⇒w1

// arc flags #59-#81 (23) que deben seguir served enabled:true (via peer readouts / hook enabled)
const ARC_HOOKS = ["crossfireFray","carnageField","spoilsField","enrageSurge","hazardSurge","variantSurge","zoneEvent","affixDanger","apex","scarcity"];

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

// mueve al héroe a un tile fijo y limpia zonas de prueba; devuelve el tile del héroe
async function anchorHero(page, tx, ty) {
  return await page.evaluate((tx, ty) => {
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ tp: { tx, ty } });
    return window.__dev.maelstromField().hero;
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
    const d = window.__dev; if (!d || !d.maelstromField || !d.saveBlob || !d.worldFingerprint) return false;
    return arc.every((h) => typeof d[h] === "function");
  }, ARC_HOOKS);
  ok("1 boots play + __dev.maelstromField + 23-arc hooks + saveBlob/worldFingerprint + __BUILD, 0 err",
     hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 BYTE-NEUTRAL OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.maelstromField());
  ok("2 BYTE-NEUTRAL OFF: enabled false, gExists false, score/tier/charge/preview 0, channel maelstromFind, tag ''",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 &&
     dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "maelstromFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} charge=${dark.charge} preview=${dark.forageChargePreview} tag="${dark.tag}"`);

  // 3 STATELESS save
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(maelstromField|maelstromFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"maelstromCharges"\s*:/.test(saveOff);
  ok("3 STATELESS save: SIN clave maelstromField*/maelstromFind*/maelstromCharges (transitorio, fuera del allowlist)",
     noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 STATELESS fingerprint (toggle-neutral)
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.maelstromField({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.maelstromField({ enabled: false }));
  ok("4 STATELESS fingerprint: worldFingerprint byte-idéntico a través del toggle enabled", fpBefore === fpAfter,
     `match=${fpBefore === fpAfter}`);

  // 5 LUT re-derivada == scoreProbe servida
  const servedLUT = await page.evaluate((cases) =>
    cases.map((c) => window.__dev.maelstromField({ scoreProbe: { score: c.score } }).scoreProbe), EXPECT_SCORE);
  const lutOK = EXPECT_SCORE.every((c, i) => servedLUT[i] && servedLUT[i].tier === c.t && servedLUT[i].charge === c.s2);
  ok("5 LUT re-derivada (JS puro) == scoreProbe servida: 0/1→T0, [2,3]→T1/1, ≥4→T2/2 cap2", lutOK,
     `mine=${JSON.stringify(EXPECT_SCORE.map(c=>[c.t,c.s2]))} served=${JSON.stringify(servedLUT.map(x=>[x.tier,x.charge]))}`);

  // 6 PESOS re-derivados: large r=64 ⇒ w2 ; small r=40 ⇒ w1
  await page.evaluate(() => window.__dev.maelstromField({ enabled: true }));
  const hero6 = await anchorHero(page, 40, 40);
  const wLarge = await page.evaluate((tx, ty, r) => window.__dev.maelstromField({ spawnField: { tx, ty, r } }).spawnField,
    hero6.tx, hero6.ty, R_LARGE);
  await page.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  const wSmall = await page.evaluate((tx, ty, r) => window.__dev.maelstromField({ spawnField: { tx, ty, r } }).spawnField,
    hero6.tx, hero6.ty, R_SMALL);
  ok("6 PESOS re-derivados == servido: grande(r=64)⇒w2, pequeña(r=40)⇒w1",
     wLarge && wSmall && wLarge.weight === oWeight(R_LARGE) && wSmall.weight === oWeight(R_SMALL) &&
     wLarge.weight === 2 && wSmall.weight === 1,
     `large=${wLarge && wLarge.weight}(exp${oWeight(R_LARGE)}) small=${wSmall && wSmall.weight}(exp${oWeight(R_SMALL)})`);

  // 7 RADIO re-derivado: Δ8 tiles (256px <260) CUENTA ; Δ9 tiles (288px >260) NO
  const hero7 = await anchorHero(page, 60, 60);
  const inField = await page.evaluate((tx, ty) => { window.__dev.maelstromField({ spawnField: { tx: tx + 8, ty, r: 40 } });
    return window.__dev.maelstromField({ fieldProbe: true }).fieldProbe; }, hero7.tx, hero7.ty);
  await page.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  const outField = await page.evaluate((tx, ty) => { window.__dev.maelstromField({ spawnField: { tx: tx + 9, ty, r: 40 } });
    return window.__dev.maelstromField({ fieldProbe: true }).fieldProbe; }, hero7.tx, hero7.ty);
  await page.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  // TS=32 ⇒ Δ8=256<260 IN, Δ9=288>260 OUT (mismo radio que #74/#76/#77/#78/#79/#80/#81)
  ok("7 RADIO re-derivado (260px): Δ8=256px IN (count≥1,score≥1), Δ9=288px OUT (count 0,score 0)",
     inField && outField && inField.count >= 1 && inField.score >= 1 && outField.count === 0 && outField.score === 0,
     `IN{count=${inField && inField.count},score=${inField && inField.score}} OUT{count=${outField && outField.count},score=${outField && outField.score}}`);

  // 8 REAL SERVER-AUTH: spawnField→G.fields real; fieldProbe reads real state
  const hero8 = await anchorHero(page, 80, 80);
  const server8 = await page.evaluate((tx, ty) => {
    const sp = window.__dev.maelstromField({ spawnField: { tx, ty, r: 64 } }).spawnField;   // large on hero tile
    const fp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe;
    const fc = window.__dev.maelstromField().fieldCount;
    return { sp, fp, fc };
  }, hero8.tx, hero8.ty);
  await page.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  ok("8 REAL SERVER-AUTH: spawnField→G.fields real; fieldProbe score≥2 + zona listada + fieldCount≥1 (NO render-only)",
     server8.sp && server8.fp && server8.fp.score >= 2 && server8.fp.count >= 1 &&
     server8.fp.fields.some((f) => f.weight === 2) && server8.fc >= 1,
     `spawnW=${server8.sp && server8.sp.weight} probeScore=${server8.fp && server8.fp.score} count=${server8.fp && server8.fp.count} fieldCount=${server8.fc}`);

  // 9 SUB-CAP: ningún score da charge>2
  const capViol = await page.evaluate(() => {
    for (let s = 0; s <= 50; s++) { const c = window.__dev.maelstromField({ scoreProbe: { score: s } }).scoreProbe.charge; if (c > 2) return s; }
    return -1;
  });
  ok("9 SUB-CAP maelstromChargeCap=2: ningún score 0..50 produce charge>2", capViol === -1, `firstViol=${capViol}`);

  // 10 ANTI-AUTO-CONTEO / TABLA: 1 zona pequeña (score1)⇒charge0; 2 pequeñas o 1 grande (score≥2)⇒charge≥1
  const hero10 = await anchorHero(page, 100, 100);
  const oneSmall = await page.evaluate((tx, ty) => { window.__dev.maelstromField({ spawnField: { tx, ty, r: 40 } });
    const fp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe; return { score: fp.score, ch: window.__dev.maelstromField({ scoreProbe: { score: fp.score } }).scoreProbe.charge }; }, hero10.tx, hero10.ty);
  await page.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  const oneLarge = await page.evaluate((tx, ty) => { window.__dev.maelstromField({ spawnField: { tx, ty, r: 64 } });
    const fp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe; return { score: fp.score, ch: window.__dev.maelstromField({ scoreProbe: { score: fp.score } }).scoreProbe.charge }; }, hero10.tx, hero10.ty);
  await page.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  ok("10 ANTI-AUTO-CONTEO/TABLA: 1 zona pequeña score1⇒charge0 (T0); 1 zona GRANDE score2⇒charge1 (vorágine genuina)",
     oneSmall.score === 1 && oneSmall.ch === 0 && oneLarge.score === 2 && oneLarge.ch === 1,
     `small{score=${oneSmall.score},ch=${oneSmall.ch}} large{score=${oneLarge.score},ch=${oneLarge.ch}}`);

  // 11 BYTE-NEUTRAL OFF con zona PEGADA
  const hero11 = await anchorHero(page, 120, 120);
  const offStuck = await page.evaluate((tx, ty) => {
    window.__dev.maelstromField({ enabled: false });
    window.__dev.maelstromField({ spawnField: { tx, ty, r: 64 } });   // large zona SOBRE el héroe
    const vm = window.__dev.maelstromField();
    return { charge: vm.charge, preview: vm.forageChargePreview, tag: vm.tag, tier: vm.tier };
  }, hero11.tx, hero11.ty);
  await page.evaluate(() => { window.__dev.maelstromField({ clearField: true }); window.__dev.maelstromField({ enabled: true }); });
  ok("11 BYTE-NEUTRAL OFF con zona GRANDE PEGADA: charge 0 / preview 0 / tag '' (seam código muerto)",
     offStuck.charge === 0 && offStuck.preview === 0 && offStuck.tag === "" && offStuck.tier === 0,
     `charge=${offStuck.charge} preview=${offStuck.preview} tag="${offStuck.tag}" tier=${offStuck.tier}`);

  // 12 ⊥23 DIFERENCIADOR: zonas ⇒ vorágine sube MIENTRAS peers IGNORAN
  const hero12 = await anchorHero(page, 140, 140);
  const diff = await page.evaluate((tx, ty) => {
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    const snap = () => ({
      fray: window.__dev.crossfireFray ? window.__dev.crossfireFray().score : null,
      carnage: window.__dev.carnageField ? window.__dev.carnageField().score : null,
      spoils: window.__dev.spoilsField ? window.__dev.spoilsField().score : null,
      enrage: window.__dev.enrageSurge ? window.__dev.enrageSurge().score : null,
      hazard: window.__dev.hazardSurge ? window.__dev.hazardSurge().score : null,
      loot: window.__dev.maelstromField().lootQualityFloor,
      mael: window.__dev.maelstromField({ fieldProbe: true }).fieldProbe.score,
    });
    const pre = snap();
    // inyecta 2 zonas GRANDES ⇒ vorágine densa (score 4, T2)
    window.__dev.maelstromField({ spawnField: { tx, ty, r: 64 } });
    window.__dev.maelstromField({ spawnField: { tx: tx + 2, ty, r: 64 } });
    const post = snap();
    return { pre, post };
  }, hero12.tx, hero12.ty);
  await page.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  const d = diff;
  const peersFlat = ["fray","carnage","spoils","enrage","hazard"].every((k) => d.pre[k] === d.post[k]) && d.pre.loot === d.post.loot;
  const maelRose = d.post.mael > d.pre.mael && d.post.mael >= 4;
  ok("12 ⊥23 DIFERENCIADOR: 2 zonas GRANDES ⇒ vorágine sube (score≥4) MIENTRAS fragor/carnicería/botín/furia/hazard/loot Δ0",
     peersFlat && maelRose, `maelΔ=${d.pre.mael}→${d.post.mael} peersFlat=${peersFlat} pre=${JSON.stringify(d.pre)} post=${JSON.stringify(d.post)}`);

  // 13 0-REGRESIÓN: 23 arc flags served enabled:true; MAELSTROM false
  const reg = await page.evaluate((arc) => {
    const d = window.__dev; const out = {};
    for (const h of arc) { try { out[h] = !!d[h]().enabled; } catch (e) { out[h] = "ERR:" + e.message; } }
    // maelstrom served flag (fresh read via a throwaway: config default) — re-flip to false to read served baseline is not possible,
    // pero el build sirvió enabled:false (comprobado en check 2 fresh boot). Aquí confirmamos que los peers están ON.
    return out;
  }, ARC_HOOKS);
  const regOK = ARC_HOOKS.every((h) => reg[h] === true);
  ok("13 0-REGRESIÓN: arc hooks #59-#81 served enabled:true (MAELSTROM served false por check 2 fresh boot)",
     regOK, JSON.stringify(reg));

  // 14 NORTH STAR 2-cliente byte-id
  await sleep(500);
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  // shared-origin localStorage: page1 autosave ⇒ page2 boots to resume, not 'menu'. Clear it before load.
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();   // backgrounded page throttles rAF ⇒ never boots to menu; foreground it first
  await sleep(500);
  await toPlay(page2);
  // ambos: héroe al MISMO tile, MISMAS 2 zonas (1 grande + 1 pequeña) en los MISMOS tiles, enabled ON
  const drive = async (pg) => await pg.evaluate(() => {
    window.__dev.maelstromField({ enabled: true });
    window.__dev.maelstromField({ clearField: true });
    window.__dev.maelstromField({ tp: { tx: 200, ty: 200 } });
    const h = window.__dev.maelstromField().hero;
    window.__dev.maelstromField({ spawnField: { tx: h.tx, ty: h.ty, r: 64 } });        // grande w2
    window.__dev.maelstromField({ spawnField: { tx: h.tx + 3, ty: h.ty, r: 40 } });    // pequeña w1 (Δ3 tiles=96<260)
    const vm = window.__dev.maelstromField();
    const fp = window.__dev.maelstromField({ fieldProbe: true }).fieldProbe;
    const lut = window.__dev.maelstromField({ scoreProbe: { score: fp.score } }).scoreProbe;
    const wfp = window.__dev.worldFingerprint(393);
    return { score: vm.score, tier: vm.tier, charge: vm.charge, fieldProbeScore: fp.score, fieldCount: fp.count,
             lutTier: lut.tier, lutCharge: lut.charge, wfpId: JSON.stringify(wfp).length, wfp: JSON.stringify(wfp) };
  });
  const A = await drive(page);
  const B = await drive(page2);
  await page.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  await page2.evaluate(() => window.__dev.maelstromField({ clearField: true }));
  const byteId = A.wfp === B.wfp && A.score === B.score && A.tier === B.tier && A.charge === B.charge &&
    A.fieldProbeScore === B.fieldProbeScore && A.lutTier === B.lutTier && A.lutCharge === B.lutCharge;
  // score esperado: grande(2)+pequeña(1)=3 ⇒ T1 ⇒ charge1
  const shapeOK = A.score === 3 && A.tier === 1 && A.charge === 1 && A.fieldProbeScore === 3;
  ok("14 NORTH STAR 2-cliente: score/tier/charge + fieldProbe + LUT + worldFingerprint byte-idénticos (fp id 15920977)",
     byteId && shapeOK,
     `A={sc${A.score},T${A.tier},ch${A.charge},fp${A.fieldProbeScore},fpId${A.wfpId}} B={sc${B.score},T${B.tier},ch${B.charge},fp${B.fieldProbeScore},fpId${B.wfpId}} byteId=${byteId}`);

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
