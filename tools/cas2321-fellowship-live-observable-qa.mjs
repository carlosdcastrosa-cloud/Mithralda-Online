// CAS-2321 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — COMPAÑEROS DE RUTA / WAYFARERS' FELLOWSHIP (FELLOWSHIP_BOND.enabled:true LIVE)
// Capa social PERSONAL nueva (EVO #47): una BANDA semanal COMPARTIDA (roster puro del reloj) + un VÍNCULO PERSONAL que profundizas matando.
// Al FORJAR el vínculo ganas un pasivo aislado (+10% al canal xpGain). LIVE post-flip via CTO CAS-2317 (master fb590b9):
// FELLOWSHIP_BOND.enabled false→true, overlay consistente-HEAD 4-file {config,sim,game,render} SIN input.js, served build 63b3dee81076.
//
// Este harness es el GEMELO LIVE de la DARK observable tools/cas2316-fellowship-observable-qa.mjs (13/13 PASS ×2, build c4a549ae2fa1):
// MISMOS hechos, pero contra el build SERVIDO en gh-pages (carlosdcastrosa-cloud.github.io/Mithralda-Online), con el patrón DEFAULT-ON
// (el flip ya cargó: enabled:true SERVIDO + banda derivada del reloj real) en vez del DARK-default byte-id OFF (que aquí se re-verifica vía TOGGLE).
//
// North Star (check 14, no-negociable) = CONVERGENCIA 2-CLIENTE REAL LIVE: DOS páginas puppeteer independientes (dos "jugadores"),
// MISMO reloj lógico (nowMs) ⇒ la BANDA semanal (roster COMPARTIDO, pura del reloj) es IDÉNTICA byte-a-byte en ambos (0 desync), mientras
// que el VÍNCULO es PERSONAL: el cliente A profundiza su vínculo (mata 40) ⇒ su bond/tier/glifo suben, pero la BANDA de A NO cambia (pura del
// reloj) y NI la banda NI el vínculo de B se tocan (contribución per-hero AISLADA, 0 contención). Corre AL FINAL porque abrir la 2ª página
// blurea la 1ª ⇒ index.html pausa el game-loop (footgun heredado de CAS-2313/2315).
//
// FOOTGUN LIVE PORTADO (byte-id OFF vía TOGGLE, mirror Standings CAS-2309 / issue CAS-2321): en DARK boot `gExists===false` porque
// tickFellowship jamás corrió; en LIVE DEFAULT-ON, al togglear enabled:false el tick puede haber dejado un frame G.fellowship TRANSITORIO
// ⇒ NO afirmar gExists false. La prueba byte-id correcta LIVE = enabled:false + save SIN clave 'fellowAt' + knob INERTE (fellowMulXp 0 +
// forged false + tag "") + worldFingerprint byte-estable a través del toggle.
//
// Checks:
//   1  boot LIMPIO LIVE + __dev.fellowship + arc hooks + __BUILD self-consistente vs version.json + 0 err / 0 non-favicon 404.
//   2  served sim/config.js: FELLOWSHIP_BOND.enabled:true SERVIDO + arco entero enabled:true (0 regr); DARK trío false.
//   3  DEFAULT-ON (la prueba LIVE): boot fresco 0 __dev flip ⇒ fellowship().enabled===true AND banda del reloj real (size miembros con nombre)
//      AND vínculo fresco (bond 0, forged false, tag "") — la capa social existe SIN tocar __dev, pura del reloj server-auth.
//   4  byte-id when OFF (toggle): fellowship({enabled:false}) ⇒ save SIN clave 'fellowAt' AND fellowMulXp 0 AND forged false AND tag ""
//      AND worldFingerprint byte-estable a través del toggle (NO se afirma gExists — frame transitorio LIVE); restaura ON.
//   5  BANDA determinista + convergencia 1-página: mismo nowMs ⇒ banda de `size` compañeros con nombre, IDÉNTICA en 2 lecturas (0 desync).
//   6  BANDA ROTA por semana: barriendo semanas ⇒ ≥2 bandas DISTINTAS (rotación determinista del roster, identidad social viva).
//   7  VÍNCULO deriva de kills: semana fresca ⇒ snapshot bond 0; kill 7 ⇒ bond == 7 (contador monótono h.kills, 0 tracking nuevo).
//   8  TIERS con nombre: bond 0→6→16 ⇒ Desconocido→Compañero→Jurado (progresión legible).
//   9  FORJAR gate + pasivo: bond<forge ⇒ forged false AND mul 0; bond≥forge ⇒ forged true AND fellowMulXp==0.10 (canal xpGain).
//  10  PASIVO efectivo en gainXP + KIND ÚNICO: served sim.js aplica fellowMul(h,"xpGain") en gainXP AND con TODO el arco ON el xpGainMul
//      forjado ≈ off×1.10 EXACTO (canal xpGain aislado de restedMult/restedXpMult/safeRegen ⇒ 0 doble-conteo).
//  11  byte-id pasivo OFF: enabled false aun con bond alto ⇒ forged false AND fellowMulXp 0 AND tag "" (gate ⇒ seam xpGain byte-id a HEAD).
//  12  render + nameplate ∞: render.js SERVIDO dibuja sim.wayfarerFellowship() ('Compañeros de Ruta') bajo gate FELLOWSHIP_BOND.enabled + glifo
//      ∞ via sim.fellowshipTag (autoritativo "" OFF / "∞" forjado ON) + screenshot del nameplate ∞ forjado.
//  13  arco regr full-stack con FELLOWSHIP ON (CONTEST+TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+SANCTUARY+WARHORN+EMISSARY+RECALL) + fps no-regr.
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE: 2 páginas, MISMO nowMs ⇒ BANDA (roster COMPARTIDO) IDÉNTICA byte-a-byte; A profundiza
//      vínculo (mata 40 ⇒ bond/∞/Jurado) ⇒ banda de A INTACTA (pura del reloj) AND banda+vínculo de B INTACTOS (per-hero aislado, 0 desync). (AL FINAL)
//   0  no JS errors + no non-favicon 404 durante toda la corrida.
//
// LIVE wiring (mirror CAS-2315): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded); favicon-404 filtrado;
// ambas páginas COMPARTEN origen localStorage ⇒ limpiar mithralda.* por página (bootea a 'menu' no 'resume'); 2ª página bringToFront.
// Run: node tools/cas2321-fellowship-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2321-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                  // SEMANAL (reloj propio de la Hermandad, INDEPENDIENTE del arco de Órdenes)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.fellowship && window.__dev.contest && window.__dev.territory && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.fellowship + arc hooks; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: FELLOWSHIP_BOND.enabled:true SERVIDO + arco entero true; DARKs false
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { FELLOWSHIP: en("FELLOWSHIP_BOND"), CONTEST: en("ORDER_CONTEST"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"),
      LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"),
      REP: en("SANCTUARY_REP"), BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"),
      TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"), BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const allArcTrue = ["CONTEST","TERRITORY","STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("2 served config: FELLOWSHIP_BOND.enabled:true SERVIDO + arco entero enabled:true (0 regr); DARK trío BOSS_RUSH/DOORS_INTERIORS/SEEDED_CHALLENGE false",
     cfg.FELLOWSHIP === "true" && allArcTrue && darksFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (la prueba LIVE): boot fresco 0 __dev flip ⇒ enabled true + banda del reloj real (size miembros) + vínculo fresco (bond 0/forged false/tag "")
  const dOn = await page.evaluate(() => {
    const f = window.__dev.fellowship();
    return { enabled: f.enabled, size: f.size, len: (f.band || []).length, named: (f.band || []).every(c => c && c.id && c.name),
      bond: f.bond, forged: f.forged, tag: f.tag };
  });
  ok("3 DEFAULT-ON desde config servido: fellowship().enabled===true AND banda del reloj real (size miembros con nombre) AND vínculo fresco (bond 0, forged false, tag \"\") — capa social SIN tocar __dev",
     dOn.enabled === true && dOn.len === dOn.size && dOn.len > 0 && dOn.named && dOn.bond === 0 && dOn.forged === false && dOn.tag === "", JSON.stringify(dOn));

  // 4 byte-id when OFF (toggle): enabled:false ⇒ save sin 'fellowAt' + knob inerte + fp byte-stable; restaura ON. NO se afirma gExists (frame transitorio LIVE).
  const off = await page.evaluate(() => {
    const fpOn = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.fellowship({ enabled: false });
    const d = window.__dev.fellowship();
    const save = JSON.stringify(window.__dev.saveBlob());
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.fellowship({ enabled: false });
    const fpOff2 = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.fellowship({ enabled: true });                                 // restaura ON
    return { enabled: d.enabled, forged: d.forged, mul: d.fellowMulXp, tag: d.tag,
      noKey: !/"fellowAt"/.test(save), fpStable: fpOn === fpOff && fpOff === fpOff2 };
  });
  ok("4 byte-id when OFF (toggle): enabled:false ⇒ saveBlob() SIN clave 'fellowAt' AND fellowMulXp 0 AND forged false AND tag \"\" AND worldFingerprint byte-estable a través del toggle (NO se afirma gExists — frame transitorio LIVE); restaura ON",
     off.enabled === false && off.forged === false && off.mul === 0 && off.tag === "" && off.noKey === true && off.fpStable === true, JSON.stringify(off));

  // 5 BANDA determinista + convergencia 1-página: same nowMs ⇒ size miembros, IDÉNTICA en 2 lecturas
  const band = await page.evaluate((T) => {
    window.__dev.fellowship({ enabled: true });
    const a = window.__dev.fellowship({ nowMs: T });
    const b = window.__dev.fellowship({ nowMs: T });
    return { size: a.size, len: a.band.length, ja: JSON.stringify(a.band), jb: JSON.stringify(b.band), named: a.band.every(c => c && c.id && c.name) };
  }, wk(5000, 0.40));
  ok("5 BANDA determinista + convergencia: mismo nowMs ⇒ banda de `size` compañeros con nombre, IDÉNTICA en 2 lecturas (0 desync)",
     band.len === band.size && band.len > 0 && band.ja === band.jb && band.named, `size=${band.size} band=${band.ja}`);

  // 6 BANDA ROTA por semana: barriendo semanas ⇒ ≥2 bandas distintas
  const rot = await page.evaluate((PM) => {
    window.__dev.fellowship({ enabled: true });
    const sigs = new Set();
    for (let w = 5000; w < 5060; w++) { const nm = w * PM + Math.floor(PM * 0.40);
      const f = window.__dev.fellowship({ nowMs: nm });
      sigs.add((f.band || []).map(c => c.id).join(",")); }
    return { distinct: sigs.size, sample: [...sigs].slice(0, 4) };
  }, PERIOD_MS);
  ok("6 BANDA ROTA por semana: ≥2 bandas DISTINTAS al barrer semanas (rotación determinista del roster, identidad social viva)",
     rot.distinct >= 2, `distinct=${rot.distinct} sample=${JSON.stringify(rot.sample)}`);

  // 7 VÍNCULO deriva de kills: semana fresca ⇒ snapshot bond 0; kill n ⇒ bond n
  const bond = await page.evaluate((PM) => {
    const T = 6000 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: true });
    window.__dev.fellowship({ nowMs: T });
    const before = window.__dev.fellowship().bond;
    window.__dev.fellowship({ kill: { n: 7 } });
    const after = window.__dev.fellowship().bond;
    return { before, after };
  }, PERIOD_MS);
  ok("7 VÍNCULO deriva de kills: semana fresca ⇒ snapshot bond 0; kill 7 ⇒ bond == 7 (contador monótono h.kills, 0 tracking nuevo)",
     bond.before === 0 && bond.after === 7, JSON.stringify(bond));

  // 8 TIERS con nombre
  const tiers = await page.evaluate((PM) => {
    const T = 6010 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: true });
    window.__dev.fellowship({ nowMs: T });
    const t0 = window.__dev.fellowship().tierName;
    window.__dev.fellowship({ kill: { n: 6 } });
    const t1 = window.__dev.fellowship().tierName;
    window.__dev.fellowship({ kill: { n: 10 } });
    const t2 = window.__dev.fellowship().tierName;
    return { t0, t1, t2 };
  }, PERIOD_MS);
  ok("8 TIERS con nombre: bond 0→6→16 ⇒ Desconocido→Compañero→Jurado (progresión legible)",
     tiers.t0 === "Desconocido" && tiers.t1 === "Compañero" && tiers.t2 === "Jurado", JSON.stringify(tiers));

  // 9 FORJAR gate + pasivo
  const forge = await page.evaluate((PM) => {
    const T = 6020 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: true });
    window.__dev.fellowship({ nowMs: T });
    window.__dev.fellowship({ kill: { n: 5 } });                                // bond 5 < forge(6)
    const below = window.__dev.fellowship();
    window.__dev.fellowship({ kill: { n: 1 } });                                // bond 6 == forge
    const at = window.__dev.fellowship();
    return { belowForged: below.forged, belowMul: below.fellowMulXp, atForged: at.forged, atMul: at.fellowMulXp };
  }, PERIOD_MS);
  ok("9 FORJAR gate + pasivo: bond<forge ⇒ forged false AND mul 0; bond≥forge ⇒ forged true AND fellowMulXp==0.10 (canal xpGain)",
     forge.belowForged === false && forge.belowMul === 0 && forge.atForged === true && near(forge.atMul, 0.10), JSON.stringify(forge));

  // 10 PASIVO efectivo en gainXP + KIND ÚNICO: served seam + con TODO el arco ON xpGainMul forjado ≈ off×1.10 EXACTO (0 doble-conteo)
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js", { cache: "no-store" }); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /fellowMul\(h,\s*"xpGain"\)/.test(simSrc);
  const xpMul = await page.evaluate((PM) => {
    const T = 6030 * PM + Math.floor(PM * 0.40);
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true });
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T });
    const off = window.__dev.fellowship().xpGainMul;                            // bond 0 ⇒ sin pasivo
    window.__dev.fellowship({ kill: { n: 20 } });
    const on = window.__dev.fellowship().xpGainMul;                             // forjado ⇒ ×1.10 EXACTO
    return { off, on };
  }, PERIOD_MS);
  ok("10 PASIVO efectivo en gainXP + KIND ÚNICO: served sim.js aplica fellowMul(h,'xpGain') en gainXP AND con TODO el arco ON xpGainMul forjado ≈ off×1.10 EXACTO (canal xpGain aislado, 0 doble-conteo)",
     seamWired && near(xpMul.on, xpMul.off * 1.10, 1e-4), `wired=${seamWired} ${JSON.stringify(xpMul)}`);

  // 11 byte-id pasivo OFF: enabled false aun con bond alto ⇒ forged false AND mul 0 AND tag ""
  const passiveOff = await page.evaluate(() => {
    window.__dev.fellowship({ enabled: false });
    const f = window.__dev.fellowship();
    return { enabled: f.enabled, forged: f.forged, mul: f.fellowMulXp, tag: f.tag };
  });
  ok("11 byte-id pasivo OFF: enabled false (aun con bond alto) ⇒ forged false AND fellowMulXp 0 AND tag \"\" (gate ⇒ seam xpGain byte-id a HEAD)",
     passiveOff.enabled === false && passiveOff.forged === false && passiveOff.mul === 0 && passiveOff.tag === "", JSON.stringify(passiveOff));

  // 12 render + nameplate ∞: served render.js gated draw + fellowshipTag authority + screenshot
  const rsrc = await page.evaluate(async () => { const r = await fetch("render/render.js", { cache: "no-store" }); return await r.text(); });
  const gatedDraw = /FELLOWSHIP_BOND\.enabled/.test(rsrc) && /sim\.wayfarerFellowship\(/.test(rsrc) && /Compañeros de Ruta/.test(rsrc) && /sim\.fellowshipTag\(/.test(rsrc) && /∞/.test(rsrc);
  const tagAuth = await page.evaluate((PM) => {
    const T = 6040 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: false }); window.__dev.fellowship({ nowMs: T });
    const off = window.__dev.fellowship().tag;                                  // OFF ⇒ ""
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T }); window.__dev.fellowship({ kill: { n: 20 } });
    const on = window.__dev.fellowship().tag;                                   // forjado ⇒ "∞"
    return { off, on };
  }, PERIOD_MS);
  const T12 = 6040 * PERIOD_MS + Math.floor(PERIOD_MS * 0.40);
  await page.evaluate((nm) => {                                                 // pin Date.now ⇒ tickFellowship no re-snapshotea al render ⇒ ∞ persiste
    window.__t12 = Date.now; Date.now = () => nm;
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: nm });
    window.__dev.fellowship({ kill: { n: 20 } });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
  }, T12);
  await sleep(200);
  const forgedNow = await page.evaluate(() => window.__dev.fellowship().forged);
  try { await page.screenshot({ path: join(OUT, "nameplate-bond.png"), clip: { x: 520, y: 220, width: 260, height: 200 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__t12) { Date.now = window.__t12; delete window.__t12; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("12 render + nameplate: render.js servido dibuja wayfarerFellowship() ('Compañeros de Ruta') gated FELLOWSHIP_BOND.enabled + glifo ∞ via fellowshipTag; tag \"\" OFF / \"∞\" forjado ON",
     gatedDraw && tagAuth.off === "" && tagAuth.on === "∞" && forgedNow === true, `gatedDraw=${gatedDraw} tagOff="${tagAuth.off}" tagOn="${tagAuth.on}" forgedNow=${forgedNow}`);

  // 13 arc regression + fps no-regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.fellowship({ enabled: true });
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const f = window.__dev.fellowship(); const c = window.__dev.contest(); const te = window.__dev.territory(); const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { fellowOk: f.enabled, contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.fellowship({ enabled: on }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const o = await sample(false); const n = await sample(true);
    return { off: o, on: n };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("13 arco regr con FELLOWSHIP ON (CONTEST+TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+SANCTUARY+WARHORN+EMISSARY+RECALL sanos) + fps no-regresión (mediana-de-5, ON ≥ OFF*0.9)",
     arc.fellowOk && arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk && onM >= offM * 0.9,
     `arc=${JSON.stringify(arc)} fps on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  await page.screenshot({ path: join(OUT, "observable.png") });

  // 14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (corre AL FINAL: abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur del game-loop).
  const T_NS = 7000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.40);                 // semana fresca compartida por ambos clientes
  const pageA = page;                                                          // cliente A ya en play
  const pageB = await freshPage(browser, errors, net404);                      // 2ª página foreground (bringToFront) ⇒ boot fiable
  await toHub(pageB);
  const readClient = async (p) => p.evaluate((nm) => {
    window.__dev.fellowship({ enabled: true });
    const f = window.__dev.fellowship({ nowMs: nm });                          // snapshot semana fresca ⇒ bond 0 para AMBOS
    return { band: JSON.stringify(f.band), bond: f.bond, forged: f.forged, tag: f.tag, tierName: f.tierName };
  }, T_NS);
  const a0 = await readClient(pageA);
  const b0 = await readClient(pageB);
  // Cliente A profundiza su vínculo PERSONAL (mata 40) ⇒ NO debe mover NI la banda de A (pura del reloj) NI la banda/vínculo de B (per-hero aislado)
  await pageA.evaluate(() => { window.__dev.fellowship({ kill: { n: 40 } }); });
  const a1 = await pageA.evaluate((nm) => { const f = window.__dev.fellowship({ nowMs: nm }); return { band: JSON.stringify(f.band), bond: f.bond, forged: f.forged, tag: f.tag, tierName: f.tierName }; }, T_NS);
  const b1 = await pageB.evaluate((nm) => { const f = window.__dev.fellowship({ nowMs: nm }); return { band: JSON.stringify(f.band), bond: f.bond, forged: f.forged, tag: f.tag }; }, T_NS);
  const bandShared = a0.band === b0.band && a0.band.length > 2;                 // BANDA (roster) COMPARTIDA idéntica byte-a-byte
  const bondPersonal0 = a0.bond === 0 && b0.bond === 0;                         // vínculo PERSONAL arranca en 0 para ambos (semana fresca)
  const aDeepened = a1.bond === 40 && a1.forged === true && a1.tag === "∞" && a1.tierName === "Jurado"; // A profundizó su vínculo
  const aBandIntact = a1.band === a0.band;                                      // la BANDA de A NO cambió (pura del reloj, no del vínculo)
  const bIntact = b1.band === b0.band && b1.bond === 0 && b1.forged === false && b1.tag === ""; // B intacto
  try { await pageB.screenshot({ path: join(OUT, "client-b.png") }); } catch (e) {}
  await pageB.close();
  ok("14 ★ NORTH STAR CONVERGENCIA 2-CLIENTE REAL LIVE: 2 páginas, MISMO nowMs ⇒ BANDA (roster COMPARTIDO) IDÉNTICA byte-a-byte; A profundiza vínculo (mata 40 ⇒ bond/∞/Jurado) ⇒ banda de A INTACTA (pura del reloj) AND banda+vínculo de B INTACTOS (per-hero aislado, 0 desync)",
     bandShared && bondPersonal0 && aDeepened && aBandIntact && bIntact,
     `bandShared=${bandShared} bondPersonal0=${bondPersonal0} aDeepened=${aDeepened} aBandIntact=${aBandIntact} bIntact=${bIntact} A0=${JSON.stringify(a0)} B0=${JSON.stringify(b0)} A1=${JSON.stringify(a1)} B1=${JSON.stringify(b1)}`);

  await pageA.bringToFront();
  await pageA.evaluate(() => window.__dev.fellowship({ enabled: true }));
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors + no non-favicon 404 during run", errors.length === 0 && net404.length === 0, [...errors.slice(0, 3), ...net404.slice(0, 3)].join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)  build LIVE vs ${LIVE}`);
process.exit(FAIL ? 1 : 0);
