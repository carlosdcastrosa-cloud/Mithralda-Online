// CAS-2324 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — VÍNCULO DE MENTOR / MENTORSHIP BOND (MENTOR_BOND.enabled:true LIVE)
// Capa social ASIMÉTRICA veterano↔novato (tras FELLOWSHIP simétrico, EVO#47): un COMPAÑERO semanal COMPARTIDO (roster pura del
// reloj, IDÉNTICO para todo el shard) + un ROL PERSONAL por GAP de nivel (veterano ⇒ MENTOR ⚜ título 0-poder; novato ⇒ PROTÉGÉ ✦
// con boost XP escalonado por DWELL de co-presencia). EVO mecánica #48.
//
// LIVE post-flip via CTO CAS-2323 (master dd748af flip + 080f86e deploy): MENTOR_BOND.enabled false→true, overlay consistente-HEAD
// 4-file {config,sim,game,render} SIN input.js, served build 33f4d4ba0e26 (≠ pre-flip 63b3dee81076). Este harness es el gemelo LIVE
// de la DARK observable tools/cas2322-mentor-observable-qa.mjs: MISMOS hechos, pero contra el build SERVIDO en gh-pages
// (carlosdcastrosa-cloud.github.io/Mithralda-Online), con el patrón DEFAULT-ON (el flip ya cargó: enabled:true SERVIDO + compañero
// real-clock) en vez del DARK-default byte-id OFF (que aquí se re-verifica vía TOGGLE, no fresh-boot — footgun DEFAULT-ON).
//
// North Star (check 12, no-negociable) = CONVERGENCIA 2-CLIENTE ASIMÉTRICA REAL LIVE: DOS páginas puppeteer independientes,
// MISMO reloj lógico (nowMs) ⇒ COMPAÑERO semanal IDÉNTICO byte-a-byte (0 desync), PERO ROL OPUESTO y PERSONAL: A (lvl alto) = MENTOR ⚜
// (sólo título, 0 poder), B (lvl bajo) = PROTÉGÉ ✦ (boost XP). A profundiza su DWELL (mata 40) ⇒ su rol/tag intactos AND compañero+rol+boost
// de B INTACTOS (per-hero aislado, 0 contención). Corre AL FINAL (abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur).
//
// Checks:
//   1  boot LIMPIO LIVE + __dev.mentor + arc hooks + __BUILD self-consistente vs version.json + 0 err / 0 non-favicon 404.
//   2  served sim/config.js: MENTOR_BOND.enabled:true SERVIDO + FELLOWSHIP + arco entero enabled:true (0 regr); 3 DARK unrelated false.
//   3  DEFAULT-ON (prueba LIVE): boot fresco 0 __dev flip ⇒ mentor().enabled===true AND compañero real-clock presente AND dwell 0
//      AND bound false AND boost 0 AND mentorMulRested 0 AND tag "" (flip cargó; pasivo NO activo sin dwell forjado).
//   4  byte-id when OFF (toggle): mentor({enabled:false}) ⇒ role none AND mentorMulRested 0 AND tag "" AND boost 0 AND save sin 'mentorAt'
//      AND worldFingerprint byte-stable ⇒ reversible sin drift; restaura ON. (NO se afirma gExists: DEFAULT-ON tickMentor ya corrió.)
//   5  COMPAÑERO determinista + convergencia 1-página: mismo nowMs ⇒ 1 compañero (id/name/lvl), IDÉNTICO en 2 lecturas (0 desync).
//   6  COMPAÑERO ROTA por semana: barriendo semanas ⇒ ≥2 compañeros DISTINTOS (rotación determinista del roster, identidad viva).
//   7  ROL por GAP de NIVEL: compañero lvl P — hero P+gap ⇒ MENTOR (gap≥umbral); P−gap ⇒ PROTÉGÉ (gap≤−umbral); P ⇒ none.
//   8  DWELL de kills + TIERS + BIND escalonado: dwell 0 Encuentro; dwell 4 Aprendiz bound boost 0.10; dwell 12 Discípulo boost 0.15.
//   9  PASIVO servido + ASIMETRÍA: served sim.js aplica mentorMul(h,'restedMult') en gainXP; PROTÉGÉ ligado ⇒ mentorMulRested 0.15
//      (restedXpMult sube); MENTOR ligado ⇒ boost 0 AND mentorMulRested 0 (título ⚜, 0 poder — no rompe balance).
//  10  PRECEDENCIA MISMO-CANAL cede + canal ⊥ coexiste: STANDINGS lidera restedMult ⇒ MENTOR CEDE (mentorMulRested 0, aplica el MAYOR,
//      0 doble-conteo); FELLOWSHIP forjada (xpGain ⊥) COEXISTE (fellowForged true, canal independiente).
//  11  render + nameplate ⚜/✦: render.js SERVIDO dibuja sim.mentorshipBond() ('Vínculo de Mentor') gated MENTOR_BOND.enabled + glifos
//      ⚜/✦ via sim.mentorBondTag (autoritativo "" OFF / ⚜ mentor / ✦ protégé ON) + screenshot del nameplate.
//  13  arco regr full-stack con MENTOR ON + fps no-regresión (mediana-de-5, ON ≥ OFF*0.9).
//  12  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE ASIMÉTRICA REAL LIVE: 2 páginas, MISMO nowMs ⇒ COMPAÑERO IDÉNTICO byte-a-byte; A(lvl alto)=MENTOR
//      ⚜ boost 0 + B(lvl bajo)=PROTÉGÉ ✦ boost>0 (roles OPUESTOS, mismo compañero); A profundiza dwell (mata 40) ⇒ rol de A intacto AND
//      compañero+rol+boost de B INTACTOS (per-hero aislado, 0 desync). (AL FINAL)
//   0  no JS errors + no non-favicon 404 durante toda la corrida.
//
// LIVE wiring (mirror CAS-2320): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded); favicon-404 filtrado;
// ambas páginas COMPARTEN origen localStorage ⇒ limpiar mithralda.* por página (bootea a 'menu' no 'resume'); 2ª página bringToFront;
// PIN Date.now al reloj compartido en AMBAS páginas del North Star (el tickMentor del game-loop usa Date.now REAL ⇒ re-snapshotearía
// h.mentorAt entre frames — footgun heredado de la DARK CAS-2322).
// Run: node tools/cas2324-mentor-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2324-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                  // SEMANAL (reloj PROPIO del Vínculo, INDEPENDIENTE de Fellowship/Órdenes)
const wk = (w, frac) => w * PERIOD_MS + Math.floor(PERIOD_MS * frac);

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
const isFaviconOnly = (u) => /favicon/i.test(u || "");

async function toPlay(page) {
  await page.waitForFunction("window.__dev && window.__dev.scene", { timeout: 25000 });
  if (await page.evaluate(() => window.__dev.scene()) === "play") { await sleep(300); return; }
  await page.waitForFunction("window.__dev.scene()==='menu'", { timeout: 25000 });
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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(140); }

// fresh page on LIVE: clear shared-origin save so each client boots to a FRESH hero (2 clientes ⇒ 2 héroes) at 'menu' no 'resume'.
async function freshPage(browser, errors, net404) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.bringToFront();                                                    // foreground ⇒ rAF no-throttle ⇒ boot fiable (2ª página abre backgrounded)
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(page);
  return page;
}

const errors = [], net404 = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await freshPage(browser, errors, net404);
  await toHub(page);
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot LIMPIO + hooks + build self-consistent vs version.json
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.mentor && window.__dev.fellowship && window.__dev.contest && window.__dev.territory && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.mentor + arc hooks; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: MENTOR_BOND.enabled:true SERVIDO + FELLOWSHIP + arco entero true; 3 DARK unrelated false
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { MENTOR: en("MENTOR_BOND"), FELLOWSHIP: en("FELLOWSHIP_BOND"), CONTEST: en("ORDER_CONTEST"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"),
      LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"),
      BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const allArcTrue = ["FELLOWSHIP","CONTEST","TERRITORY","STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("2 served config: MENTOR_BOND.enabled:true SERVIDO + FELLOWSHIP + arco entero enabled:true (0 regr); 3 DARK unrelated (BOSS_RUSH/DOORS_INTERIORS/SEEDED_CHALLENGE) false",
     cfg.MENTOR === "true" && allArcTrue && darksFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (prueba LIVE): boot fresco 0 __dev flip ⇒ enabled true + compañero real-clock presente + dwell 0 + bound false + boost 0 + mul 0 + tag ""
  const dOn = await page.evaluate(() => { const m = window.__dev.mentor(); return { enabled: m.enabled, partner: !!(m.partner && m.partner.id), dwell: m.dwell, bound: m.bound, boost: m.boost, mul: m.mentorMulRested, tag: m.tag }; });
  ok("3 DEFAULT-ON desde config servido: mentor().enabled===true AND compañero real-clock presente AND dwell 0 AND bound false AND boost 0 AND mentorMulRested 0 AND tag \"\" (flip cargó; pasivo NO activo sin dwell)",
     dOn.enabled === true && dOn.partner === true && dOn.dwell === 0 && dOn.bound === false && dOn.boost === 0 && dOn.mul === 0 && dOn.tag === "", JSON.stringify(dOn));

  // 4 byte-id when OFF (toggle): enabled:false ⇒ role none + mul 0 + tag "" + boost 0 + save sin 'mentorAt' + fp byte-stable; restaura ON.
  //   FOOTGUN DEFAULT-ON (mirror Fellowship CAS-2320 / Standings CAS-2309): el tickMentor ya corrió con el reloj real ⇒ G.mentor TRANSITORIO
  //   existe; toggle-OFF NO lo limpia. La OFF-safety NO es "gExists false", es que NADA del canal restedMult/nameplate/save/fingerprint cambie.
  const byteId = await page.evaluate(() => {
    window.__dev.mentor({ enabled: false });
    const m = window.__dev.mentor();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.mentor({ enabled: false });
    const fpOff2 = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.mentor({ enabled: true });                                      // restaura ON (DEFAULT-ON servido)
    return { enabled: m.enabled, role: m.role, mul: m.mentorMulRested, tag: m.tag, boost: m.boost,
      noKey: !/"mentorAt"/.test(saveOff), fpStable: fpOff === fpOff2 };
  });
  ok("4 byte-id when OFF (toggle): enabled:false ⇒ role none AND mentorMulRested 0 AND tag \"\" AND boost 0 AND saveBlob() sin 'mentorAt' AND worldFingerprint byte-stable (reversible sin drift; G.mentor transitorio DEFAULT-ON NO es estado — footgun Fellowship/Standings)",
     byteId.enabled === false && byteId.role === "none" && byteId.mul === 0 && byteId.tag === "" && byteId.boost === 0 && byteId.noKey === true && byteId.fpStable === true, JSON.stringify(byteId));

  // 5 COMPAÑERO determinista + convergencia 1-página: same nowMs ⇒ 1 compañero (id/name/lvl), IDÉNTICO en 2 lecturas
  const partner = await page.evaluate((T) => {
    window.__dev.mentor({ enabled: true });
    const a = window.__dev.mentor({ nowMs: T });
    const b = window.__dev.mentor({ nowMs: T });
    return { ja: JSON.stringify(a.partner), jb: JSON.stringify(b.partner), named: !!(a.partner && a.partner.id && a.partner.name && a.partner.lvl) };
  }, wk(5000, 0.40));
  ok("5 COMPAÑERO determinista + convergencia: mismo nowMs ⇒ 1 compañero del roster (id/name/lvl), IDÉNTICO en 2 lecturas (0 desync)",
     partner.ja === partner.jb && partner.named, `partner=${partner.ja}`);

  // 6 COMPAÑERO ROTA por semana: barriendo semanas ⇒ ≥2 compañeros distintos
  const rot = await page.evaluate((PM) => {
    window.__dev.mentor({ enabled: true });
    const sigs = new Set();
    for (let w = 5000; w < 5060; w++) { const nm = w * PM + Math.floor(PM * 0.40);
      const m = window.__dev.mentor({ nowMs: nm });
      sigs.add(m.partner ? m.partner.id : "null"); }
    return { distinct: sigs.size, sample: [...sigs].slice(0, 5) };
  }, PERIOD_MS);
  ok("6 COMPAÑERO ROTA por semana: ≥2 compañeros DISTINTOS al barrer semanas (rotación determinista del roster, identidad social viva)",
     rot.distinct >= 2, `distinct=${rot.distinct} sample=${JSON.stringify(rot.sample)}`);

  // 7 ROL por GAP de NIVEL: mismo compañero (lvl P) — hero P+gap ⇒ MENTOR; P−gap ⇒ PROTÉGÉ; P ⇒ none
  const role = await page.evaluate((T) => {
    window.__dev.mentor({ enabled: true });
    const b = window.__dev.mentor({ nowMs: T });
    const P = b.partner ? b.partner.lvl : 20, thr = b.gapThreshold || 5;
    const hi = window.__dev.mentor({ lvl: P + thr + 3 });                        // gap ≥ umbral ⇒ MENTOR (veterano)
    const lo = window.__dev.mentor({ lvl: Math.max(1, P - thr - 3) });           // gap ≤ −umbral ⇒ PROTÉGÉ (novato)
    const eq = window.__dev.mentor({ lvl: P });                                  // gap 0 ⇒ sin relación
    return { P, thr, hiRole: hi.role, hiGap: hi.gap, loRole: lo.role, loGap: lo.gap, eqRole: eq.role, eqGap: eq.gap };
  }, wk(5001, 0.40));
  ok("7 ROL por GAP: compañero lvl P — hero P+gap ⇒ MENTOR (gap≥umbral); P−gap ⇒ PROTÉGÉ (gap≤−umbral); P ⇒ none (relación asimétrica derivada del nivel local)",
     role.hiRole === "mentor" && role.hiGap >= role.thr && role.loRole === "protege" && role.loGap <= -role.thr && role.eqRole === "none" && role.eqGap === 0,
     JSON.stringify(role));

  // 8 DWELL de kills + TIERS + BIND escalonado (protégé)
  const dwell = await page.evaluate((PM) => {
    const T = 6000 * PM + Math.floor(PM * 0.40);                                 // semana fresca ⇒ killBase = kills actuales ⇒ dwell arranca en 0
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: Math.max(1, P - 8) });                           // fija PROTÉGÉ
    const d0 = window.__dev.mentor();                                           // dwell 0 ⇒ Encuentro, bound false, boost 0
    window.__dev.mentor({ kill: { n: 4 } });
    const d1 = window.__dev.mentor();                                           // dwell 4 ⇒ Aprendiz, bound true, boost 0.10
    window.__dev.mentor({ kill: { n: 8 } });
    const d2 = window.__dev.mentor();                                           // dwell 12 ⇒ Discípulo, boost 0.15
    return { d0: d0.dwell, n0: d0.tierName, b0: d0.bound, x0: d0.boost, d1: d1.dwell, n1: d1.tierName, b1: d1.bound, x1: d1.boost, d2: d2.dwell, n2: d2.tierName, x2: d2.boost };
  }, PERIOD_MS);
  ok("8 DWELL de kills + TIERS + BIND escalonado: dwell 0 Encuentro (bound false, boost 0); dwell 4 Aprendiz (bound true, boost 0.10); dwell 12 Discípulo (boost 0.15) — contador monótono h.kills, 0 tracking nuevo",
     dwell.d0 === 0 && dwell.n0 === "Encuentro" && dwell.b0 === false && dwell.x0 === 0 && dwell.d1 === 4 && dwell.n1 === "Aprendiz" && dwell.b1 === true && near(dwell.x1, 0.10) && dwell.d2 === 12 && dwell.n2 === "Discípulo" && near(dwell.x2, 0.15), JSON.stringify(dwell));

  // 9 PASIVO servido + ASIMETRÍA (protégé boost / mentor 0 poder)
  const simSrc = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/sim.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const seamWired = /function gainXP/.test(simSrc) && /mentorMul\(h,\s*"restedMult"\)/.test(simSrc);
  const asym = await page.evaluate((PM) => {
    window.__dev.mentor({ enabled: true });
    let T = 6020 * PM + Math.floor(PM * 0.40);                                   // scan a semana con compañero mid-lvl (∈[13,40]) ⇒ ambos roles alcanzables
    for (let w = 6020; w < 6220; w++) { const nm = w * PM + Math.floor(PM * 0.40); const m = window.__dev.mentor({ nowMs: nm }); if (m.partner && m.partner.lvl >= 13 && m.partner.lvl <= 40) { T = nm; break; } }
    window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: Math.max(1, P - 8) }); window.__dev.mentor({ kill: { n: 12 } });   // PROTÉGÉ ligado
    const prot = window.__dev.mentor();
    window.__dev.mentor({ lvl: P + 8 });                                          // MENTOR (mismo dwell alto)
    const men = window.__dev.mentor();
    return { protRole: prot.role, protMul: prot.mentorMulRested, protRested: prot.restedXpMult, menRole: men.role, menMul: men.mentorMulRested, menBoost: men.boost, menBound: men.bound };
  }, PERIOD_MS);
  ok("9 PASIVO servido + ASIMETRÍA: served sim.js aplica mentorMul(h,'restedMult') en gainXP; PROTÉGÉ ligado ⇒ mentorMulRested 0.15 (restedXpMult sube); MENTOR ligado ⇒ boost 0 AND mentorMulRested 0 (título ⚜, 0 poder — no rompe balance)",
     seamWired && asym.protRole === "protege" && near(asym.protMul, 0.15) && asym.protRested > 1 && asym.menRole === "mentor" && asym.menBound === true && asym.menMul === 0 && asym.menBoost === 0,
     `wired=${seamWired} ${JSON.stringify(asym)}`);

  // 10 PRECEDENCIA MISMO-CANAL cede (standings) + canal ⊥ coexiste (fellowship xpGain)
  const prec = await page.evaluate((PM) => {
    window.__dev.mentor({ enabled: true });
    let T = 6030 * PM + Math.floor(PM * 0.40);                                   // scan a semana con compañero mid-lvl ⇒ protégé alcanzable
    for (let w = 6030; w < 6230; w++) { const nm = w * PM + Math.floor(PM * 0.40); const m = window.__dev.mentor({ nowMs: nm }); if (m.partner && m.partner.lvl >= 13 && m.partner.lvl <= 40) { T = nm; break; } }
    window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: Math.max(1, P - 8) }); window.__dev.mentor({ kill: { n: 12 } });   // PROTÉGÉ ligado ⇒ pediría restedMult
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T }); window.__dev.fellowship({ kill: { n: 20 } });  // canal ⊥ xpGain
    const beforeStand = window.__dev.mentor();                                   // sin standings ⇒ mentor aporta restedMult
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 });
    window.__dev.standings({ enabled: true, nowMs: T });
    const leader = window.__dev.standings().leader;
    const pledgeRes = window.__dev.oath({ pledge: leader }).result;             // jura la orden LÍDER por el chokepoint REAL ⇒ standingsMul>0
    const s = window.__dev.mentor();
    return { leader, pledgeRes, beforeMul: beforeStand.mentorMulRested, standMul: s.standingsMulRested, mentorMul: s.mentorMulRested, fellowForged: s.fellowForged, rested: s.restedXpMult };
  }, PERIOD_MS);
  ok("10 PRECEDENCIA: sin standings ⇒ mentor aporta restedMult; STANDINGS lidera restedMult (colectivo) ⇒ MENTOR CEDE (mentorMulRested 0, aplica el MAYOR, 0 doble-conteo); FELLOWSHIP forjada (xpGain ⊥) COEXISTE",
     prec.beforeMul > 0 && prec.standMul > 0 && prec.mentorMul === 0 && prec.fellowForged === true && near(prec.rested, 1.5 + prec.standMul), JSON.stringify(prec));

  // 11 render + nameplate ⚜/✦: served render.js gated draw + mentorBondTag authority + screenshot
  const rsrc = await page.evaluate(async (live) => { const r = await fetch(live + "/render/render.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const gatedDraw = /MENTOR_BOND\.enabled/.test(rsrc) && /sim\.mentorshipBond\(/.test(rsrc) && /Vínculo de Mentor/.test(rsrc) && /sim\.mentorBondTag\(/.test(rsrc) && /⚜/.test(rsrc) && /✦/.test(rsrc);
  const tagAuth = await page.evaluate((PM) => {
    const T = 6040 * PM + Math.floor(PM * 0.40);
    window.__dev.mentor({ enabled: false }); window.__dev.mentor({ nowMs: T });
    const off = window.__dev.mentor().tag;                                       // OFF ⇒ ""
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: T });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: P + 8 }); window.__dev.mentor({ kill: { n: 12 } });
    const men = window.__dev.mentor().tag;                                       // MENTOR ligado ⇒ ⚜
    window.__dev.mentor({ lvl: Math.max(1, P - 8) });
    const prot = window.__dev.mentor().tag;                                      // PROTÉGÉ ligado ⇒ ✦
    return { off, men, prot };
  }, PERIOD_MS);
  const T11 = 6040 * PERIOD_MS + Math.floor(PERIOD_MS * 0.40);
  const forgedNow = await page.evaluate((nm) => {                               // pin Date.now ⇒ tickMentor no re-snapshotea al render ⇒ ⚜ persiste
    window.__t11 = Date.now; Date.now = () => nm;
    window.__dev.mentor({ enabled: true }); window.__dev.mentor({ nowMs: nm });
    const P = window.__dev.mentor().partner.lvl;
    window.__dev.mentor({ lvl: P + 8 }); window.__dev.mentor({ kill: { n: 12 } });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    return window.__dev.mentor().tag;
  }, T11);
  await sleep(220);
  try { await page.screenshot({ path: join(OUT, "nameplate-mentor.png"), clip: { x: 520, y: 220, width: 260, height: 200 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__t11) { Date.now = window.__t11; delete window.__t11; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("11 render + nameplate: render.js SERVIDO dibuja mentorshipBond() ('Vínculo de Mentor') gated MENTOR_BOND.enabled + glifos ⚜/✦ via mentorBondTag; tag \"\" OFF / ⚜ mentor / ✦ protégé ON",
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

  // 12 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE ASIMÉTRICA REAL LIVE (corre AL FINAL: abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur).
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
  const errB = [], net404B = [];
  const pageB = await freshPage(browser, errB, net404B);                       // 2ª página foreground (bringToFront) ⇒ boot fiable
  await toHub(pageB);
  // PIN Date.now al reloj compartido en AMBAS páginas ⇒ el tickMentor del game-loop usa el MISMO period y NO re-snapshotea h.mentorAt
  await pageA.evaluate((nm) => { window.__nsA = Date.now; Date.now = () => nm; }, T_NS);
  await pageB.evaluate((nm) => { window.__nsB = Date.now; Date.now = () => nm; }, T_NS);
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
  const a1 = await pageA.evaluate(() => { window.__dev.mentor({ kill: { n: 40 } }); const m = window.__dev.mentor(); return { partner: JSON.stringify(m.partner), role: m.role, tag: m.tag, boost: m.boost, dwell: m.dwell, mul: m.mentorMulRested }; });
  const b1 = await pageB.evaluate((o) => { const m = window.__dev.mentor({ nowMs: o.T }); return { partner: JSON.stringify(m.partner), role: m.role, tag: m.tag, boost: m.boost, dwell: m.dwell, mul: m.mentorMulRested }; }, { T: T_NS });
  const partnerShared = a0.partner === b0.partner && a0.partner.length > 2;    // COMPAÑERO COMPARTIDO idéntico byte-a-byte
  const rolesAsym = a0.role === "mentor" && a0.tag === "⚜" && a0.boost === 0 && b0.role === "protege" && b0.tag === "✦" && b0.boost > 0 && b0.mul > 0; // roles OPUESTOS
  const aDeepened = a1.role === "mentor" && a1.tag === "⚜" && a1.boost === 0 && a1.dwell === 52;   // A profundizó pero sigue mentor (0 poder)
  const aPartnerIntact = a1.partner === a0.partner;                            // el COMPAÑERO de A NO cambió (puro del reloj)
  const bIntact = b1.partner === b0.partner && b1.role === "protege" && b1.tag === "✦" && b1.dwell === 12 && b1.boost === b0.boost; // B intacto
  try { await pageB.screenshot({ path: join(OUT, "client-b-protege.png") }); } catch (e) {}
  await pageA.evaluate(() => { if (window.__nsA) { Date.now = window.__nsA; delete window.__nsA; } });   // restaura el reloj real
  await pageB.close();
  ok("12 ★ NORTH STAR CONVERGENCIA 2-CLIENTE ASIMÉTRICA REAL LIVE: 2 páginas, MISMO nowMs ⇒ COMPAÑERO IDÉNTICO byte-a-byte; A(lvl alto)=MENTOR ⚜ boost 0 + B(lvl bajo)=PROTÉGÉ ✦ boost>0 (roles OPUESTOS, mismo compañero); A profundiza dwell (mata 40) ⇒ rol de A intacto AND compañero+rol+boost de B INTACTOS (per-hero aislado, 0 desync)",
     partnerShared && rolesAsym && aDeepened && aPartnerIntact && bIntact && errB.length === 0 && net404B.length === 0,
     `partnerShared=${partnerShared} rolesAsym=${rolesAsym} aDeepened=${aDeepened} aPartnerIntact=${aPartnerIntact} bIntact=${bIntact} A0=${JSON.stringify(a0)} B0=${JSON.stringify(b0)} A1=${JSON.stringify(a1)} B1=${JSON.stringify(b1)} errB=${errB.length} 404B=${net404B.length}`);

  await page.bringToFront();
  await page.evaluate(() => window.__dev.mentor({ enabled: true }));            // deja el estado DEFAULT-ON servido
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors + no non-favicon 404 durante toda la corrida", errors.length === 0 && net404.length === 0, `err=${errors.slice(0,3).join(" | ")} 404=${net404.slice(0,3).join(" | ")}`);
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\nLIVE=${LIVE}`);
console.log(`${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
