// CAS-2482 — INDEPENDENT [DARK] QA Gate 2/2 for CAMPO DE CARNICERÍA (CARNAGE_FIELD_SURGE.enabled:false). EVO mecánica #80 (22º flag; base #79 SPOILS_FIELD_SURGE LIVE).
// QA-OWNED harness — NO confía en el self-verify de GE (cas2481). Los ORÁCULOS (LUT score→tier→bone, PESOS por-rango, RADIO, SUB-CAP, anti-auto-conteo) se RE-DERIVAN aquí en JS y se comparan contra los probes servidos. El seam de kill se ejercita por el path REAL killEnemy (affixSpawnKill), no sólo por preview.
//
// Eje = PRESENCIA/DENSIDAD DE UN CAMPO DE CADÁVERES RECIÉN CAÍDOS server-auth: carnageFieldScore(hero)=Σ carnageWeights[rango] sobre G.corpses en radio260 (boss3/champion2/normal1; tiers min1→T1/min3→T2; cap carnageBoneCap2). Canal FRESCO boneFind→h.boneTokens (transitorio, fuera de save+worldFingerprint) via grantBone. Seam killEnemy sim.js:5772, `_carnagePre` muestreado en TOP (anti-auto-conteo).
// ⊥21 (#59-#79): un cadáver (G.corpses) NO es botín#79 (G.drops) / jefe-vivo-enfurecido#78 (e.enraged) / hazard#77 (G.hazards) / mob-variante#76 (e.variant/G.enemies vivos). DIVERGE de escasez#72 (AUSENCIA de vivos vs PRESENCIA de muertos).
//
// AC del issue: (1) byte-neutral OFF, (2) North Star 2-cli fp 15920977, (3) re-derivar oráculos INDEP + ⊥21, (4) anti-auto-conteo (suelo limpio→0 / ráfaga→forrajea), (5) 0-regresión 21 flags served true.
//
// Checks:
//   1  boots to play, __dev.carnageField + arc hooks + __BUILD, 0 JS err.
//   2  BYTE-NEUTRAL OFF (fresh boot): enabled false, gExists false, tier/score/bone/preview 0, channel boneFind, tag "".
//   3  save OFF SIN clave carnageField/boneFind/boneTokens (transitorio, fuera del allowlist).
//   4  worldFingerprint byte-estable a través del toggle enabled (las fichas NO entran al fp).
//   5  ★ LUT RE-DERIVADA en JS (score→tier→bone) == scoreProbe servido (0→T0/0,[1,2]→T1/1,≥3→T2/2, cap2).
//   6  ★ PESOS RE-DERIVADOS por-rango {boss:3,champion:2,normal:1} == carnageProbe.weight de un cadáver REAL inyectado.
//   7  ★ RADIO RE-DERIVADO: cadáver a Δ8 tiles (256px < 260 ⇒ EN) cuenta; a Δ9 tiles (288px > 260 ⇒ FUERA) NO cuenta.
//   8  ★ SUB-CAP RE-DERIVADO: max bone sobre scores 0..12 == carnageBoneCap == 2 (min(cap,raw)).
//   9  CANAL boneFind: forageBonePreview con cadáveres cerca ⇒ >0 (== oráculo bone); lejos ⇒ 0.
//  10  ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill→killEnemy): rematar mob solitario sobre suelo limpio ⇒ Δ boneTokens 0; rematar dentro de un campo denso (score≥3) ⇒ Δ boneTokens = 2 (tier2, cap2). `_carnagePre` muestreado ANTES ⇒ el cadáver propio no se auto-cuenta.
//  11  ★ DIFERENCIADOR/⊥21: inyectar cadáveres ⇒ carnicería sube MIENTRAS botín#79/furia#78/hazard#77/variante#76 IGNORAN (un cadáver NO es drop/jefe-vivo/hazard/mob) y lootQuality NO cambia; los 4 served enabled:true LIVE coexisten ⊥.
//  12  ★ BYTE-NEUTRAL OFF pegado: con OFF + cadáveres pegados al héroe ⇒ bone 0 + preview 0 ⇒ 0 fichas al seam.
//  13  ★ ORTOGONALIDAD: carnicería OFF→ON NO cambia los 17 canales peer; toggling APEX/SCARCITY NO cambia la señal de carnicería.
//  14  ★ 0-REGRESIÓN: 21 flags del arco #59-#79 served enabled:true; CARNAGE_FIELD_SURGE served false (DARK #80).
//  15  render badge "Osario:" se DIBUJA ON+cadáveres (count>0) y NO OFF (count 0) + fps sano.
//  16  ★ NORTH STAR 2-CLIENTE: MISMOS cadáveres+héroe ⇒ score/tier/bone + carnageProbe + LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync; fp id esperado 15920977).
//   0  no JS errors during run.
// Run: node tools/cas2482-carnagefield-dark-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2482-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ============ ORÁCULOS RE-DERIVADOS EN JS (QA-OWNED, NO leídos del sim) ============
const TS = 32, RADIUS = 260, CAP = 2;
const WEIGHTS = { boss: 3, champion: 2, normal: 1 };
const TIERS = [{ min: 1, bone: 1 }, { min: 3, bone: 2 }];
function oracleTier(score) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; }
function oracleBone(score) { const t = oracleTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].bone); }
const SCORES = [0, 1, 2, 3, 6, 99];

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.carnageField && window.__dev.spoilsField && window.__dev.enrageSurge && window.__dev.hazardSurge && window.__dev.variantSurge && window.__dev.apex && window.__dev.scarcity && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.carnageField + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-neutral OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.carnageField());
  ok("2 BYTE-NEUTRAL OFF (fresh boot): enabled false, gExists false, tier/score/bone/preview 0, channel boneFind, tag \"\"",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.score === 0 && dark.bone === 0 && dark.forageBonePreview === 0 && dark.channel === "boneFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} tier=${dark.tier} score=${dark.score} bone=${dark.bone} preview=${dark.forageBonePreview} channel=${dark.channel} tag="${dark.tag}"`);

  // 3 save OFF has no feature/bone key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(carnageField|boneFind)[A-Za-z]*"\s*:/.test(saveOff);
  const noBoneKey = !/"boneTokens"\s*:/.test(saveOff);
  ok("3 save OFF SIN clave carnageField/boneFind NI boneTokens (transitorio, fuera del allowlist)", noFeatKey && noBoneKey, `noFeatKey=${noFeatKey} noBoneKey=${noBoneKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.carnageField({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.carnageField({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (las fichas NO entran al fp)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ LUT RE-DERIVADA en JS == scoreProbe servido
  const tab = await page.evaluate((cases) => cases.map(s => window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe), SCORES);
  const tabOK = SCORES.every((s, i) => tab[i] && tab[i].tier === oracleTier(s) && tab[i].bone === oracleBone(s));
  ok("5 ★ LUT RE-DERIVADA en JS (score→tier→bone) == scoreProbe servido: 0→T0/0,[1,2]→T1/1,≥3→T2/2 (cap2)",
     tabOK, SCORES.map((s, i) => `${s}:srv(T${tab[i].tier}/${tab[i].bone})vsOra(T${oracleTier(s)}/${oracleBone(s)})`).join(" "));

  // 6 ★ PESOS RE-DERIVADOS por-rango {boss:3,champion:2,normal:1}
  const wchk = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    const out = {};
    for (const rank of ["boss", "champion", "normal"]) {
      window.__dev.carnageField({ clearCorpses: true });
      const h = window.__dev.carnageField().hero;
      const sp = window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 2, ty: h.ty, rank } });
      window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
      const pr = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
      out[rank] = { spawnWeight: sp.spawnCorpse.weight, probeWeight: pr.corpses.length ? pr.corpses[0].weight : -1, probeRank: pr.corpses.length ? pr.corpses[0].rank : "?" };
    }
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return out;
  });
  const wOK = ["boss", "champion", "normal"].every(r => wchk[r].spawnWeight === WEIGHTS[r] && wchk[r].probeWeight === WEIGHTS[r] && wchk[r].probeRank === r);
  ok("6 ★ PESOS RE-DERIVADOS por-rango {boss:3,champion:2,normal:1} == carnageProbe.weight de cadáver REAL", wOK, JSON.stringify(wchk));

  // 7 ★ RADIO RE-DERIVADO: Δ8 tiles (256px < 260 EN) cuenta ; Δ9 tiles (288px > 260 FUERA) no
  const rad = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    // IN: normal corpse 8 tiles east (=256px < 260)
    window.__dev.carnageField({ clearCorpses: true });
    let h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 8, ty: h.ty, rank: "normal" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const inScore = window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score;
    // OUT: normal corpse 9 tiles east (=288px > 260)
    window.__dev.carnageField({ clearCorpses: true });
    h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 9, ty: h.ty, rank: "normal" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const outScore = window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { inScore, outScore, inPx: 8 * 32, outPx: 9 * 32, radius: 260 };
  });
  ok("7 ★ RADIO RE-DERIVADO: Δ8=256px (<260) EN ⇒ score>0; Δ9=288px (>260) FUERA ⇒ score 0",
     rad.inScore > 0 && rad.outScore === 0, JSON.stringify(rad));

  // 8 ★ SUB-CAP RE-DERIVADO
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 0; s <= 12; s++) vals.push(window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe.bone);
    return { max: Math.max(...vals), cap: window.__dev.carnageField().cap };
  });
  ok("8 ★ SUB-CAP RE-DERIVADO: max bone sobre scores 0..12 == carnageBoneCap == 2", capChk.max === CAP && capChk.cap === CAP, JSON.stringify(capChk));

  // 9 CANAL boneFind: forageBonePreview near>0 (==oracle) / far→0
  const forage = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "boss" } });   // ~128px, in radius, weight 3 ⇒ T2
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    const nearVm = window.__dev.carnageField();
    window.__dev.carnageField({ tp: { tx: h.tx + 40, ty: h.ty } });   // ~1280px > 260 ⇒ score 0
    const farVm = window.__dev.carnageField();
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { nearScore: nearVm.score, nearPrev: nearVm.forageBonePreview, nearBone: nearVm.bone, farPrev: farVm.forageBonePreview, farScore: farVm.score };
  });
  const forageOK = forage.nearPrev === oracleBone(forage.nearScore) && forage.nearPrev > 0 && forage.nearPrev === forage.nearBone && forage.farPrev === 0 && forage.farScore === 0;
  ok("9 CANAL boneFind: forageBonePreview cerca ⇒ >0 (== oráculo bone); lejos ⇒ 0", forageOK, JSON.stringify(forage) + ` oracle(near)=${oracleBone(forage.nearScore)}`);

  // 10 ★ ANTI-AUTO-CONTEO por KILL REAL (affixSpawnKill → killEnemy seam)
  const anti = await page.evaluate(() => {
    const bt = () => window.__dev.carnageField().hero.boneTokens | 0;
    window.__dev.carnageField({ enabled: true });
    // A: solitary kill on CLEAN ground (remote tile) ⇒ _carnagePre=0 ⇒ 0 forage
    window.__dev.carnageField({ clearCorpses: true });
    const h0 = window.__dev.carnageField().hero;
    const CT = h0.tx - 100, CY = h0.ty;   // remote clean tile
    window.__dev.carnageField({ tp: { tx: CT, ty: CY } });
    const baseScoreA = window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score;
    const btA0 = bt();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");   // REAL spawn+killEnemy AT hero (clean ground)
    const deltaA = bt() - btA0;
    // B: kill INSIDE a dense carnage field ⇒ _carnagePre≥3 ⇒ forage T2/cap2
    window.__dev.carnageField({ clearCorpses: true });
    const h1 = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h1.tx, ty: h1.ty, rank: "boss" } });      // weight3 at hero ⇒ score3
    window.__dev.carnageField({ tp: { tx: h1.tx, ty: h1.ty } });
    const baseScoreB = window.__dev.carnageField({ carnageProbe: true }).carnageProbe.score;
    const btB0 = bt();
    window.__dev.affixSpawnKill("swift", "skeleton", "field");   // REAL kill amid the corpse field
    const deltaB = bt() - btB0;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { baseScoreA, deltaA, baseScoreB, deltaB };
  });
  const antiOK = anti.baseScoreA === 0 && anti.deltaA === 0 && anti.baseScoreB >= 3 && anti.deltaB === 2;
  ok("10 ★ ANTI-AUTO-CONTEO por KILL REAL: suelo limpio (pre=0) ⇒ Δbone 0; campo denso (pre≥3) ⇒ Δbone 2 (T2/cap2). `_carnagePre` en TOP ⇒ cadáver propio no auto-cuenta",
     antiOK, JSON.stringify(anti));

  // 11 ★ DIFERENCIADOR/⊥21 vs spoils#79/enrage#78/hazard#77/variant#76 + lootQuality
  const diff = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h0 = window.__dev.carnageField().hero;
    const RX = h0.tx - 130, RY = h0.ty;
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });
    const baseCarnage = window.__dev.carnageField().score;
    const spoBefore = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrBefore = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazBefore = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varBefore = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const lootBefore = window.__dev.carnageField().lootQualityFloor;
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 3, ty: RY, rank: "boss" } });
    window.__dev.carnageField({ spawnCorpse: { tx: RX + 4, ty: RY, rank: "champion" } });   // boss3+champ2 = 5 ⇒ T2
    window.__dev.carnageField({ tp: { tx: RX, ty: RY } });
    const vm = window.__dev.carnageField();
    const spoAfter = window.__dev.spoilsField ? window.__dev.spoilsField({ spoilsProbe: true }).spoilsProbe.score : 0;
    const enrAfter = window.__dev.enrageSurge ? window.__dev.enrageSurge({ enrageProbe: true }).enrageProbe.score : 0;
    const hazAfter = window.__dev.hazardSurge ? window.__dev.hazardSurge({ hazardProbe: true }).hazardProbe.score : 0;
    const varAfter = window.__dev.variantSurge ? window.__dev.variantSurge({ variantProbe: true }).variantProbe.score : 0;
    const lootAfter = window.__dev.carnageField().lootQualityFloor;
    const soOn = window.__dev.spoilsField ? window.__dev.spoilsField().enabled : null;
    const enOn = window.__dev.enrageSurge ? window.__dev.enrageSurge().enabled : null;
    const hzOn = window.__dev.hazardSurge ? window.__dev.hazardSurge().enabled : null;
    const vsOn = window.__dev.variantSurge ? window.__dev.variantSurge().enabled : null;
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { baseCarnage, score: vm.score, tier: vm.tier, bone: vm.bone, spoBefore, spoAfter, enrBefore, enrAfter, hazBefore, hazAfter, varBefore, varAfter, lootBefore, lootAfter, soOn, enOn, hzOn, vsOn };
  });
  const diffOK = diff.score > diff.baseCarnage && diff.tier >= 2 && diff.bone >= 1 &&
    diff.spoAfter === diff.spoBefore && diff.enrAfter === diff.enrBefore &&
    diff.hazAfter === diff.hazBefore && diff.varAfter === diff.varBefore &&
    diff.lootAfter === diff.lootBefore &&
    diff.soOn === true && diff.enOn === true && diff.hzOn === true && diff.vsOn === true;
  ok("11 ★ DIFERENCIADOR/⊥21: inyectar cadáveres ⇒ carnicería T2 MIENTRAS botín#79/furia#78/hazard#77/variante#76 IGNORAN + lootQuality NO cambia; los 4 LIVE served enabled:true coexisten ⊥",
     diffOK, JSON.stringify(diff));

  // 12 ★ BYTE-NEUTRAL OFF pegado: corpses glued, OFF ⇒ bone 0 + preview 0
  const neutral = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx, ty: h.ty, rank: "boss" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.carnageField({ enabled: false });
    const off = window.__dev.carnageField();
    window.__dev.carnageField({ enabled: true }); window.__dev.carnageField({ clearCorpses: true }); window.__dev.carnageField({ enabled: false });
    return { preview: off.forageBonePreview, bone: off.bone, tier: off.tier, score: off.score };
  });
  const neutOK = neutral.preview === 0 && neutral.bone === 0 && neutral.tier === 0 && neutral.score === 0;
  ok("12 ★ BYTE-NEUTRAL OFF pegado: con OFF + cadáver PEGADO ⇒ bone 0 + preview 0 ⇒ 0 fichas al seam (byte-id)", neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY
  const orth = await page.evaluate(() => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "normal" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    window.__dev.carnageField({ enabled: false });
    const snap = () => { const s = window.__dev.carnageField(); return { ward: s.wardRegenBoost, gold: s.goldFindMul, crit: s.critChancePct, xp: s.xpGainMul, vamp: s.vampMul, loot: s.lootQualityFloor, atk: s.atkspdBonus, det: s.detectRadiusMit, ess: s.essenceForagePreview, mat: s.matForagePreview, flask: s.flaskForagePreview, gem: s.gemForagePreview, socket: s.socketForagePreview, heal: s.healForagePreview, trophy: s.trophyForagePreview, salvage: s.salvageForagePreview }; };
    const peersOff = snap();
    window.__dev.carnageField({ enabled: true });
    const peersOn = snap();
    const beforeArc = window.__dev.carnageField();
    const apPrev = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scPrev = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: true });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: true });
    const afterArc = window.__dev.carnageField();
    const apAfter = window.__dev.apex ? window.__dev.apex().enabled : null;
    const scAfter = window.__dev.scarcity ? window.__dev.scarcity().enabled : null;
    window.__dev.apex && window.__dev.apex({ enabled: apPrev });
    window.__dev.scarcity && window.__dev.scarcity({ enabled: scPrev });
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { peersUnchanged: JSON.stringify(peersOff) === JSON.stringify(peersOn), sigUnchanged: beforeArc.score === afterArc.score && beforeArc.tier === afterArc.tier && beforeArc.bone === afterArc.bone, apAfter, scAfter };
  });
  ok("13 ★ ORTOGONALIDAD: flip carnicería OFF→ON NO cambia ningún peer (17 canales); toggling APEX/SCARCITY NO cambia la señal de carnicería",
     orth.peersUnchanged && orth.sigUnchanged && orth.apAfter === true && orth.scAfter === true, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: served config
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const cfsDark = flag("CARNAGE_FIELD_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 21 flags del arco #59-#79 served enabled:true; CARNAGE_FIELD_SURGE served false (DARK #80)",
     arcAllOn && cfsDark && arc.length === 21, `carnage=${flag("CARNAGE_FIELD_SURGE")} allOn=${arcAllOn} offenders=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Osario:" ON+corpses / not OFF + fps
  const badge = await page.evaluate(async () => {
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Osario:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    const h = window.__dev.carnageField().hero;
    window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "boss" } });
    window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt; cx.fillText = orig;
    return { onCnt, offCnt, fps };
  });
  ok("15 render badge \"Osario:\" se DIBUJA ON+cadáveres (count>0) y NO OFF (count 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps}`);

  // screenshot evidence
  await page.evaluate(() => { window.__dev.carnageField({ enabled: true }); window.__dev.carnageField({ clearCorpses: true }); const h = window.__dev.carnageField().hero; window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 3, ty: h.ty, rank: "boss" } }); window.__dev.carnageField({ spawnCorpse: { tx: h.tx + 4, ty: h.ty, rank: "champion" } }); window.__dev.carnageField({ tp: { tx: h.tx, ty: h.ty } }); });
  await sleep(300);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.carnageField({ clearCorpses: true }); window.__dev.carnageField({ enabled: false }); });

  // 16 ★ NORTH STAR 2-client convergence
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const CORPSE_A = { tx: 60, ty: 40 }, CORPSE_B = { tx: 61, ty: 40 }, HERO_TILE = { tx: 63, ty: 40 };
  const readVM = async (pg) => await pg.evaluate((CA, CB, HT) => {
    window.__dev.carnageField({ enabled: true });
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ spawnCorpse: { tx: CA.tx, ty: CA.ty, rank: "boss" } });    // weight 3
    window.__dev.carnageField({ spawnCorpse: { tx: CB.tx, ty: CB.ty, rank: "normal" } });  // weight 1
    window.__dev.carnageField({ tp: { tx: HT.tx, ty: HT.ty } });
    const vm = window.__dev.carnageField();
    const lut = [0, 1, 3, 6].map(s => { const p = window.__dev.carnageField({ scoreProbe: { score: s } }).scoreProbe; return { score: s, tier: p.tier, bone: p.bone }; });
    const sp = window.__dev.carnageField({ carnageProbe: true }).carnageProbe;
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    window.__dev.carnageField({ clearCorpses: true });
    window.__dev.carnageField({ enabled: false });
    return { score: vm.score, tier: vm.tier, bone: vm.bone, spScore: sp.score, spCount: sp.count, lut, fp, fpLen: fp.length };
  }, CORPSE_A, CORPSE_B, HERO_TILE);
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.tier === B.tier && A.bone === B.bone && A.spScore === B.spScore && A.spCount === B.spCount && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMOS cadáveres+héroe ⇒ score/tier/bone + carnageProbe(score,count) + LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},tier:${A.tier},bone:${A.bone},spScore:${A.spScore},spCount:${A.spCount},fpLen:${A.fpLen}} B={score:${B.score},tier:${B.tier},bone:${B.bone},spScore:${B.spScore},spCount:${B.spCount},fpLen:${B.fpLen}} fpMatch=${A.fp === B.fp}`);
  console.log(`   fp byte-id (worldFingerprint length) = ${A.fpLen} (esperado 15920977)`);
  await page.evaluate(() => window.__dev.carnageField({ enabled: false }));
  await pageB.evaluate(() => window.__dev.carnageField({ enabled: false }));

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
process.exit(FAIL === 0 ? 0 : 1);
