// CAS-2316 — QA OBSERVABLE verify for COMPAÑEROS DE RUTA / WAYFARERS' FELLOWSHIP (DARK, FELLOWSHIP_BOND.enabled:false).
// QA pass sobre el DARK build del GE (commit 412b345, self-verify 17/17). Re-verifica byte-id OFF de forma INDEPENDIENTE y AÑADE el
// diferenciador QA que el issue exige como MMORPG: la capa social es a la vez COMPARTIDA y PERSONAL — ¿qué separa lo uno de lo otro
// cuando DOS jugadores del shard comparten reloj pero forjan vínculos distintos?
//
// North Star (check 12, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores"),
// MISMO reloj lógico (nowMs) ⇒ la BANDA semanal (roster COMPARTIDO, pura del reloj) es IDÉNTICA byte-a-byte en ambos (0 desync), mientras
// que el VÍNCULO es PERSONAL: el cliente A profundiza su vínculo (mata 40) ⇒ su bond/tier/glifo suben, pero la BANDA de A NO cambia (pura del
// reloj) y NI la banda NI el vínculo de B se tocan (contribución per-hero AISLADA, 0 contención). Corre AL FINAL porque abrir la 2ª página
// blurea la 1ª ⇒ index.html pausa el game-loop de la 1ª (footgun heredado de CAS-2300/2310/2313).
//
// Checks:
//   1  boots to play, __dev.fellowship + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (re-verify GE INDEP): enabled false + forged false + fellowMulXp 0 + band [] + save SIN clave 'fellowAt' + hasField false
//      + gExists false + worldFingerprint byte-estable a través del toggle enabled (0 RNG drift, 0 estado nuevo).
//   3  BANDA determinista + convergencia 1-página: mismo nowMs ⇒ banda de `size` miembros del roster, IDÉNTICA en 2 lecturas (0 desync).
//   4  BANDA ROTA por semana: barriendo semanas surgen ≥2 bandas DISTINTAS (identidad social viva, rotación determinista del roster).
//   5  VÍNCULO deriva de kills: semana fresca ⇒ snapshot bond 0; kill n ⇒ bond == n*bondPerKill (contador monótono `h.kills`, 0 tracking nuevo).
//   6  TIERS con nombre: bond 0→forge→forge+10 ⇒ Desconocido→Compañero→Jurado (progresión legible).
//   7  FORJAR gate + pasivo: bond<forge ⇒ forged false AND mul 0; bond≥forge ⇒ forged true AND fellowMulXp==0.10 (canal xpGain).
//   8  PASIVO efectivo en gainXP + KIND ÚNICO: served sim.js aplica fellowMul(h,"xpGain") en gainXP; con TODO el arco ON el xpGainMul forjado
//      ≈ off×1.10 EXACTO (canal xpGain aislado de restedMult/restedXpMult/safeRegen ⇒ 0 doble-conteo con oath/ledger/standings/territory).
//   9  byte-id pasivo OFF: enabled false aun con bond alto ⇒ forged false AND fellowMulXp 0 (gate ⇒ seam xpGain byte-id a HEAD).
//  10  render + nameplate: render.js SERVIDO dibuja sim.wayfarerFellowship() ('Compañeros de Ruta') bajo gate FELLOWSHIP_BOND.enabled + glifo
//      ∞ via sim.fellowshipTag (autoritativo "" OFF / "∞" forjado ON). (+screenshot del nameplate ∞ forjado como evidencia.)
//  11  arco regr con FELLOWSHIP ON: CONTEST+TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REWARDS+WORLD_EVENT+EMISSARY+RECALL sanos + fps no-regresión.
//  12  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO nowMs ⇒ BANDA (roster COMPARTIDO) IDÉNTICA byte-a-byte; A profundiza
//      vínculo (mata 40 ⇒ bond/tier/∞ suben) ⇒ banda de A INTACTA (pura del reloj) AND banda+vínculo de B INTACTOS (per-hero aislado, 0 desync).
//   0  no JS errors during run.
// Run: node tools/cas2316-fellowship-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2316-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                  // SEMANAL (reloj propio de la Hermandad, INDEPENDIENTE del arco de Órdenes)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.fellowship && window.__dev.contest && window.__dev.territory && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.fellowship + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF (re-verify GE INDEP): FRESH-BOOT snapshot (SIN nowMs) ⇒ gExists false (tickFellowship jamás corrió en DARK boot) +
  //    hasField false + save sin 'fellowAt' + fingerprint byte-estable a través del toggle. (Nota: inyectar nowMs por el dev-hook crea
  //    G.fellowship TRANSITORIO aun con enabled:false — artefacto del hook, NO estado de boot; por eso gExists se lee ANTES de inyectar reloj.)
  const off = await page.evaluate(() => {
    const d = window.__dev.fellowship();                                        // FRESH boot, SIN nowMs ⇒ estado DARK real
    const save = JSON.stringify(window.__dev.saveBlob());
    const fpA = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.fellowship({ enabled: true }); const fpOn = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.fellowship({ enabled: false }); const fpB = JSON.stringify(window.__dev.worldFingerprint(777));
    return { enabled: d.enabled, forged: d.forged, mul: d.fellowMulXp, band: d.band, tag: d.tag,
      hasField: d.hasField, gExists: d.gExists, hasKey: /"fellowAt"/.test(save), fpStable: fpA === fpB && fpA === fpOn };
  });
  ok("2 byte-id OFF: FRESH boot ⇒ enabled false + forged false + fellowMulXp 0 + band [] + tag \"\" + save SIN 'fellowAt' + hasField false + gExists false (tick jamás corrió) + fingerprint byte-estable a través del toggle",
     off.enabled === false && off.forged === false && off.mul === 0 && Array.isArray(off.band) && off.band.length === 0 && off.tag === "" &&
     off.hasKey === false && off.hasField === false && off.gExists === false && off.fpStable === true,
     `enabled=${off.enabled} forged=${off.forged} mul=${off.mul} band=${JSON.stringify(off.band)} tag="${off.tag}" hasKey=${off.hasKey} hasField=${off.hasField} gExists=${off.gExists} fpStable=${off.fpStable}`);

  // 3 BANDA determinista + convergencia 1-página: same nowMs ⇒ size miembros, IDÉNTICA en 2 lecturas
  const band = await page.evaluate((T) => {
    window.__dev.fellowship({ enabled: true });
    const a = window.__dev.fellowship({ nowMs: T });
    const b = window.__dev.fellowship({ nowMs: T });
    return { size: a.size, len: a.band.length, ja: JSON.stringify(a.band), jb: JSON.stringify(b.band), named: a.band.every(c => c && c.id && c.name) };
  }, wk(5000, 0.40));
  ok("3 BANDA determinista + convergencia: mismo nowMs ⇒ banda de `size` compañeros con nombre, IDÉNTICA en 2 lecturas (0 desync)",
     band.len === band.size && band.len > 0 && band.ja === band.jb && band.named, `size=${band.size} band=${band.ja}`);

  // 4 BANDA ROTA por semana: barriendo semanas ⇒ ≥2 bandas distintas
  const rot = await page.evaluate((PM) => {
    window.__dev.fellowship({ enabled: true });
    const sigs = new Set();
    for (let w = 5000; w < 5060; w++) { const nm = w * PM + Math.floor(PM * 0.40);
      const f = window.__dev.fellowship({ nowMs: nm });
      sigs.add((f.band || []).map(c => c.id).join(",")); }
    return { distinct: sigs.size, sample: [...sigs].slice(0, 4) };
  }, PERIOD_MS);
  ok("4 BANDA ROTA por semana: ≥2 bandas DISTINTAS al barrer semanas (rotación determinista del roster, identidad social viva)",
     rot.distinct >= 2, `distinct=${rot.distinct} sample=${JSON.stringify(rot.sample)}`);

  // 5 VÍNCULO deriva de kills: semana fresca ⇒ snapshot bond 0; kill n ⇒ bond n
  const bond = await page.evaluate((PM) => {
    const T = 6000 * PM + Math.floor(PM * 0.40);                                // semana fresca ⇒ killBase = kills actuales ⇒ bond arranca en 0
    window.__dev.fellowship({ enabled: true });
    window.__dev.fellowship({ nowMs: T });
    const before = window.__dev.fellowship().bond;
    window.__dev.fellowship({ kill: { n: 7 } });
    const after = window.__dev.fellowship().bond;
    return { before, after, bondValue: window.__dev.fellowship().bondValue };
  }, PERIOD_MS);
  ok("5 VÍNCULO deriva de kills: semana fresca ⇒ snapshot bond 0; kill 7 ⇒ bond == 7 (contador monótono h.kills, 0 tracking nuevo)",
     bond.before === 0 && bond.after === 7, JSON.stringify(bond));

  // 6 TIERS con nombre
  const tiers = await page.evaluate((PM) => {
    const T = 6010 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: true });
    window.__dev.fellowship({ nowMs: T });
    const t0 = window.__dev.fellowship().tierName;                              // bond 0 ⇒ Desconocido
    window.__dev.fellowship({ kill: { n: 6 } });
    const t1 = window.__dev.fellowship().tierName;                              // bond 6 ⇒ Compañero
    window.__dev.fellowship({ kill: { n: 10 } });
    const t2 = window.__dev.fellowship().tierName;                              // bond 16 ⇒ Jurado
    return { t0, t1, t2 };
  }, PERIOD_MS);
  ok("6 TIERS con nombre: bond 0→6→16 ⇒ Desconocido→Compañero→Jurado (progresión legible)",
     tiers.t0 === "Desconocido" && tiers.t1 === "Compañero" && tiers.t2 === "Jurado", JSON.stringify(tiers));

  // 7 FORJAR gate + pasivo
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
  ok("7 FORJAR gate + pasivo: bond<forge ⇒ forged false AND mul 0; bond≥forge ⇒ forged true AND fellowMulXp==0.10 (canal xpGain)",
     forge.belowForged === false && forge.belowMul === 0 && forge.atForged === true && near(forge.atMul, 0.10), JSON.stringify(forge));

  // 8 PASIVO efectivo en gainXP + KIND ÚNICO: served seam + con TODO el arco ON xpGainMul forjado ≈ off×1.10 EXACTO (0 doble-conteo)
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /fellowMul\(h,\s*"xpGain"\)/.test(simSrc);
  const xpMul = await page.evaluate((PM) => {
    const T = 6030 * PM + Math.floor(PM * 0.40);
    // TODO el arco de Órdenes ON ⇒ prueba que el canal xpGain está AISLADO (no colisiona con restedMult/restedXpMult/safeRegen)
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true });
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T });
    const off = window.__dev.fellowship().xpGainMul;                            // bond 0 ⇒ sin pasivo
    window.__dev.fellowship({ kill: { n: 20 } });
    const on = window.__dev.fellowship().xpGainMul;                             // forjado ⇒ ×1.10 EXACTO sobre el mult base
    return { off, on };
  }, PERIOD_MS);
  ok("8 PASIVO efectivo en gainXP + KIND ÚNICO: served sim.js aplica fellowMul(h,'xpGain') en gainXP AND con TODO el arco ON xpGainMul forjado ≈ off×1.10 EXACTO (canal xpGain aislado, 0 doble-conteo)",
     seamWired && near(xpMul.on, xpMul.off * 1.10, 1e-4), `wired=${seamWired} ${JSON.stringify(xpMul)}`);

  // 9 byte-id pasivo OFF: enabled false aun con bond alto ⇒ forged false AND mul 0
  const passiveOff = await page.evaluate(() => {
    window.__dev.fellowship({ enabled: false });                               // bond alto persiste en h.kills, pero el gate lo apaga
    const f = window.__dev.fellowship();
    return { enabled: f.enabled, forged: f.forged, mul: f.fellowMulXp, tag: f.tag };
  });
  ok("9 byte-id pasivo OFF: enabled false (aun con bond alto) ⇒ forged false AND fellowMulXp 0 AND tag \"\" (gate ⇒ seam xpGain byte-id a HEAD)",
     passiveOff.enabled === false && passiveOff.forged === false && passiveOff.mul === 0 && passiveOff.tag === "", JSON.stringify(passiveOff));

  // 10 render + nameplate ∞: served render.js gated draw + fellowshipTag authority + screenshot
  const rsrc = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /FELLOWSHIP_BOND\.enabled/.test(rsrc) && /sim\.wayfarerFellowship\(/.test(rsrc) && /Compañeros de Ruta/.test(rsrc) && /sim\.fellowshipTag\(/.test(rsrc) && /∞/.test(rsrc);
  const tagAuth = await page.evaluate((PM) => {
    const T = 6040 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: false }); window.__dev.fellowship({ nowMs: T });
    const off = window.__dev.fellowship().tag;                                  // OFF ⇒ "" (glifo del sim SERVIDO)
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T }); window.__dev.fellowship({ kill: { n: 20 } });
    const on = window.__dev.fellowship().tag;                                   // forjado ⇒ "∞"
    return { off, on };
  }, PERIOD_MS);
  const T10 = 6040 * PERIOD_MS + Math.floor(PERIOD_MS * 0.40);
  await page.evaluate((nm) => {                                                 // pin Date.now ⇒ tickFellowship no re-snapshotea al render ⇒ ∞ persiste
    window.__t10 = Date.now; Date.now = () => nm;
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: nm });
    window.__dev.fellowship({ kill: { n: 20 } });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
  }, T10);
  await sleep(200);
  const forgedNow = await page.evaluate(() => window.__dev.fellowship().forged);
  try { await page.screenshot({ path: join(OUT, "nameplate-bond.png"), clip: { x: 520, y: 220, width: 260, height: 200 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__t10) { Date.now = window.__t10; delete window.__t10; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("10 render + nameplate: render.js servido dibuja wayfarerFellowship() ('Compañeros de Ruta') gated FELLOWSHIP_BOND.enabled + glifo ∞ via fellowshipTag; tag \"\" OFF / \"∞\" forjado ON",
     gatedDraw && tagAuth.off === "" && tagAuth.on === "∞" && forgedNow === true, `gatedDraw=${gatedDraw} tagOff="${tagAuth.off}" tagOn="${tagAuth.on}" forgedNow=${forgedNow}`);

  // 11 arc regression + fps no-regression
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
  ok("11 arco regr con FELLOWSHIP ON (CONTEST+TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REWARDS+WORLD_EVENT+EMISSARY+RECALL sanos) + fps no-regresión (mediana-de-5, ON ≥ OFF*0.9)",
     arc.fellowOk && arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk && onM >= offM * 0.9,
     `arc=${JSON.stringify(arc)} fps on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  // 12 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL (corre AL FINAL: abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur del game-loop).
  const T_NS = 7000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.40);                 // semana fresca compartida por ambos clientes
  const pageA = page;                                                          // cliente A ya en play
  const errB = [];
  const pageB = await freshPage(browser, base, errB);                          // 2ª página foreground (bringToFront) ⇒ boot fiable
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
  const bIntact = b1.band === b0.band && b1.bond === 0 && b1.forged === false && b1.tag === ""; // B intacto: A matar NO tocó ni banda ni vínculo de B
  try { await pageB.screenshot({ path: join(OUT, "client-b.png") }); } catch (e) {}
  await pageB.close();
  ok("12 ★ NORTH STAR CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO nowMs ⇒ BANDA (roster COMPARTIDO) IDÉNTICA byte-a-byte; A profundiza vínculo (mata 40 ⇒ bond/∞/Jurado) ⇒ banda de A INTACTA (pura del reloj) AND banda+vínculo de B INTACTOS (per-hero aislado, 0 desync)",
     bandShared && bondPersonal0 && aDeepened && aBandIntact && bIntact && errB.length === 0,
     `bandShared=${bandShared} bondPersonal0=${bondPersonal0} aDeepened=${aDeepened} aBandIntact=${aBandIntact} bIntact=${bIntact} A0=${JSON.stringify(a0)} B0=${JSON.stringify(b0)} A1=${JSON.stringify(a1)} B1=${JSON.stringify(b1)} errB=${errB.length}`);

  await page.bringToFront();
  await page.evaluate(() => window.__dev.fellowship({ enabled: false }));
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
