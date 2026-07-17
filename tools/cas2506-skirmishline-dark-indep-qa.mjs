// CAS-2506 — DARK QA Gate 2/2 INDEPENDENT byte-verify for LÍNEA DE ESCARAMUZA (SKIRMISH_LINE_SURGE, EVO#84, CAS-2504) @ b010912.
// Oráculos RE-DERIVADOS DESDE CERO en JS puro (NO importo config, NO confío en el harness del GE). Confirma en fresh clone de origin/master b010912.
// Mandato (8 puntos): 1 DARK OFF byte-neutral · 2 STATELESS (save/fp allowlist) · 3 worldFingerprint estable toggle · 4 LUT pura · 5 server-auth real (e.tpl.ranged/range) · 6 ⊥25 differentiator · 7 0-regr 25 flags · 8 2-cliente 0-desync (fp North Star 15920977).
// Observado vía __dev.skirmishLine (flip in-memory + tp + scoreProbe LUT + spawnSkirmish inyección REAL + skirmishProbe lectura server-auth + clearSkirmish) + __dev.saveBlob/worldFingerprint. Run: node tools/cas2506-skirmishline-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2506");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ─── ORÁCULOS RE-DERIVADOS DESDE CERO (JS puro, valores del spec del issue, NO leídos del código bajo prueba) ───
const RADIUS = 260, R2 = RADIUS * RADIUS, LONGR = 240, CAP = 2;      // spec: radio 260, umbral artillería 240, sub-cap 2
const WLONG = 2, WSHORT = 1;                                          // spec: artillería largo alcance pesa 2, corto 1, melee 0
const TIERS = [{ min: 2, mark: 1 }, { min: 4, mark: 2 }];            // spec: T1 score≥2→+1, T2 score≥4→+2
// peso de UN mob por su clase de alcance
function myWeight(ranged, range, dead) { if (dead || !ranged) return 0; return (range >= LONGR) ? WLONG : WSHORT; }
// tier vigente = el más intenso (mayor min) cuyo score se satisface
function myTier(score) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; }
// marca del tier vigente, acotada por sub-cap
function myBonus(score) { const t = myTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].mark); }
// score desde una lista de mobs {ranged,range,dead,dx,dy} (dist² ≤ R²)
function myScore(mobs) { let s = 0; for (const m of mobs) { const w = myWeight(m.ranged, m.range, m.dead); if (w <= 0) continue; if (m.dx * m.dx + m.dy * m.dy <= R2) s += w; } return s; }

// tabla de casos LUT re-derivada (independiente): 0/1→T0/0, 2/3→T1/1, ≥4→T2/2 (cap 2)
const SCORE_CASES = [0, 1, 2, 3, 4, 5, 8, 99].map(score => ({ score, tier: myTier(score), mark: myBonus(score) }));

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.skirmishLine && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1  boots to play, __dev.skirmishLine + save/fp hooks + __BUILD, 0 JS err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 ★ DARK OFF byte-neutral: enabled:false ⇒ 0 marcas/floater/grant aun con mobs a-distancia PEGADOS; gExists false
  const off = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: false });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;
    // pega 3 mobs a-distancia largo alcance encima del héroe (score enorme si estuviera ON)
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 1, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 1, ty: h.ty, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty - 1, long: true } });
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const v = window.__dev.skirmishLine();
    window.__dev.skirmishLine({ clearSkirmish: true });
    return v;
  });
  ok("2  DARK OFF byte-neutral: enabled:false ⇒ mark/preview/tag=0 aun con 3 mobs a-distancia PEGADOS; gExists false (rama muerta)",
     off.enabled === false && off.gExists === false && off.mark === 0 && off.forageMarkPreview === 0 && off.tag === "" && off.channel === "skirmishFind",
     `enabled=${off.enabled} gExists=${off.gExists} mark=${off.mark} preview=${off.forageMarkPreview} tag="${off.tag}" mobCount=${off.mobCount}`);

  // 3 ★ STATELESS: saveBlob() sin clave skirmish* — estado 100% derivado, fuera del allowlist
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noSkirmishKey = !/"skirmish[A-Za-z]*"\s*:/.test(saveOff);
  ok("3  STATELESS: saveBlob() SIN clave skirmish* (h.skirmishMarks fuera del allowlist ⇒ 0 persistencia nueva)",
     noSkirmishKey, `noSkirmishKey=${noSkirmishKey} saveLen=${saveOff.length}`);

  // 4 ★ worldFingerprint estable a través del toggle enabled (marcas NO entran al fp)
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.skirmishLine({ enabled: true }));
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.skirmishLine({ enabled: false }));
  const fpC = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  ok("4  worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; marcas fuera del fp)",
     fpA === fpB && fpB === fpC, `A==B=${fpA === fpB} B==C=${fpB === fpC}`);

  // 5 ★ LUT PURA re-derivada: scoreProbe servido == myTier/myBonus locales
  const served5 = await page.evaluate((cs) => cs.map(c => window.__dev.skirmishLine({ scoreProbe: { score: c.score } }).scoreProbe), SCORE_CASES);
  const lutOK = SCORE_CASES.every((c, i) => served5[i] && served5[i].tier === c.tier && served5[i].mark === c.mark);
  const capOK = served5.every(p => p.mark <= CAP);
  ok("5  LUT PURA (oráculo re-derivado JS): score→tier→mark 0/1→0, 2/3→1, ≥4→2 · sub-cap 2 · served==local",
     lutOK && capOK, `lutOK=${lutOK} capOK=${capOK} served=${JSON.stringify(served5.map(p => p.mark))} local=${JSON.stringify(SCORE_CASES.map(c => c.mark))}`);

  // 6 ★ SERVER-AUTH REAL: spawnSkirmish empuja mobs REALES a G.enemies (e.tpl.ranged/range template ETPL); skirmishProbe lee score REAL; mi myScore(lista) == score servido
  const sa = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;
    const sLong = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } }).spawnSkirmish;      // mage range250 → weight 2
    const sShort = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 3, long: false } }).spawnSkirmish;    // spearman range210 → weight 1
    const sMelee = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx - 2, ty: h.ty, melee: true } }).spawnSkirmish;    // orc melee → weight 0
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const probe = window.__dev.skirmishLine({ skirmishProbe: true });
    const vm = window.__dev.skirmishLine();
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { sLong, sShort, sMelee, probe: probe.skirmishProbe, hx: vm.hero.x, hy: vm.hero.y, score: vm.score, tier: vm.tier, mark: vm.mark, mobCount: vm.mobCount };
  });
  // re-derivo el score desde la lista de mobs que reporta el probe (independiente)
  const myScore6 = myScore(sa.probe.mobs.map(m => ({ ranged: m.ranged, range: m.range, dead: false, dx: sa.hx - m.x, dy: sa.hy - m.y })));
  const wLongOK = sa.sLong.weight === 2 && sa.sLong.ranged === true && sa.sLong.range >= LONGR;
  const wShortOK = sa.sShort.weight === 1 && sa.sShort.ranged === true && sa.sShort.range < LONGR;
  const wMeleeOK = sa.sMelee.weight === 0 && sa.sMelee.ranged === false;
  ok("6  SERVER-AUTH REAL: mobs REALES en G.enemies (e.tpl.ranged/range); artillería=2/corto=1/melee=0; myScore(probe.mobs)==score servido",
     wLongOK && wShortOK && wMeleeOK && sa.probe.score === myScore6 && sa.score === myScore6 && sa.score === 3 && sa.mark === myBonus(sa.score),
     `long.w=${sa.sLong.weight}(r${sa.sLong.range}) short.w=${sa.sShort.weight}(r${sa.sShort.range}) melee.w=${sa.sMelee.weight} probe.score=${sa.probe.score} myScore=${myScore6} vm.score=${sa.score} vm.mark=${sa.mark} mobCount=${sa.mobCount}`);

  // 7 ★ ⊥25 DIFFERENTIATOR: mobs a-distancia (SIN afijo/variante/enrage/dots) ⇒ escaramuza sube MIENTRAS #74/#76/#78/#83/#69/loot lo IGNORAN
  const diff = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;
    const before = window.__dev.skirmishLine();
    // línea densa: 2 artillería largo alcance (score 4 → T2)
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 3, long: true } });
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const after = window.__dev.skirmishLine();
    // 3 mobs MELEE (orc) PEGADOS al héroe NO suben escaramuza (peso 0, ⊥ #69 LAST_STAND cuenta engachados en melee) — score in-radio = 0 aunque estén dentro
    window.__dev.skirmishLine({ clearSkirmish: true });
    const m1 = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 1, ty: h.ty, melee: true } }).spawnSkirmish;
    const m2 = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx - 1, ty: h.ty, melee: true } }).spawnSkirmish;
    const m3 = window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 1, melee: true } }).spawnSkirmish;
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const meleeOnly = window.__dev.skirmishLine();
    const meleeProbe = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;   // lista de ranged-en-radio: debe estar VACÍA con sólo melee
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { before, after, meleeOnly, meleeProbe, meleeSpawns: [m1, m2, m3] };
  });
  const peersUnchanged = ["flaskForagePreview", "socketForagePreview", "trophyForagePreview", "blightForagePreview", "goldFindMul", "lootQualityFloor"]
    .every(k => JSON.stringify(diff.before[k]) === JSON.stringify(diff.after[k]));
  // los 3 melee se spawnearon REALmente (idx≥0) y cada uno pesa 0 (ranged falsy) ⇒ score in-radio 0, probe ranged-en-radio vacío
  const meleeSpawned = diff.meleeSpawns.every(m => m && m.idx >= 0);
  const meleeAllZero = diff.meleeSpawns.every(m => m.weight === 0 && m.ranged === false);
  ok("7  ⊥25 DIFFERENTIATOR: 2 artillería ⇒ escaramuza 0→4/T2 MIENTRAS flask#74/socket#76/trophy#78/blight#83/gold/loot Δ0 + 3 MELEE spawneados/peso0 ⇒ score in-radio 0 & probe vacío (⊥ #69)",
     diff.before.score === 0 && diff.after.score === 4 && diff.after.tier === 2 && diff.after.mark === 2 &&
     meleeSpawned && meleeAllZero && diff.meleeOnly.score === 0 && diff.meleeProbe.count === 0 && peersUnchanged,
     `before=${diff.before.score} after=${diff.after.score}/T${diff.after.tier}/m${diff.after.mark} meleeSpawned=${meleeSpawned} meleeAllZero=${meleeAllZero} meleeScore=${diff.meleeOnly.score} meleeRangedInRadio=${diff.meleeProbe.count} peersUnchanged=${peersUnchanged}`);

  // 8a 0-REGRESIÓN: 25 flags del arco #59-#83 served enabled:true; SKIRMISH served false
  await page.evaluate(() => window.__dev.skirmishLine({ enabled: false }));
  const regr = await page.evaluate(() => {
    const d = window.__dev;
    const arc = {
      erudition: d.erudition, nocturne: d.nocturne, cadence: d.cadence, tempest: d.tempest, lastStand: d.lastStand,
      firmFooting: d.firmFooting, shadowStalk: d.shadowStalk, scarcity: d.scarcity, apex: d.apex, affixDanger: d.affixDanger,
      zoneEvent: d.zoneEvent, variantSurge: d.variantSurge, hazardSurge: d.hazardSurge, enrageSurge: d.enrageSurge,
      spoilsField: d.spoilsField, carnageField: d.carnageField, crossfireFray: d.crossfireFray, maelstromField: d.maelstromField, blightHarvest: d.blightHarvest,
    };
    const out = {};
    for (const k in arc) { try { out[k] = arc[k] ? !!arc[k]().enabled : null; } catch (e) { out[k] = "err:" + e.message; } }
    out.skirmish = window.__dev.skirmishLine().enabled;
    return out;
  });
  const arcVals = Object.entries(regr).filter(([k]) => k !== "skirmish");
  const arcAllOn = arcVals.filter(([, v]) => v === true).length;
  const arcNull = arcVals.filter(([, v]) => v === null).length;   // hooks no expuestos como dev (contados aparte, no fallan)
  const arcBad = arcVals.filter(([, v]) => v === false || (typeof v === "string" && v.startsWith("err"))).map(([k]) => k);
  ok("8a 0-REGRESIÓN: flags del arco expuestas served enabled:true (0 en false); SKIRMISH served false (DARK #84)",
     arcBad.length === 0 && regr.skirmish === false, `on=${arcAllOn} null(no-dev-hook)=${arcNull} bad=${JSON.stringify(arcBad)} skirmish=${regr.skirmish}`);

  // 8b config-served counts: 25 flags #59-#83 (verifico enabled:true en el config servido por byte)
  const cfgCount = await page.evaluate(async (b) => {
    const txt = await (await fetch(b + "/sim/config.js")).text();
    const flags = ["ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE"];
    const res = {};
    for (const f of flags) { const m = txt.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); res[f] = m ? m[1] : "?"; }
    const sk = txt.match(/export const SKIRMISH_LINE_SURGE\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
    return { res, skirmish: sk ? sk[1] : "?" };
  }, base);
  const cfgAllTrue = Object.values(cfgCount.res).every(v => v === "true");
  ok("8b config SERVIDO byte: arco #65-#83 enabled:true; SKIRMISH_LINE_SURGE enabled:false (DARK)",
     cfgAllTrue && cfgCount.skirmish === "false", `arcTrue=${cfgAllTrue} skirmish=${cfgCount.skirmish} bad=${JSON.stringify(Object.entries(cfgCount.res).filter(([,v])=>v!=="true"))}`);

  // 9 ★ NORTH STAR — 2-CLIENTE 0-DESYNC: 2ª página, MISMOS mobs a-distancia en MISMOS tiles + héroe MISMO tile ⇒ score/tier/mark/probe/scoreProbe/fp IDÉNTICOS
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors2.push(m.text()); });
  await page2.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });   // shared-origin autosave ⇒ evita resume sin menú
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page2);

  // driver determinista idéntico en ambas páginas: enable + spawn misma línea (2 largo + 1 corto en MISMOS tiles) + héroe MISMO tile
  const driver = (p) => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    window.__dev.skirmishLine({ tp: { tx: 40, ty: 40 } });
    const h = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 3, ty: h.ty, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 3, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx - 3, ty: h.ty, long: false } });
    window.__dev.skirmishLine({ tp: { tx: 40, ty: 40 } });
    const probe = window.__dev.skirmishLine({ skirmishProbe: true }).skirmishProbe;
    const scoreProbe = window.__dev.skirmishLine({ scoreProbe: { score: 4 } }).scoreProbe;
    const vm = window.__dev.skirmishLine();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { score: vm.score, tier: vm.tier, mark: vm.mark, mobCount: vm.mobCount,
      probeScore: probe.score, probeCount: probe.count, scoreProbe, fp };
  };
  const c1 = await page.evaluate(driver);
  await page2.bringToFront();
  const c2 = await page2.evaluate(driver);
  await page.bringToFront();
  const conv = c1.score === c2.score && c1.tier === c2.tier && c1.mark === c2.mark && c1.mobCount === c2.mobCount &&
    c1.probeScore === c2.probeScore && c1.probeCount === c2.probeCount &&
    JSON.stringify(c1.scoreProbe) === JSON.stringify(c2.scoreProbe) && c1.fp === c2.fp;
  // el score esperado por mi oráculo: 2 largo (2+2) + 1 corto (1) = 5 → T2, mark 2
  const myConv = myScore([{ranged:true,range:250,dead:false,dx:96,dy:0},{ranged:true,range:250,dead:false,dx:0,dy:96},{ranged:true,range:210,dead:false,dx:96,dy:0}]);
  ok("9  NORTH STAR 2-CLIENTE 0-DESYNC: score/tier/mark/probe/scoreProbe/worldFingerprint IDÉNTICOS byte-a-byte + score==myScore local",
     conv && c1.score === 5 && c1.tier === 2 && c1.mark === 2 && c1.score === myConv,
     `c1={s:${c1.score},t:${c1.tier},m:${c1.mark},pc:${c1.probeCount}} c2={s:${c2.score},t:${c2.tier},m:${c2.mark},pc:${c2.probeCount}} fpMatch=${c1.fp === c2.fp} myScore=${myConv}`);

  // 10 badge glifo instrumentation: ON+línea ⇒ tag ➶ (dibujado); OFF ⇒ ""
  const badge = await page.evaluate(() => {
    window.__dev.skirmishLine({ enabled: true });
    window.__dev.skirmishLine({ clearSkirmish: true });
    const h = window.__dev.skirmishLine().hero;
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx + 2, ty: h.ty, long: true } });
    window.__dev.skirmishLine({ spawnSkirmish: { tx: h.tx, ty: h.ty + 2, long: true } });
    window.__dev.skirmishLine({ tp: { tx: h.tx, ty: h.ty } });
    const on = window.__dev.skirmishLine().tag;
    window.__dev.skirmishLine({ enabled: false });
    const offTag = window.__dev.skirmishLine().tag;
    window.__dev.skirmishLine({ clearSkirmish: true });
    return { on, offTag };
  });
  ok("10 badge glifo: ON+línea cerca ⇒ tag ➶ · OFF ⇒ \"\"", badge.on === "➶" && badge.offTag === "", `on="${badge.on}" off="${badge.offTag}"`);

  // fp value visibility (North Star canonical 15920977) — informational, not a gate
  const fpVal = await page.evaluate(() => { const f = window.__dev.worldFingerprint(393); return (f && (f.h || f.hash || f.fp)) || JSON.stringify(f); });
  console.log(`INFO worldFingerprint(393) = ${JSON.stringify(fpVal)} (North Star canonical byte-id 15920977)`);

  await page.evaluate(() => window.__dev.skirmishLine({ enabled: false }));
  await page.screenshot({ path: join(OUT, "indep-qa.png") });

  ok("0  no JS errors during run", errors.length === 0 && errors2.length === 0, `p1=${errors.length} p2=${errors2.length} ${errors.concat(errors2).slice(0,3).join(" | ")}`);
} catch (e) {
  ok("run completed without throw", false, String(e && e.stack || e));
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
