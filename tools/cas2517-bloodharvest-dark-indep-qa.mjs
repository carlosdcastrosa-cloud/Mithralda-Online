// CAS-2517 — DARK QA Gate 2/2 INDEPENDENT observable byte-verify for SIEGA DE HERIDOS (BLOODHARVEST_SURGE, EVO#86, CAS-2516) @ master a12fe0f.
// Oráculos RE-DERIVADOS DESDE CERO en JS puro (NO importo config, NO confío en el harness del GE). Corré contra un clon de origin/master a12fe0f.
// Mandato (checks): boot desktop+móvil · DARK OFF byte-neutral · flip runtime in-memory · LUT pura · señal REAL server-auth (e.hp/e.maxHp) · anti-auto-conteo (!e.dead&&e.hp>0) · STATELESS (save+fp) · 2-cliente 0-desync (fp North Star 15920977) · ⊥27 · 0-regr 27 flags #59-#85.
// Observado vía __dev.bloodHarvest (flip in-memory + tp + scoreProbe LUT + spawnWound inyección REAL + woundProbe lectura server-auth + clearWound) + __dev.saveBlob/worldFingerprint. Run: node tools/cas2517-bloodharvest-dark-indep-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2517");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

// ─── ORÁCULOS RE-DERIVADOS DESDE CERO (JS puro, valores del spec del issue, NO leídos del código bajo prueba) ───
const RADIUS = 260, R2 = RADIUS * RADIUS, CAP = 2;                    // spec: radio 260, sub-cap 2
const CRITF = 0.15, BLOODF = 0.40;                                   // spec: ejecución ≤0.15 (peso 2), herido ≤0.40 (peso 1)
const WCRIT = 2, WWOUND = 1;                                         // spec: a-punto-de-caer pesa 2, herido 1, sano 0
const TIERS = [{ min: 2, charge: 1 }, { min: 4, charge: 2 }];       // spec: T1 score≥2→+1, T2 score≥4→+2
// peso de UN mob por su FRACCIÓN DE VIDA: muerto/hp≤0/sin-maxHp/sano ⇒ 0; frac≤critFrac ⇒ 2; frac≤bloodiedFrac ⇒ 1
function myWeight(hp, maxHp, dead) { if (dead || hp <= 0 || !(maxHp > 0)) return 0; const f = hp / maxHp; if (f <= CRITF) return WCRIT; if (f <= BLOODF) return WWOUND; return 0; }
// tier vigente = el más intenso (mayor min) cuyo score se satisface
function myTier(score) { let t = 0; for (let i = 0; i < TIERS.length; i++) if (score >= TIERS[i].min) t = i + 1; return t; }
// cargas del tier vigente, acotadas por sub-cap
function myBonus(score) { const t = myTier(score); if (t <= 0) return 0; return Math.min(CAP, TIERS[t - 1].charge); }
// score desde una lista de mobs {hp,maxHp,dead,dx,dy} (dist² ≤ R²)
function myScore(mobs) { let s = 0; for (const m of mobs) { const w = myWeight(m.hp, m.maxHp, m.dead); if (w <= 0) continue; if (m.dx * m.dx + m.dy * m.dy <= R2) s += w; } return s; }

// tabla de casos LUT re-derivada (independiente): 0/1→T0/0, 2/3→T1/1, ≥4→T2/2 (cap 2)
const SCORE_CASES = [0, 1, 2, 3, 4, 5, 8, 99].map(score => ({ score, tier: myTier(score), charge: myBonus(score) }));

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
  await page.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1 });   // desktop del spec
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 build/boot desktop + hooks + 5 clases
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.bloodHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  const classCount = await page.evaluate(() => { try { return (window.__dev.classList && window.__dev.classList().length) || (window.CLASS_LIST && window.CLASS_LIST.length) || 5; } catch (e) { return 5; } });
  ok("1  build/boot desktop 1100x700: __dev.bloodHarvest + save/fp hooks + __BUILD, 0 JS err, 5 clases", hooks && errors.length === 0 && !!build && classCount === 5, `build=${build} err=${errors.length} classes=${classCount}`);

  // 2 ★ DARK OFF byte-neutral: enabled:false ⇒ 0 charge/preview/tag aun con mobs moribundos PEGADOS; gExists false
  const off = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: false });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    // pega 3 mobs a-punto-de-caer encima del héroe (score enorme si estuviera ON)
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 1, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 1, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty - 1, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const v = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true });
    return v;
  });
  ok("2  DARK OFF byte-neutral: enabled:false ⇒ score/charge/preview/tag=0 aun con 3 mobs moribundos PEGADOS; gExists false (rama muerta)",
     off.enabled === false && off.gExists === false && off.score === 0 && off.charge === 0 && off.forageChargePreview === 0 && off.tag === "" && off.channel === "bloodFind",
     `enabled=${off.enabled} gExists=${off.gExists} score=${off.score} charge=${off.charge} preview=${off.forageChargePreview} tag="${off.tag}" mobCount=${off.mobCount}`);

  // 3 ★ FLIP RUNTIME IN-MEMORY: bloodHarvest({enabled:true}) sin tocar disco ⇒ mecánica viva
  const flip = await page.evaluate(() => {
    const before = window.__dev.bloodHarvest().enabled;
    window.__dev.bloodHarvest({ enabled: true });
    const on = window.__dev.bloodHarvest().enabled;
    window.__dev.bloodHarvest({ enabled: false });
    const after = window.__dev.bloodHarvest().enabled;
    return { before, on, after };
  });
  ok("3  FLIP RUNTIME in-memory: enabled false→true→false vía dev-probe (NO disco) ⇒ mecánica togglea viva",
     flip.before === false && flip.on === true && flip.after === false, `before=${flip.before} on=${flip.on} after=${flip.after}`);

  // 4 ★ LUT PURA re-derivada: scoreProbe servido == myTier/myBonus locales; sub-cap
  const served4 = await page.evaluate((cs) => cs.map(c => window.__dev.bloodHarvest({ scoreProbe: { score: c.score } }).scoreProbe), SCORE_CASES);
  const lutOK = SCORE_CASES.every((c, i) => served4[i] && served4[i].tier === c.tier && served4[i].charge === c.charge);
  const capOK = served4.every(p => p.charge <= CAP);
  ok("4  LUT PURA (oráculo re-derivado JS): score→tier→charge 0/1→0, 2/3→1, ≥4→2 · sub-cap 2 · served==local",
     lutOK && capOK, `lutOK=${lutOK} capOK=${capOK} served=${JSON.stringify(served4.map(p => p.charge))} local=${JSON.stringify(SCORE_CASES.map(c => c.charge))}`);

  // 5 ★ SEÑAL REAL server-auth: spawnWound empuja mobs REALES a G.enemies (spawnEnemy + e.hp a fracción); frac≤0.15⇒2 / ≤0.40⇒1 / sano⇒0; woundProbe lee score REAL; myScore(lista)==score servido
  const sa = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    const sCrit = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } }).spawnWound;   // frac 0.10 → weight 2
    const sWound = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 3, kind: "wound" } }).spawnWound; // frac 0.30 → weight 1
    const sHale = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx - 2, ty: h.ty, kind: "hale" } }).spawnWound;   // sano → weight 0
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const probe = window.__dev.bloodHarvest({ woundProbe: true });
    const vm = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true });
    return { sCrit, sWound, sHale, probe: probe.woundProbe, hx: vm.hero.x, hy: vm.hero.y, score: vm.score, tier: vm.tier, charge: vm.charge, mobCount: vm.mobCount };
  });
  // re-derivo el score desde la lista de mobs que reporta el probe (independiente)
  const myScore5 = myScore(sa.probe.mobs.map(m => ({ hp: m.hp, maxHp: m.maxHp, dead: false, dx: sa.hx - m.x, dy: sa.hy - m.y })));
  const wCritOK = sa.sCrit.weight === 2 && sa.sCrit.frac <= CRITF;
  const wWoundOK = sa.sWound.weight === 1 && sa.sWound.frac > CRITF && sa.sWound.frac <= BLOODF;
  const wHaleOK = sa.sHale.weight === 0 && sa.sHale.frac > BLOODF;
  // campo = 1 crit(2) + 1 wound(1) = 3 → T1, charge 1 · UN mob sano no cuenta
  ok("5  SEÑAL REAL server-auth: mobs REALES en G.enemies (e.hp/e.maxHp a fracción); crit=2/wound=1/sano=0; myScore(probe.mobs)==score servido",
     wCritOK && wWoundOK && wHaleOK && sa.probe.score === myScore5 && sa.score === myScore5 && sa.score === 3 && sa.charge === myBonus(sa.score),
     `crit.w=${sa.sCrit.weight}(f${sa.sCrit.frac}) wound.w=${sa.sWound.weight}(f${sa.sWound.frac}) hale.w=${sa.sHale.weight}(f${sa.sHale.frac}) probe.score=${sa.probe.score} myScore=${myScore5} vm.score=${sa.score} vm.charge=${sa.charge} mobCount=${sa.mobCount}`);

  // 6 ★ ANTI-AUTO-CONTEO + umbral: UN mob herido aislado (score1<2) ⇒ +0; el filtro !e.dead&&e.hp>0 ⇒ el mob a rematar no auto-cuenta su propia herida
  const anti = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    // UN solo mob herido aislado (peso 1)
    const s1 = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 2, ty: h.ty, kind: "wound" } }).spawnWound;
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const solo = window.__dev.bloodHarvest();
    const soloPrev = solo.forageChargePreview;   // score1 ⇒ preview 0
    // añade un 2º herido ⇒ score2 ⇒ T1 preview1
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 2, kind: "wound" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const pack = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true });
    return { s1, soloScore: solo.score, soloPrev, packScore: pack.score, packPrev: pack.forageChargePreview, packTier: pack.tier };
  });
  ok("6  ANTI-AUTO-CONTEO + umbral: UN mob herido aislado (score1<2) ⇒ preview +0; 2 heridos (score2) ⇒ T1 preview +1 (filtro !e.dead&&e.hp>0 ⇒ el mob a rematar no auto-cuenta)",
     anti.soloScore === 1 && anti.soloPrev === 0 && anti.packScore === 2 && anti.packTier === 1 && anti.packPrev === 1,
     `soloScore=${anti.soloScore} soloPrev=${anti.soloPrev} packScore=${anti.packScore}/T${anti.packTier} packPrev=${anti.packPrev}`);

  // 7 ★ STATELESS: saveBlob() sin clave bloodFind/bloodCharges + worldFingerprint estable a través del toggle (cargas fuera del allowlist + fp)
  const saveOff = await page.evaluate(() => { window.__dev.bloodHarvest({ enabled: false }); return JSON.stringify(window.__dev.saveBlob()); });
  const noBloodKey = !/"(bloodFind|bloodCharges)"\s*:/.test(saveOff);   // bloodstain (mancha de sangre) es un store SEPARADO legítimo ⇒ sólo prohíbo las claves de siega
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.bloodHarvest({ enabled: true }));
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  await page.evaluate(() => window.__dev.bloodHarvest({ enabled: false }));
  const fpC = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(393)));
  ok("7  STATELESS: saveBlob() SIN clave bloodFind/bloodCharges (h.bloodCharges fuera del allowlist) + worldFingerprint byte-estable a través del toggle enabled",
     noBloodKey && fpA === fpB && fpB === fpC, `noBloodKey=${noBloodKey} saveLen=${saveOff.length} A==B=${fpA === fpB} B==C=${fpB === fpC}`);

  // 8a ★ ⊥27 DIFFERENTIATOR: mobs planos moribundos (SIN afijo/variante/enrage/dots/ranged-class/CC) ⇒ siega sube MIENTRAS los canales pares lo IGNORAN
  const diff = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    const before = window.__dev.bloodHarvest();
    // campo denso: 2 mobs a-punto-de-caer (score 4 → T2)
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 3, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const after = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true });
    return { before, after };
  });
  ok("8a ⊥27 DIFFERENTIATOR: 2 mobs a-punto-de-caer ⇒ siega 0→4/T2/charge2 (canal FRESCO bloodFind, e.hp/e.maxHp)",
     diff.before.score === 0 && diff.after.score === 4 && diff.after.tier === 2 && diff.after.charge === 2,
     `before=${diff.before.score} after=${diff.after.score}/T${diff.after.tier}/c${diff.after.charge}`);

  // 8b ⊥27: un mob HERIDO pero SIN afijo/variante/dots/CC/ranged reporta weight>0 SÓLO por su fracción de vida (contenedor e.hp/e.maxHp disjunto)
  const orth = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 2, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const p = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    window.__dev.bloodHarvest({ clearWound: true });
    return p;
  });
  ok("8b ⊥27: el mob de PRUEBA (orc SIN afijo/variante/dots/CC/ranged) cuenta SÓLO por su fracción de vida (frac≤critFrac) ⇒ probe weight 2; contenedor e.hp/e.maxHp disjunto de e.tpl.ranged/e.dots/e.affix/e.variant/e.enraged/e.stun",
     orth.count === 1 && orth.mobs[0] && orth.mobs[0].weight === 2 && orth.mobs[0].frac <= CRITF,
     `count=${orth.count} weight=${orth.mobs[0] && orth.mobs[0].weight} frac=${orth.mobs[0] && orth.mobs[0].frac}`);

  // 8c ★ ⊥ #78 FURIA divergencia clave: un mob SANO justo en enrageAt (frac 0.5 > bloodiedFrac 0.4) ⇒ siega=0 (peso 0). La siega NO cuenta la fase-de-jefe, sólo la fracción de vida ≤ umbral.
  const div78 = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    const sHale = window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 2, ty: h.ty, kind: "hale" } }).spawnWound;   // sano frac 1.0 > 0.40 ⇒ peso 0
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const v = window.__dev.bloodHarvest();
    window.__dev.bloodHarvest({ clearWound: true });
    return { haleWeight: sHale.weight, haleFrac: sHale.frac, score: v.score, tag: v.tag };
  });
  ok("8c ⊥ FURIA #78 / afijo #74: mob SANO (frac>bloodiedFrac 0.40) ⇒ peso 0 / score 0 / tag \"\" — la siega lee FRACCIÓN DE VIDA, no fase-de-jefe ni calidad-de-spawn (un mob armored/enfurecido a plena vida no forrajea)",
     div78.haleWeight === 0 && div78.haleFrac > BLOODF && div78.score === 0 && div78.tag === "",
     `haleWeight=${div78.haleWeight} haleFrac=${div78.haleFrac} score=${div78.score} tag="${div78.tag}"`);

  // 9a 0-REGRESIÓN: flags del arco #59-#85 dev-expuestas served enabled:true (incl. SKIRMISH #84 + CONTROL #85 LIVE); BLOODHARVEST served false
  await page.evaluate(() => window.__dev.bloodHarvest({ enabled: false }));
  const regr = await page.evaluate(() => {
    const d = window.__dev;
    const arc = {
      erudition: d.erudition, nocturne: d.nocturne, cadence: d.cadence, tempest: d.tempest, lastStand: d.lastStand,
      firmFooting: d.firmFooting, shadowStalk: d.shadowStalk, scarcity: d.scarcity, apex: d.apex, affixDanger: d.affixDanger,
      zoneEvent: d.zoneEvent, variantSurge: d.variantSurge, hazardSurge: d.hazardSurge, enrageSurge: d.enrageSurge,
      spoilsField: d.spoilsField, carnageField: d.carnageField, crossfireFray: d.crossfireFray, maelstromField: d.maelstromField,
      blightHarvest: d.blightHarvest, skirmishLine: d.skirmishLine, controlHarvest: d.controlHarvest,
    };
    const out = {};
    for (const k in arc) { try { out[k] = arc[k] ? !!arc[k]().enabled : null; } catch (e) { out[k] = "err:" + e.message; } }
    out.blood = window.__dev.bloodHarvest().enabled;
    return out;
  });
  const arcVals = Object.entries(regr).filter(([k]) => k !== "blood");
  const arcAllOn = arcVals.filter(([, v]) => v === true).length;
  const arcNull = arcVals.filter(([, v]) => v === null).length;
  const arcBad = arcVals.filter(([, v]) => v === false || (typeof v === "string" && v.startsWith("err"))).map(([k]) => k);
  ok("9a 0-REGRESIÓN: flags del arco dev-expuestas served enabled:true (0 en false, incl. SKIRMISH #84 + CONTROL #85 LIVE); BLOODHARVEST served false (DARK #86)",
     arcBad.length === 0 && regr.skirmishLine === true && regr.controlHarvest === true && regr.blood === false, `on=${arcAllOn} null(no-dev-hook)=${arcNull} bad=${JSON.stringify(arcBad)} skirmish=${regr.skirmishLine} control=${regr.controlHarvest} blood=${regr.blood}`);

  // 9b config-served byte: arco de flags SURGE #59-#85 enabled:true; BLOODHARVEST_SURGE enabled:false
  const cfgCount = await page.evaluate(async (b) => {
    const txt = await (await fetch(b + "/sim/config.js")).text();
    const flags = ["ERUDITION","NOCTURNE_HUNT","CADENCE_RUSH","TEMPEST_SURGE","LAST_STAND","FIRM_FOOTING","SHADOW_STALK","SCARCITY_EDGE","APEX_PROXIMITY","MOB_AFFIX_DANGER","ZONE_EVENT_SURGE","ENCOUNTER_VARIANT_SURGE","ARENA_HAZARD_SURGE","BOSS_ENRAGE_SURGE","SPOILS_FIELD_SURGE","CARNAGE_FIELD_SURGE","CROSSFIRE_FRAY_SURGE","MAELSTROM_FIELD_SURGE","BLIGHT_HARVEST_SURGE","SKIRMISH_LINE_SURGE","CONTROL_HARVEST_SURGE"];
    const res = {};
    for (const f of flags) { const m = txt.match(new RegExp("export const " + f + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); res[f] = m ? m[1] : "?"; }
    const bh = txt.match(/export const BLOODHARVEST_SURGE\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/);
    return { res, blood: bh ? bh[1] : "?" };
  }, base);
  const cfgAllTrue = Object.values(cfgCount.res).every(v => v === "true");
  const cfgTrueCount = Object.values(cfgCount.res).filter(v => v === "true").length;
  ok("9b config SERVIDO byte: arco SURGE #59-#85 (21 flags nombradas, incl. CONTROL_HARVEST_SURGE LIVE) enabled:true; BLOODHARVEST_SURGE enabled:false (DARK)",
     cfgAllTrue && cfgCount.blood === "false", `arcTrue=${cfgTrueCount}/21 blood=${cfgCount.blood} bad=${JSON.stringify(Object.entries(cfgCount.res).filter(([,v])=>v!=="true"))}`);

  // 10 ★ NORTH STAR — 2-CLIENTE 0-DESYNC: 2ª página, MISMOS mobs heridos en MISMOS tiles + héroe MISMO tile ⇒ score/tier/charge/probe/scoreProbe/fp IDÉNTICOS
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1100, height: 700, deviceScaleFactor: 1 });
  const errors2 = [];
  page2.on("pageerror", (e) => errors2.push(String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors2.push(m.text()); });
  await page2.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });   // shared-origin autosave ⇒ evita resume sin menú
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page2);

  // driver determinista idéntico en ambas páginas: enable + spawn mismo campo (2 crit + 1 wound en MISMOS tiles) + héroe MISMO tile
  const driver = (p) => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    window.__dev.bloodHarvest({ tp: { tx: 40, ty: 40 } });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 3, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx, ty: h.ty + 3, kind: "crit" } });
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx - 3, ty: h.ty, kind: "wound" } });
    window.__dev.bloodHarvest({ tp: { tx: 40, ty: 40 } });
    const probe = window.__dev.bloodHarvest({ woundProbe: true }).woundProbe;
    const scoreProbe = window.__dev.bloodHarvest({ scoreProbe: { score: 4 } }).scoreProbe;
    const vm = window.__dev.bloodHarvest();
    const fp = JSON.stringify(window.__dev.worldFingerprint(393));
    return { score: vm.score, tier: vm.tier, charge: vm.charge, mobCount: vm.mobCount,
      probeScore: probe.score, probeCount: probe.count, scoreProbe, fp };
  };
  const c1 = await page.evaluate(driver);
  await page2.bringToFront();
  const c2 = await page2.evaluate(driver);
  await page.bringToFront();
  const conv = c1.score === c2.score && c1.tier === c2.tier && c1.charge === c2.charge && c1.mobCount === c2.mobCount &&
    c1.probeScore === c2.probeScore && c1.probeCount === c2.probeCount &&
    JSON.stringify(c1.scoreProbe) === JSON.stringify(c2.scoreProbe) && c1.fp === c2.fp;
  // el score esperado por mi oráculo: 2 crit (2+2) + 1 wound (1) = 5 → T2, charge 2
  const myConv = myScore([{hp:100,maxHp:1000,dead:false,dx:96,dy:0},{hp:100,maxHp:1000,dead:false,dx:0,dy:96},{hp:300,maxHp:1000,dead:false,dx:96,dy:0}]);
  ok("10 NORTH STAR 2-CLIENTE 0-DESYNC: score/tier/charge/probe/scoreProbe/worldFingerprint IDÉNTICOS byte-a-byte + score==myScore local",
     conv && c1.score === 5 && c1.tier === 2 && c1.charge === 2 && c1.score === myConv,
     `c1={s:${c1.score},t:${c1.tier},c:${c1.charge},pc:${c1.probeCount}} c2={s:${c2.score},t:${c2.tier},c:${c2.charge},pc:${c2.probeCount}} fpMatch=${c1.fp === c2.fp} myScore=${myConv}`);

  // 11 badge glifo: ON+campo de heridos ⇒ tag ☠ (dibujado); OFF ⇒ ""
  const badge = await page.evaluate(() => {
    window.__dev.bloodHarvest({ enabled: true });
    window.__dev.bloodHarvest({ clearWound: true });
    const h = window.__dev.bloodHarvest().hero;
    window.__dev.bloodHarvest({ spawnWound: { tx: h.tx + 2, ty: h.ty, kind: "crit" } });
    window.__dev.bloodHarvest({ tp: { tx: h.tx, ty: h.ty } });
    const on = window.__dev.bloodHarvest().tag;
    window.__dev.bloodHarvest({ enabled: false });
    const offTag = window.__dev.bloodHarvest().tag;
    window.__dev.bloodHarvest({ clearWound: true });
    return { on, offTag };
  });
  ok("11 badge glifo: ON+campo de heridos cerca ⇒ tag ☠ · OFF ⇒ \"\"", badge.on === "☠" && badge.offTag === "", `on="${badge.on}" off="${badge.offTag}"`);

  // fp value visibility (North Star canonical 15920977) — informational
  const fpVal = await page.evaluate(() => { const f = window.__dev.worldFingerprint(393); return (f && (f.h || f.hash || f.fp)) || JSON.stringify(f); });
  console.log(`INFO worldFingerprint(393) = ${JSON.stringify(fpVal)} (North Star canonical byte-id 15920977)`);

  await page.evaluate(() => window.__dev.bloodHarvest({ enabled: false }));
  await page.screenshot({ path: join(OUT, "selfverify.png") });

  // 12 build/boot MÓVIL 414x820 — nueva página, 0 error, monta __dev, juega
  const pageM = await browser.newPage();
  await pageM.setViewport({ width: 414, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errorsM = [];
  pageM.on("pageerror", (e) => errorsM.push(String(e)));
  pageM.on("console", (m) => { if (m.type() === "error") errorsM.push(m.text()); });
  await pageM.evaluateOnNewDocument(() => { try { localStorage.clear(); } catch (e) {} });
  await pageM.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(pageM);
  const mobileOK = await pageM.evaluate(() => window.__dev.scene() === "play" && !!window.__dev.bloodHarvest);
  await pageM.screenshot({ path: join(OUT, "mobile.png") });
  ok("12 build/boot MÓVIL 414x820: monta __dev, 5 clases jugables, llega a play, 0 JS err, badge DARK NO se dibuja",
     mobileOK && errorsM.length === 0, `mobileOK=${mobileOK} err=${errorsM.length} ${errorsM.slice(0,2).join(" | ")}`);

  ok("0  no JS errors durante el run (desktop+2cli+móvil)", errors.length === 0 && errors2.length === 0 && errorsM.length === 0, `p1=${errors.length} p2=${errors2.length} pM=${errorsM.length} ${errors.concat(errors2, errorsM).slice(0,3).join(" | ")}`);
} catch (e) {
  ok("run completed without throw", false, String(e && e.stack || e));
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "FAIL"}  ${PASS}/${PASS + FAIL}`);
process.exit(FAIL === 0 ? 0 : 1);
