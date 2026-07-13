// CAS-2322 — QA OBSERVABLE verify for VÍNCULO DE MENTOR / MENTORSHIP BOND (DARK, MENTOR_BOND.enabled:false).
// QA pass sobre el DARK build del GE (commit 4552357, self-verify 19/19). Re-verifica byte-id OFF de forma INDEPENDIENTE y AÑADE el
// diferenciador que el issue exige como MMORPG: EVO#47 FELLOWSHIP unió PARES SIMÉTRICOS; ésta es la capa social ASIMÉTRICA veterano↔novato.
//
// North Star (check 12, no-negociable) = CONVERGENCIA 2-CLIENTE ASIMÉTRICA REAL: DOS páginas puppeteer independientes (dos "jugadores"),
// MISMO reloj lógico (nowMs) ⇒ el COMPAÑERO semanal (roster COMPARTIDO, puro del reloj) es IDÉNTICO byte-a-byte en ambos (0 desync), PERO el
// ROL es ASIMÉTRICO y PERSONAL: A (nivel ALTO vs el compañero) es MENTOR ⚜ (sólo título, 0 poder), B (nivel BAJO) es PROTÉGÉ ✦ (boost XP).
// A profundiza su DWELL (mata 40) ⇒ su rol/tag no cambian (mentor, boost 0) y NI el compañero NI el rol/boost de B se tocan (per-hero AISLADO,
// 0 contención). Corre AL FINAL porque abrir la 2ª página blurea la 1ª ⇒ index.html pausa el game-loop de la 1ª (footgun heredado).
//
// Checks:
//   1  boots to play, __dev.mentor + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (re-verify GE INDEP): enabled false + role none + tag "" + mentorMulRested 0 + boost 0 + save SIN clave 'mentorAt'
//      + hasField false + gExists false + worldFingerprint byte-estable a través del toggle enabled (0 RNG drift, 0 estado nuevo).
//   3  COMPAÑERO determinista + convergencia 1-página: mismo nowMs ⇒ 1 compañero del roster (id/name/lvl), IDÉNTICO en 2 lecturas (0 desync).
//   4  COMPAÑERO ROTA por semana: barriendo semanas surgen ≥2 compañeros DISTINTOS (rotación determinista del roster, identidad social viva).
//   5  ROL por GAP de NIVEL: mismo compañero (lvl P) — hero lvl P+gap ⇒ MENTOR (gap≥umbral); P−gap ⇒ PROTÉGÉ (gap≤−umbral); P ⇒ none.
//   6  DWELL deriva de kills + TIERS: semana fresca ⇒ dwell 0; kill n ⇒ dwell n; nombres Encuentro→Aprendiz→Discípulo (0/4/12).
//   7  BIND gate + boost ESCALONADO: dwell<bindTier ⇒ bound false + boost 0; dwell≥4 ⇒ Aprendiz bound + boost 0.10; dwell≥12 ⇒ Discípulo 0.15 (protégé).
//   8  PASIVO efectivo en gainXP + ASIMETRÍA: served sim aplica mentorMul(h,"restedMult") en gainXP; PROTÉGÉ ligado ⇒ restedXpMult sube +boost;
//      MENTOR ligado ⇒ boost 0 + mentorMulRested 0 (título ⚜, 0 poder — no rompe balance).
//   9  PRECEDENCIA MISMO-CANAL cede + canal ⊥ coexiste: STANDINGS lidera restedMult ⇒ MENTOR (protégé ligado) CEDE (mentorMulRested 0, aplica el
//      MAYOR, 0 doble-conteo); FELLOWSHIP forjada (xpGain ⊥) COEXISTE (fellowForged true, canal independiente).
//  10  byte-id pasivo OFF: enabled false aun con dwell alto + lvl protégé ⇒ role none AND mentorMulRested 0 AND tag "" (gate ⇒ seam byte-id a HEAD).
//  11  render + nameplate: render.js SERVIDO dibuja sim.mentorshipBond() ('Vínculo de Mentor') gated MENTOR_BOND.enabled + glifos ⚜/✦ via
//      sim.mentorBondTag (autoritativo "" OFF / ⚜ mentor / ✦ protégé ON). (+screenshot del nameplate como evidencia.)
//  12  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE ASIMÉTRICA: 2 páginas, MISMO nowMs ⇒ COMPAÑERO IDÉNTICO byte-a-byte; A(lvl alto)=MENTOR ⚜ boost 0,
//      B(lvl bajo)=PROTÉGÉ ✦ boost>0 (roles OPUESTOS, mismo compañero); A profundiza dwell (mata 40) ⇒ rol de A intacto AND compañero+rol+boost de B INTACTOS.
//  13  arco regr con MENTOR ON (FELLOWSHIP+CONTEST+TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REWARDS+WARHORN+EMISSARY+RECALL sanos) + fps no-regresión.
//   0  no JS errors during run.
// Run: node tools/cas2322-mentor-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2322-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                  // SEMANAL (reloj PROPIO del Vínculo, INDEPENDIENTE de Fellowship/Órdenes)
const wk = (w, frac) => w * PERIOD_MS + Math.floor(PERIOD_MS * frac);

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(120); }
async function freshPage(browser, base, errSink) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  if (errSink) { p.on("pageerror", (e) => errSink.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errSink.push(m.text()); }); }
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} }); // localStorage por-origen (compartido) ⇒ limpia el save de la 1ª página para bootear a 'menu'
  await p.bringToFront();                                                       // foreground ⇒ rAF no-throttle ⇒ boot fiable (la 2ª página abre backgrounded)
  await p.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(p); await toHub(p);
  return p;
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
  await toHub(page);

  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.mentor && window.__dev.fellowship && window.__dev.contest && window.__dev.territory && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.mentor + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF (re-verify GE INDEP): FRESH-BOOT snapshot (SIN nowMs) ⇒ gExists false (tickMentor jamás corrió en DARK boot) + hasField false
  //   + save sin 'mentorAt' + fingerprint byte-estable a través del toggle. (Nota: inyectar nowMs por el hook crea G.mentor TRANSITORIO aun OFF —
  //   artefacto del hook, NO estado de boot; por eso gExists se lee ANTES de inyectar reloj — mirror CAS-2316/2309.)
  const off = await page.evaluate(() => {
    const d = window.__dev.mentor();                                            // FRESH boot, SIN nowMs ⇒ estado DARK real
    const save = JSON.stringify(window.__dev.saveBlob());
    const fpA = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.mentor({ enabled: true }); const fpOn = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.mentor({ enabled: false }); const fpB = JSON.stringify(window.__dev.worldFingerprint(777));
    return { enabled: d.enabled, role: d.role, tag: d.tag, mul: d.mentorMulRested, boost: d.boost,
      hasField: d.hasField, gExists: d.gExists, hasKey: /"mentorAt"/.test(save), fpStable: fpA === fpB && fpA === fpOn };
  });
  ok("2 byte-id OFF: FRESH boot ⇒ enabled false + role none + tag \"\" + mentorMulRested 0 + boost 0 + save SIN 'mentorAt' + hasField false + gExists false (tick jamás corrió) + fingerprint byte-estable a través del toggle",
     off.enabled === false && off.role === "none" && off.tag === "" && off.mul === 0 && off.boost === 0 &&
     off.hasKey === false && off.hasField === false && off.gExists === false && off.fpStable === true,
     `enabled=${off.enabled} role=${off.role} tag="${off.tag}" mul=${off.mul} boost=${off.boost} hasKey=${off.hasKey} hasField=${off.hasField} gExists=${off.gExists} fpStable=${off.fpStable}`);

  // 3 COMPAÑERO determinista + convergencia 1-página: same nowMs ⇒ 1 compañero (id/name/lvl), IDÉNTICO en 2 lecturas
  const partner = await page.evaluate((T) => {
    window.__dev.mentor({ enabled: true });
    const a = window.__dev.mentor({ nowMs: T });
    const b = window.__dev.mentor({ nowMs: T });
    return { ja: JSON.stringify(a.partner), jb: JSON.stringify(b.partner), named: !!(a.partner && a.partner.id && a.partner.name && a.partner.lvl) };
  }, wk(5000, 0.40));
  ok("3 COMPAÑERO determinista + convergencia: mismo nowMs ⇒ 1 compañero del roster (id/name/lvl), IDÉNTICO en 2 lecturas (0 desync)",
     partner.ja === partner.jb && partner.named, `partner=${partner.ja}`);

  // 4 COMPAÑERO ROTA por semana: barriendo semanas ⇒ ≥2 compañeros distintos
  const rot = await page.evaluate((PM) => {
    window.__dev.mentor({ enabled: true });
    const sigs = new Set();
    for (let w = 5000; w < 5060; w++) { const nm = w * PM + Math.floor(PM * 0.40);
      const m = window.__dev.mentor({ nowMs: nm });
      sigs.add(m.partner ? m.partner.id : "null"); }
    return { distinct: sigs.size, sample: [...sigs].slice(0, 5) };
  }, PERIOD_MS);
  ok("4 COMPAÑERO ROTA por semana: ≥2 compañeros DISTINTOS al barrer semanas (rotación determinista del roster, identidad social viva)",
     rot.distinct >= 2, `distinct=${rot.distinct} sample=${JSON.stringify(rot.sample)}`);

  // 5 ROL por GAP de NIVEL: mismo compañero (lvl P) — hero P+gap ⇒ MENTOR; P−gap ⇒ PROTÉGÉ; P ⇒ none
  const role = await page.evaluate((T) => {
    window.__dev.mentor({ enabled: true });
    const base = window.__dev.mentor({ nowMs: T });
    const P = base.partner ? base.partner.lvl : 20, thr = base.gapThreshold || 5;
    const hi = window.__dev.mentor({ lvl: P + thr + 3 });                       // gap ≥ umbral ⇒ MENTOR (veterano)
    const lo = window.__dev.mentor({ lvl: Math.max(1, P - thr - 3) });          // gap ≤ −umbral ⇒ PROTÉGÉ (novato)
    const eq = window.__dev.mentor({ lvl: P });                                 // gap 0 ⇒ sin relación
    return { P, thr, hiRole: hi.role, hiGap: hi.gap, loRole: lo.role, loGap: lo.gap, eqRole: eq.role, eqGap: eq.gap };
  }, wk(5001, 0.40));
  ok("5 ROL por GAP: compañero lvl P — hero P+gap ⇒ MENTOR (gap≥umbral); P−gap ⇒ PROTÉGÉ (gap≤−umbral); P ⇒ none (relación asimétrica derivada del nivel local)",
     role.hiRole === "mentor" && role.hiGap >= role.thr && role.loRole === "protege" && role.loGap <= -role.thr && role.eqRole === "none" && role.eqGap === 0,
     JSON.stringify(role));

  // 6 DWELL deriva de kills + TIERS con nombre
  const dwell = await page.evaluate((PM) => {
    const T = 6000 * PM + Math.floor(PM * 0.40);                                // semana fresca ⇒ killBase = kills actuales ⇒ dwell arranca en 0
    window.__dev.mentor({ enabled: true });
    window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: Math.max(1, P - 8) });                           // fija PROTÉGÉ para leer nombres de tier
    const d0 = window.__dev.mentor();                                           // dwell 0 ⇒ Encuentro
    window.__dev.mentor({ kill: { n: 4 } });
    const d1 = window.__dev.mentor();                                           // dwell 4 ⇒ Aprendiz
    window.__dev.mentor({ kill: { n: 8 } });
    const d2 = window.__dev.mentor();                                           // dwell 12 ⇒ Discípulo
    return { dwell0: d0.dwell, name0: d0.tierName, dwell1: d1.dwell, name1: d1.tierName, dwell2: d2.dwell, name2: d2.tierName };
  }, PERIOD_MS);
  ok("6 DWELL deriva de kills + TIERS: semana fresca ⇒ dwell 0 (Encuentro); kill 4 ⇒ dwell 4 (Aprendiz); kill+8 ⇒ dwell 12 (Discípulo) — contador monótono h.kills, 0 tracking nuevo",
     dwell.dwell0 === 0 && dwell.name0 === "Encuentro" && dwell.dwell1 === 4 && dwell.name1 === "Aprendiz" && dwell.dwell2 === 12 && dwell.name2 === "Discípulo", JSON.stringify(dwell));

  // 7 BIND gate + boost ESCALONADO (protégé)
  const bind = await page.evaluate((PM) => {
    const T = 6010 * PM + Math.floor(PM * 0.40);
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: Math.max(1, P - 8) });                           // PROTÉGÉ
    window.__dev.mentor({ kill: { n: 3 } });                                    // dwell 3 < bind(4)
    const below = window.__dev.mentor();
    window.__dev.mentor({ kill: { n: 1 } });                                    // dwell 4 == Aprendiz (bindTier)
    const at = window.__dev.mentor();
    window.__dev.mentor({ kill: { n: 8 } });                                    // dwell 12 == Discípulo
    const hi = window.__dev.mentor();
    return { belowBound: below.bound, belowBoost: below.boost, atBound: at.bound, atBoost: at.boost, hiBoost: hi.boost };
  }, PERIOD_MS);
  ok("7 BIND gate + boost ESCALONADO: dwell<bindTier ⇒ bound false + boost 0; dwell 4 ⇒ Aprendiz bound + boost 0.10; dwell 12 ⇒ Discípulo boost 0.15 (progreso más rápido en compañía)",
     bind.belowBound === false && bind.belowBoost === 0 && bind.atBound === true && near(bind.atBoost, 0.10) && near(bind.hiBoost, 0.15), JSON.stringify(bind));

  // 8 PASIVO efectivo en gainXP + ASIMETRÍA (protégé boost / mentor 0 poder)
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /mentorMul\(h,\s*"restedMult"\)/.test(simSrc);
  const asym = await page.evaluate((PM) => {
    window.__dev.mentor({ enabled: true });
    let T = 6020 * PM + Math.floor(PM * 0.40);                                  // scan a semana con compañero mid-lvl (∈[13,40]) ⇒ ambos roles alcanzables (protégé necesita P≥thr+1)
    for (let w = 6020; w < 6220; w++) { const nm = w * PM + Math.floor(PM * 0.40); const m = window.__dev.mentor({ nowMs: nm }); if (m.partner && m.partner.lvl >= 13 && m.partner.lvl <= 40) { T = nm; break; } }
    window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    // PROTÉGÉ ligado ⇒ boost efectivo en restedMult
    window.__dev.mentor({ lvl: Math.max(1, P - 8) }); window.__dev.mentor({ kill: { n: 12 } });
    const prot = window.__dev.mentor();
    // MENTOR ligado ⇒ mismo dwell alto, pero boost 0 (título, 0 poder)
    window.__dev.mentor({ lvl: P + 8 });
    const men = window.__dev.mentor();
    return { protRole: prot.role, protMul: prot.mentorMulRested, protRested: prot.restedXpMult, menRole: men.role, menMul: men.mentorMulRested, menBoost: men.boost, menBound: men.bound };
  }, PERIOD_MS);
  ok("8 PASIVO efectivo en gainXP + ASIMETRÍA: served sim aplica mentorMul(h,'restedMult') en gainXP; PROTÉGÉ ligado ⇒ mentorMulRested 0.15 (restedXpMult sube); MENTOR ligado ⇒ boost 0 AND mentorMulRested 0 (título ⚜, 0 poder — no rompe balance)",
     seamWired && asym.protRole === "protege" && near(asym.protMul, 0.15) && asym.protRested > 1 && asym.menRole === "mentor" && asym.menBound === true && asym.menMul === 0 && asym.menBoost === 0,
     `wired=${seamWired} ${JSON.stringify(asym)}`);

  // 9 PRECEDENCIA MISMO-CANAL cede (standings) + canal ⊥ coexiste (fellowship xpGain)
  const prec = await page.evaluate((PM) => {
    window.__dev.mentor({ enabled: true });
    let T = 6030 * PM + Math.floor(PM * 0.40);                                  // scan a semana con compañero mid-lvl ⇒ protégé alcanzable
    for (let w = 6030; w < 6230; w++) { const nm = w * PM + Math.floor(PM * 0.40); const m = window.__dev.mentor({ nowMs: nm }); if (m.partner && m.partner.lvl >= 13 && m.partner.lvl <= 40) { T = nm; break; } }
    window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: Math.max(1, P - 8) }); window.__dev.mentor({ kill: { n: 12 } });   // PROTÉGÉ ligado ⇒ pediría restedMult
    // canal ⊥: FELLOWSHIP forjada (xpGain) — debe COEXISTIR
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T }); window.__dev.fellowship({ kill: { n: 20 } });
    const beforeStand = window.__dev.mentor();                                  // sin standings ⇒ mentor aporta restedMult
    // MISMO canal: STANDINGS lidera restedMult ⇒ MENTOR debe CEDER. Requiere SANCTUARY_OATH.enabled (ledgerHeroOrder + tryPledgeOath) Y
    // rango ≥ minRank("recognized") — SANCTUARY_REP.enabled ⇒ hay gate; grantRep alto ⇒ el héroe puede jurar por el chokepoint REAL.
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 });
    window.__dev.standings({ enabled: true, nowMs: T });
    const leader = window.__dev.standings().leader;
    const pledgeRes = window.__dev.oath({ pledge: leader }).result;             // el héroe jura la orden LÍDER por el chokepoint REAL ⇒ standingsMul>0
    const s = window.__dev.mentor();
    return { leader, pledgeRes, beforeMul: beforeStand.mentorMulRested, standMul: s.standingsMulRested, mentorMul: s.mentorMulRested, fellowForged: s.fellowForged, rested: s.restedXpMult };
  }, PERIOD_MS);
  ok("9 PRECEDENCIA: sin standings ⇒ mentor aporta restedMult; STANDINGS lidera restedMult (colectivo) ⇒ MENTOR CEDE (mentorMulRested 0, aplica el MAYOR, 0 doble-conteo); FELLOWSHIP forjada (xpGain ⊥) COEXISTE",
     prec.beforeMul > 0 && prec.standMul > 0 && prec.mentorMul === 0 && prec.fellowForged === true && near(prec.rested, 1.5 + prec.standMul), JSON.stringify(prec));

  // 10 byte-id pasivo OFF: enabled false aun con dwell alto + lvl protégé ⇒ role none AND mul 0 AND tag ""
  const passiveOff = await page.evaluate(() => {
    window.__dev.mentor({ enabled: false });                                   // dwell/lvl persisten, pero el gate lo apaga
    const m = window.__dev.mentor();
    return { enabled: m.enabled, role: m.role, mul: m.mentorMulRested, tag: m.tag, boost: m.boost };
  });
  ok("10 byte-id pasivo OFF: enabled false (aun con dwell alto + lvl protégé) ⇒ role none AND mentorMulRested 0 AND tag \"\" (gate ⇒ seam restedMult byte-id a HEAD)",
     passiveOff.enabled === false && passiveOff.role === "none" && passiveOff.mul === 0 && passiveOff.tag === "" && passiveOff.boost === 0, JSON.stringify(passiveOff));

  // 11 render + nameplate ⚜/✦: served render.js gated draw + mentorBondTag authority + screenshot
  const rsrc = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /MENTOR_BOND\.enabled/.test(rsrc) && /sim\.mentorshipBond\(/.test(rsrc) && /Vínculo de Mentor/.test(rsrc) && /sim\.mentorBondTag\(/.test(rsrc) && /⚜/.test(rsrc) && /✦/.test(rsrc);
  const tagAuth = await page.evaluate((PM) => {
    const T = 6040 * PM + Math.floor(PM * 0.40);
    window.__dev.mentor({ enabled: false }); window.__dev.mentor({ nowMs: T });
    const off = window.__dev.mentor().tag;                                      // OFF ⇒ ""
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: P + 8 }); window.__dev.mentor({ kill: { n: 12 } });
    const men = window.__dev.mentor().tag;                                      // MENTOR ligado ⇒ ⚜
    window.__dev.mentor({ lvl: Math.max(1, P - 8) });
    const prot = window.__dev.mentor().tag;                                     // PROTÉGÉ ligado ⇒ ✦
    return { off, men, prot };
  }, PERIOD_MS);
  const T11 = 6040 * PERIOD_MS + Math.floor(PERIOD_MS * 0.40);
  const forgedNow = await page.evaluate((nm) => {                              // pin Date.now ⇒ tickMentor no re-snapshotea al render ⇒ ⚜ persiste
    window.__t11 = Date.now; Date.now = () => nm;
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: nm });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: P + 8 }); window.__dev.mentor({ kill: { n: 12 } });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    return window.__dev.mentor().tag;
  }, T11);
  await sleep(200);
  try { await page.screenshot({ path: join(OUT, "nameplate-mentor.png"), clip: { x: 520, y: 220, width: 260, height: 200 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__t11) { Date.now = window.__t11; delete window.__t11; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("11 render + nameplate: render.js servido dibuja mentorshipBond() ('Vínculo de Mentor') gated MENTOR_BOND.enabled + glifos ⚜/✦ via mentorBondTag; tag \"\" OFF / ⚜ mentor / ✦ protégé ON",
     gatedDraw && tagAuth.off === "" && tagAuth.men === "⚜" && tagAuth.prot === "✦" && forgedNow === "⚜", `gatedDraw=${gatedDraw} tagOff="${tagAuth.off}" men="${tagAuth.men}" prot="${tagAuth.prot}" forgedNow="${forgedNow}"`);

  // 13 arc regression + fps no-regression (corre antes del North Star 2-cliente)
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.mentor({ enabled: true }); window.__dev.fellowship({ enabled: true });
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const mn = window.__dev.mentor(); const f = window.__dev.fellowship(); const c = window.__dev.contest(); const te = window.__dev.territory(); const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { mentorOk: mn.enabled, fellowOk: f.enabled, contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.mentor({ enabled: on }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const o = await sample(false); const n = await sample(true);
    return { off: o, on: n };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("13 arco regr con MENTOR ON (FELLOWSHIP+CONTEST+TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REWARDS+WARHORN+EMISSARY+RECALL sanos) + fps no-regresión (mediana-de-5, ON ≥ OFF*0.9)",
     arc.mentorOk && arc.fellowOk && arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk && onM >= offM * 0.9,
     `arc=${JSON.stringify(arc)} fps on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  // 12 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE ASIMÉTRICA (corre AL FINAL: abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur).
  // Elige una semana cuyo compañero tenga lvl mid (∈[13,40]) ⇒ A(mentor) y B(protégé) ambos alcanzables con lvl≥1.
  const NS = await page.evaluate((PM) => {
    window.__dev.mentor({ enabled: true });
    for (let w = 7000; w < 7200; w++) { const nm = w * PM + Math.floor(PM * 0.40);
      const m = window.__dev.mentor({ nowMs: nm });
      if (m.partner && m.partner.lvl >= 13 && m.partner.lvl <= 40) return { nm, P: m.partner.lvl, pid: m.partner.id };
    }
    return null;
  }, PERIOD_MS);
  const T_NS = NS.nm, P = NS.P;
  const pageA = page;                                                          // cliente A ya en play
  const errB = [];
  const pageB = await freshPage(browser, base, errB);                          // 2ª página foreground (bringToFront) ⇒ boot fiable
  // PIN Date.now al reloj compartido en AMBAS páginas ⇒ el tickMentor del game-loop usa el MISMO period inyectado y NO re-snapshotea
  // el dwell entre frames (si corriera con el reloj REAL, cuya semana ≠ T_NS, clobbearía h.mentorAt). Restaurado tras el check.
  await pageA.evaluate((nm) => { window.__nsA = Date.now; Date.now = () => nm; }, T_NS);
  await pageB.evaluate((nm) => { window.__nsB = Date.now; Date.now = () => nm; }, T_NS);
  // A = veterano (lvl alto ⇒ mentor); B = novato (lvl bajo ⇒ protégé); mismo compañero (puro del reloj)
  const readA = async (kill) => pageA.evaluate((o) => {
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: o.T });
    window.__dev.mentor({ lvl: o.P + 10 }); if (o.kill) window.__dev.mentor({ kill: { n: o.kill } });
    const m = window.__dev.mentor();
    return { partner: JSON.stringify(m.partner), role: m.role, tag: m.tag, boost: m.boost, dwell: m.dwell, mul: m.mentorMulRested };
  }, { T: T_NS, P, kill });
  const readB = async (kill) => pageB.evaluate((o) => {
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: o.T });
    window.__dev.mentor({ lvl: Math.max(1, o.P - 10) }); if (o.kill) window.__dev.mentor({ kill: { n: o.kill } });
    const m = window.__dev.mentor();
    return { partner: JSON.stringify(m.partner), role: m.role, tag: m.tag, boost: m.boost, dwell: m.dwell, mul: m.mentorMulRested };
  }, { T: T_NS, P, kill });
  const a0 = await readA(12);                                                  // A liga como MENTOR (dwell 12)
  const b0 = await readB(12);                                                  // B liga como PROTÉGÉ (dwell 12)
  // A profundiza su dwell PERSONAL (mata +40) ⇒ NO debe mover NI el compañero (puro del reloj) NI el rol/boost de B (per-hero aislado)
  const a1 = await pageA.evaluate((o) => { window.__dev.mentor({ kill: { n: 40 } }); const m = window.__dev.mentor(); return { partner: JSON.stringify(m.partner), role: m.role, tag: m.tag, boost: m.boost, dwell: m.dwell, mul: m.mentorMulRested }; }, {});
  const b1 = await pageB.evaluate((o) => { const m = window.__dev.mentor({ nowMs: o.T }); return { partner: JSON.stringify(m.partner), role: m.role, tag: m.tag, boost: m.boost, dwell: m.dwell, mul: m.mentorMulRested }; }, { T: T_NS });
  const partnerShared = a0.partner === b0.partner && a0.partner.length > 2;    // COMPAÑERO COMPARTIDO idéntico byte-a-byte
  const rolesAsym = a0.role === "mentor" && a0.tag === "⚜" && a0.boost === 0 && b0.role === "protege" && b0.tag === "✦" && b0.boost > 0 && b0.mul > 0; // roles OPUESTOS, mismo compañero
  const aDeepened = a1.role === "mentor" && a1.tag === "⚜" && a1.boost === 0 && a1.dwell === 52;   // A profundizó pero sigue mentor (0 poder)
  const aPartnerIntact = a1.partner === a0.partner;                            // el COMPAÑERO de A NO cambió (puro del reloj, no del dwell)
  const bIntact = b1.partner === b0.partner && b1.role === "protege" && b1.tag === "✦" && b1.dwell === 12 && b1.boost === b0.boost; // B intacto: A profundizar NO tocó compañero ni rol/boost de B
  try { await pageB.screenshot({ path: join(OUT, "client-b-protege.png") }); } catch (e) {}
  await pageA.evaluate(() => { if (window.__nsA) { Date.now = window.__nsA; delete window.__nsA; } });   // restaura el reloj real
  await pageB.close();
  ok("12 ★ NORTH STAR CONVERGENCIA 2-CLIENTE ASIMÉTRICA: 2 páginas, MISMO nowMs ⇒ COMPAÑERO IDÉNTICO byte-a-byte; A(lvl alto)=MENTOR ⚜ boost 0 + B(lvl bajo)=PROTÉGÉ ✦ boost>0 (roles OPUESTOS, mismo compañero); A profundiza dwell (mata 40) ⇒ rol de A intacto AND compañero+rol+boost de B INTACTOS (per-hero aislado, 0 desync)",
     partnerShared && rolesAsym && aDeepened && aPartnerIntact && bIntact && errB.length === 0,
     `partnerShared=${partnerShared} rolesAsym=${rolesAsym} aDeepened=${aDeepened} aPartnerIntact=${aPartnerIntact} bIntact=${bIntact} A0=${JSON.stringify(a0)} B0=${JSON.stringify(b0)} A1=${JSON.stringify(a1)} B1=${JSON.stringify(b1)} errB=${errB.length}`);

  await page.bringToFront();
  await page.evaluate(() => window.__dev.mentor({ enabled: false }));
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
