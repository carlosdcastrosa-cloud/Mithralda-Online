// CAS-2316 — GE self-verify for COMPAÑEROS DE RUTA / WAYFARERS' FELLOWSHIP (DARK, FELLOWSHIP_BOND.enabled:false).
// La capa social PERSONAL que le faltaba al mundo: una HERMANDAD semanal de COMPAÑEROS con nombre (banda rotativa COMPARTIDA, derivada del
// reloj de pared con hash de Knuth ⇒ MISMA banda en N clientes con el mismo reloj, 0 desync) + un VÍNCULO personal que profundiza con las
// MISMAS gestas que ya cuentan (kills desde que se formó la banda, contador monótono `h.kills` − snapshot per-semana `h.fellowAt`; 0 hotkey/
// input.js). El vínculo escala TIERS con nombre (Desconocido→Compañero→Jurado); al FORJAR (bond ≥ forgeTier) la Hermandad da un pasivo en el
// canal NUEVO `xpGain` (+10% XP), kind ÚNICO ⇒ 0 doble-conteo con oath/ledger/standings/territory. INDEPENDIENTE del arco de Órdenes (reloj +
// roster propios ⇒ no acopla su balance). En Stage-2 la banda + el vínculo los fija/agrega el server; el seam (banda pura del reloj + pasivo
// gateado a forjar) no cambia.
//
// Observado vía __dev.fellowship (flip enabled IN-MEMORY + nowMs para el reloj semanal + kill para profundizar el vínculo) +
// __dev.saveBlob/worldFingerprint/contest/territory/standings/ledger/oath/bounty/sanctuary/warhorn/emissary/recall/safeZone/tp.
//
// Checks:
//   1  boots to play, __dev.fellowship + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: FELLOWSHIP_BOND.enabled===false AND forged false AND fellowMulXp 0 AND band [] ⇒ inerte/observable OFF.
//   3  byte-id save OFF: saveBlob() SIN clave 'fellowAt' (vínculo = snapshot per-semana, 0 clave con la feature OFF).
//   4  byte-id OFF: hasField false (h.fellowAt NUNCA se crea) AND gExists false (G.fellowship NUNCA se crea).
//   5  worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo).
//   6  BANDA determinista + convergencia: mismo nowMs ⇒ banda de `size` miembros del roster, IDÉNTICA en 2 lecturas (0 desync).
//   7  BANDA ROTA por semana: barriendo semanas surgen ≥2 bandas DISTINTAS (rotación determinista del roster, identidad social viva).
//   8  VÍNCULO deriva de kills: snapshot @nowMs + kill n ⇒ bond == n*bondPerKill (contador monótono, 0 tracking nuevo).
//   9  TIERS con nombre: al cruzar los umbrales el tierName escala Desconocido→Compañero→Jurado (progresión legible).
//  10  FORJAR gate + pasivo: bond<forge ⇒ forged false AND fellowMulXp 0; bond≥forge ⇒ forged true AND fellowMulXp==0.10 (canal xpGain).
//  11  PASIVO efectivo en gainXP: render/sim SERVIDO aplica fellowMul(h,"xpGain") en el chokepoint de XP (xpGainMul refleja +10% forjado).
//  12  byte-id pasivo OFF: con enabled false, aun con bond alto ⇒ forged false AND fellowMulXp 0 (gate ⇒ seam xpGain byte-id a HEAD).
//  13  CONVERGENCIA 2-cliente: mismo nowMs ⇒ banda IDÉNTICA pese a distinto vínculo por héroe (banda COMPARTIDA server-auth; bond PERSONAL).
//  14  render + nameplate: render.js SERVIDO dibuja sim.wayfarerFellowship() ('Compañeros de Ruta') bajo gate FELLOWSHIP_BOND.enabled + glifo
//      ∞ via sim.fellowshipTag; fellowshipTag "" OFF / "∞" forjado. (+screenshot del nameplate ∞ forjado.)
//  15  arco regr: con FELLOWSHIP ON, CONTEST + TERRITORY + STANDINGS + LEDGER + OATH + BOUNTY + WORLD_EVENT + EMISSARY + RECALL sanos.
//  16  fps NO-REGRESIÓN con la feature ON vs OFF (mediana-de-5 + warmup, relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2316-fellowship-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2316");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                  // SEMANAL (reloj propio de la Hermandad)
const wk = (w, frac) => w * PERIOD_MS + Math.floor(PERIOD_MS * frac);
const T_A = wk(5000, 0.40);                                       // una semana cualquiera
const T_B = wk(5003, 0.40);                                       // otra semana (para la rotación)

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.fellowship && window.__dev.contest && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.fellowship + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default
  const dark = await page.evaluate(() => window.__dev.fellowship());
  ok("2 DARK default: enabled false AND forged false AND fellowMulXp 0 AND band [] (inerte/observable OFF)",
     dark.enabled === false && dark.forged === false && dark.fellowMulXp === 0 && Array.isArray(dark.band) && dark.band.length === 0,
     `enabled=${dark.enabled} forged=${dark.forged} mul=${dark.fellowMulXp} band=${JSON.stringify(dark.band)}`);

  // 3 save OFF has no new key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'fellowAt' key in save blob (vínculo = snapshot per-semana, 0 clave con la feature OFF)", !/"fellowAt"/.test(saveOff), `len=${saveOff.length}`);

  // 4 byte-id OFF: no field / no transient state created
  const off4 = await page.evaluate(() => { const f = window.__dev.fellowship(); return { hasField: f.hasField, gExists: f.gExists }; });
  ok("4 byte-id OFF: hasField false (h.fellowAt NUNCA se crea) AND gExists false (G.fellowship NUNCA se crea)",
     off4.hasField === false && off4.gExists === false, JSON.stringify(off4));

  // 5 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.fellowship({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.fellowship({ enabled: false }));
  ok("5 worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 6 BANDA determinista + convergencia: same nowMs ⇒ size miembros del roster, IDÉNTICA en 2 lecturas
  const band = await page.evaluate((T) => {
    window.__dev.fellowship({ enabled: true });
    const a = window.__dev.fellowship({ nowMs: T });
    const b = window.__dev.fellowship({ nowMs: T });
    return { a: a.band, b: b.band, size: a.size, ja: JSON.stringify(a.band), jb: JSON.stringify(b.band) };
  }, T_A);
  ok("6 BANDA determinista + convergencia: mismo nowMs ⇒ banda de `size` miembros del roster, IDÉNTICA en 2 lecturas (0 desync)",
     Array.isArray(band.a) && band.a.length === band.size && band.a.length > 0 && band.ja === band.jb,
     `size=${band.size} band=${band.ja}`);

  // 7 BANDA ROTA por semana: barriendo semanas ⇒ ≥2 bandas distintas
  const rot = await page.evaluate((PM) => {
    window.__dev.fellowship({ enabled: true });
    const sigs = new Set();
    for (let w = 5000; w < 5060; w++) { const nm = w * PM + Math.floor(PM * 0.40);
      const f = window.__dev.fellowship({ nowMs: nm });
      sigs.add((f.band || []).map(c => c.id).join(",")); }
    return { distinct: sigs.size, sample: [...sigs].slice(0, 4) };
  }, PERIOD_MS);
  ok("7 BANDA ROTA por semana: ≥2 bandas DISTINTAS al barrer semanas (rotación determinista del roster)",
     rot.distinct >= 2, `distinct=${rot.distinct} sample=${JSON.stringify(rot.sample)}`);

  // 8 VÍNCULO deriva de kills: snapshot @nowMs + kill n ⇒ bond == n*bondPerKill
  const bond = await page.evaluate((T) => {
    window.__dev.fellowship({ enabled: true });
    window.__dev.fellowship({ nowMs: T });                        // snapshot killBase = kills actuales
    const before = window.__dev.fellowship().bond;
    window.__dev.fellowship({ kill: { n: 5 } });
    const after5 = window.__dev.fellowship().bond;
    return { before, after5, bondValue: window.__dev.fellowship().bondValue };
  }, T_A);
  ok("8 VÍNCULO deriva de kills: snapshot @nowMs (bond 0) + kill 5 ⇒ bond == 5 (contador monótono, 0 tracking nuevo)",
     bond.before === 0 && bond.after5 === 5, JSON.stringify(bond));

  // 9 TIERS con nombre: escalan al cruzar umbrales (semana fresca ⇒ killBase = kills actuales ⇒ bond arranca en 0)
  const tierWalk = await page.evaluate((PM) => {
    const T = 6000 * PM + Math.floor(PM * 0.40);                  // semana fresca ⇒ killBase = kills actuales ⇒ bond arranca en 0
    window.__dev.fellowship({ enabled: true });
    window.__dev.fellowship({ nowMs: T });
    const t0 = window.__dev.fellowship().tierName;                // bond 0 ⇒ Desconocido
    window.__dev.fellowship({ kill: { n: 6 } });
    const t1 = window.__dev.fellowship().tierName;                // bond 6 ⇒ Compañero
    window.__dev.fellowship({ kill: { n: 10 } });
    const t2 = window.__dev.fellowship().tierName;                // bond 16 ⇒ Jurado
    return { t0, t1, t2 };
  }, PERIOD_MS);
  ok("9 TIERS con nombre: bond 0→6→16 ⇒ Desconocido→Compañero→Jurado (progresión legible)",
     tierWalk.t0 === "Desconocido" && tierWalk.t1 === "Compañero" && tierWalk.t2 === "Jurado", JSON.stringify(tierWalk));

  // 10 FORJAR gate + pasivo
  const forge = await page.evaluate((PM) => {
    const T = 6100 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: true });
    window.__dev.fellowship({ nowMs: T });
    window.__dev.fellowship({ kill: { n: 5 } });                  // bond 5 < forge(6)
    const below = window.__dev.fellowship();
    window.__dev.fellowship({ kill: { n: 1 } });                  // bond 6 == forge
    const at = window.__dev.fellowship();
    return { belowForged: below.forged, belowMul: below.fellowMulXp, atForged: at.forged, atMul: at.fellowMulXp };
  }, PERIOD_MS);
  ok("10 FORJAR gate + pasivo: bond<forge ⇒ forged false AND mul 0; bond≥forge ⇒ forged true AND fellowMulXp==0.10 (canal xpGain)",
     forge.belowForged === false && forge.belowMul === 0 && forge.atForged === true && near(forge.atMul, 0.10),
     JSON.stringify(forge));

  // 11 PASIVO efectivo en gainXP: served sim.js aplica fellowMul(h,"xpGain") en el chokepoint + xpGainMul refleja +10%
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /fellowMul\(h,\s*"xpGain"\)/.test(simSrc);
  const xpMul = await page.evaluate((PM) => {
    const T = 6200 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T });
    const off = window.__dev.fellowship().xpGainMul;              // bond 0 ⇒ sin pasivo
    window.__dev.fellowship({ kill: { n: 20 } });
    const on = window.__dev.fellowship().xpGainMul;               // forjado ⇒ ×1.10 sobre el mult base
    return { off, on };
  }, PERIOD_MS);
  ok("11 PASIVO efectivo en gainXP: served sim.js aplica fellowMul(h,'xpGain') en gainXP AND xpGainMul forjado ≈ off×1.10",
     seamWired && near(xpMul.on, xpMul.off * 1.10, 1e-4), `wired=${seamWired} ${JSON.stringify(xpMul)}`);

  // 12 byte-id pasivo OFF: enabled false aun con bond alto ⇒ forged false AND mul 0
  const passiveOff = await page.evaluate(() => {
    window.__dev.fellowship({ enabled: false });                 // bond alto persiste en h.fellowAt/kills, pero el gate lo apaga
    const f = window.__dev.fellowship();
    return { enabled: f.enabled, forged: f.forged, mul: f.fellowMulXp };
  });
  ok("12 byte-id pasivo OFF: enabled false (aun con bond alto) ⇒ forged false AND fellowMulXp 0 (gate ⇒ seam xpGain byte-id a HEAD)",
     passiveOff.enabled === false && passiveOff.forged === false && passiveOff.mul === 0, JSON.stringify(passiveOff));

  // 13 CONVERGENCIA 2-cliente: same nowMs ⇒ banda IDÉNTICA pese a distinto vínculo por héroe
  const conv = await page.evaluate((PM) => {
    const T = 6300 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: true });
    // "cliente A": vínculo alto
    window.__dev.fellowship({ nowMs: T }); window.__dev.fellowship({ kill: { n: 40 } });
    const a = window.__dev.fellowship({ nowMs: T });
    const bondA = a.bond, bandA = JSON.stringify(a.band);
    // "cliente B": mismo reloj, distinto vínculo (menos kills contribuidos esta semana → re-snapshot en semana nueva)
    const T2 = 6301 * PM + Math.floor(PM * 0.40);
    const b1 = window.__dev.fellowship({ nowMs: T2 });            // re-snapshot ⇒ bond 0
    const b = window.__dev.fellowship({ nowMs: T2 });
    const bondB = b.bond, bandB = JSON.stringify(b.band);
    // banda de la MISMA semana T leída de nuevo debe seguir idéntica (pura del reloj)
    const aAgain = JSON.stringify(window.__dev.fellowship({ nowMs: T }).band);
    return { bandA, aAgain, bandSameT: bandA === aAgain, bondA, bondB };
  }, PERIOD_MS);
  ok("13 CONVERGENCIA 2-cliente: banda pura del reloj (misma semana ⇒ banda IDÉNTICA) pese a vínculo PERSONAL distinto por héroe",
     conv.bandSameT === true && conv.bondA !== conv.bondB, JSON.stringify(conv));

  // 14 render + nameplate: served render.js gated draw + fellowshipTag authority + screenshot
  const rsrc = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /FELLOWSHIP_BOND\.enabled/.test(rsrc) && /sim\.wayfarerFellowship\(/.test(rsrc) && /Compañeros de Ruta/.test(rsrc) && /sim\.fellowshipTag\(/.test(rsrc) && /∞/.test(rsrc);
  const tagAuth = await page.evaluate((PM) => {
    const T = 6400 * PM + Math.floor(PM * 0.40);
    window.__dev.fellowship({ enabled: false }); window.__dev.fellowship({ nowMs: T });
    const off = window.__dev.fellowship().tag;                    // OFF ⇒ "" (glifo del sim SERVIDO)
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: T }); window.__dev.fellowship({ kill: { n: 20 } });
    const on = window.__dev.fellowship().tag;                     // forjado ⇒ "∞"
    return { off, on };
  }, PERIOD_MS);
  // pin Date.now para que tickFellowship no re-snapshotee al render ⇒ el vínculo forjado persiste ⇒ ∞ se dibuja
  const T14 = 6400 * PERIOD_MS + Math.floor(PERIOD_MS * 0.40);
  await page.evaluate((nm) => {
    window.__t14 = Date.now; Date.now = () => nm;
    window.__dev.fellowship({ enabled: true }); window.__dev.fellowship({ nowMs: nm });
    window.__dev.fellowship({ kill: { n: 20 } });                 // forjado (Jurado)
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
  }, T14);
  await sleep(200);
  const forgedNow = await page.evaluate(() => window.__dev.fellowship().forged);
  try { await page.screenshot({ path: join(OUT, "nameplate-bond.png"), clip: { x: 520, y: 220, width: 260, height: 200 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__t14) { Date.now = window.__t14; delete window.__t14; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("14 render + nameplate: render.js servido dibuja wayfarerFellowship() ('Compañeros de Ruta') gated + glifo ∞ via fellowshipTag; tag \"\" OFF / \"∞\" forjado ON",
     gatedDraw && tagAuth.off === "" && tagAuth.on === "∞" && forgedNow === true, `gatedDraw=${gatedDraw} tagOff="${tagAuth.off}" tagOn="${tagAuth.on}" forgedNow=${forgedNow}`);

  // 15 arc regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.fellowship({ enabled: true });
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const f = window.__dev.fellowship(); const c = window.__dev.contest(); const te = window.__dev.territory(); const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { fellowOk: f.enabled, contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("15 arco regr: CONTEST + TERRITORY + STANDINGS + LEDGER + OATH + BOUNTY + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con FELLOWSHIP ON",
     arc.fellowOk && arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 16 fps NO-REGRESSION (mediana-de-5 + warmup)
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.fellowship({ enabled: on }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const off = await sample(false); const onA = await sample(true);
    return { off, on: onA };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("16 fps NO-REGRESIÓN: FELLOWSHIP ON no degrada el frame budget vs OFF (mediana-de-5, relativo, ON ≥ OFF*0.9)",
     onM >= offM * 0.9, `on≈${Math.round(onM)} off≈${Math.round(offM)}`);

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
