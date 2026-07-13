// CAS-2329 — QA OBSERVABLE verify for PULSO DEL MUNDO / WORLD PULSE (DARK, WORLD_PULSE.enabled:false). EVO mecánica #50.
// QA pass INDEPENDIENTE sobre el DARK build del GE (commit e7505fe, self-verify 13/13). Re-verifica byte-id OFF de forma independiente y AÑADE el
// diferenciador que el issue exige como MMORPG: EVO#50 es el PIVOTE FUERA del arco social (Fellowship/Mentor #47/#48) y del arco Orden/territorio
// (#43–46) — es el PRIMER sistema de estado-de-mundo dinámico y AMBIENTAL (living-world). Una capa que cicla por zonas y hace que el mundo
// COMPARTIDO se sienta VIVO y perfectamente sincronizado entre TODOS los clientes.
//
// North Star (check 10, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores"), MISMO reloj lógico
// (nowMs) ⇒ la zona-en-Pulso (elección PURA del reloj: hash de Knuth sobre floor((now-epoch)/period)) es IDÉNTICA byte-a-byte en ambos (0 desync),
// MISMA fase viva/decaída, y AMBOS presentes en esa zona reciben el MISMO passive Δ. El passive es AMBIENTAL y COMPARTIDO (no per-hero): A salir de
// la zona ⇒ su Δ cae a 0 PERO la zona-en-Pulso (pura del reloj) + el Δ de B quedan INTACTOS. Un desync de fase = sev-1.
//
// ★ DIFERENCIADOR QA (check 6) = COBERTURA DE ZONAS, re-test de la CLASE de footgun CAS-2326 (Vestigio irrecuperable en forest/ruins/caves por
// falta de guard zoneOf en soulPos): verifico que las 6 zonas configurables de WORLD_PULSE.zones pueden REALMENTE hospedar un pulso VIVO OBSERVABLE
// (un jugador físicamente presente recibe el boost) — no sólo la que __ppick del self-verify aterriza. broken=[] obligatorio.
//
// Precedencia NO-stack (check 9): el passive del Pulso es la MÁS BAJA del canal restedMult ⇒ CEDE (return 0) a STANDINGS(colectivo) > MENTOR(personal)
// > SOUL(recuperación); se aplica el MAYOR (0 doble-conteo). FELLOWSHIP(xpGain)/TERRITORY(safeRegen) canales ⊥ ⇒ coexisten. Como TODO el arco está LIVE
// (standings/mentor/soul enabled:true), para OBSERVAR el passive del Pulso en AISLAMIENTO hay que flippear los peers DEFAULT-ON del mismo canal OFF
// in-memory (footgun heredado CAS-2326) ⇒ el harness los desactiva antes de medir.
//
// Observado vía __dev.pulse (flip WORLD_PULSE.enabled IN-MEMORY + inyección de nowMs + toZone/leave drivers de proximidad) + peers standings/mentor/
// soul/territory/oath/saveBlob/worldFingerprint. Cero cambios de producto — solo lectura observable, disco sigue enabled:false.
//
// Checks:
//   1  boots to play, __dev.pulse + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (re-verify GE INDEP): FRESH boot ⇒ enabled false + zone null + boost 0 + tag "" + gExists false (tick jamás corrió) + save SIN
//      clave 'pulse' + fingerprint byte-estable a través del toggle enabled (0 RNG drift, 0 estado nuevo, 0 clave serializada).
//   3  zona-en-Pulso = FUNCIÓN PURA del reloj: mismo nowMs ⇒ zona+schedule IDÉNTICOS (2 lecturas) — convergencia 1-página, 0 desync.
//   4  ROTA por period: barriendo periods surgen ≥2 zonas-en-Pulso DISTINTAS (elección determinista del reloj, mundo vivo).
//   5  FASE VIVA + DECAIMIENTO determinista: frac<liveFrac ⇒ VIVO (zona non-null); frac≥liveFrac ⇒ decayó (live false, zona null) + nextInSec>0.
//   6  ★ COBERTURA (re-test footgun CAS-2326): las 6 zonas de WORLD_PULSE.zones pueden hospedar un pulso VIVO OBSERVABLE (in-zone ⇒ boost 0.10). broken=[].
//   7  PASSIVE compartido (aislado): peers OFF + pulso vivo + héroe EN la zona (toZone) ⇒ pulseMulRested==boost(0.10) + inZone true; leave ⇒ 0 + inZone false.
//   8  PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: served sim aplica pulseMul(h,'restedMult') en gainXP; enabled false ⇒ mul 0 + tag "".
//   9  PRECEDENCIA MISMO-CANAL cede + canal ⊥ coexiste: PULSE(0.10) CEDE a STANDINGS ⇒ 0 AND CEDE a SOUL ⇒ 0 (aplica el MAYOR); COEXISTE con TERRITORY ⇒ 0.10.
//  10  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO nowMs ⇒ zona-en-Pulso IDÉNTICA byte-a-byte + MISMA fase + MISMO Δ para ambos en zona;
//      A sale ⇒ su Δ cae a 0 PERO la zona compartida (pura del reloj) + el Δ de B quedan INTACTOS (ambiental compartido, 0 desync).
//  11  render badge "◈ Pulso del Mundo" se DIBUJA con feature ON (Δ px vs OFF) + arco regr hooks presentes + fps ≥55.
//   0  no JS errors during run.
// Run: node tools/cas2329-worldpulse-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2329-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PM = 240000;                       // periodSec 240 ⇒ periodMs 240000 (reloj PROPIO de WORLD_PULSE)
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

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

// helper: encuentra un period VIVO donde toZone aterriza al héroe DENTRO de la zona-en-Pulso. isolate ⇒ peers OFF (mismo canal) para medir aislado.
async function installPick(page) {
  await page.evaluate((PMv) => {
    window.__ppick = (startP, isolate) => {
      if (isolate) { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); }
      window.__dev.pulse({ enabled: true });
      for (let p = startP; p < startP + 200; p++) {
        const nm = p * PMv + Math.floor(PMv * 0.10);            // frac 0.10 < liveFrac ⇒ VIVO
        const s = window.__dev.pulse({ nowMs: nm });
        if (!s.live || !s.zone) continue;
        const after = window.__dev.pulse({ nowMs: nm, toZone: true });   // teleporta a la zona-en-Pulso
        if (after.inZone) return { nm, p, zone: after.zone, boost: after.pulseMulRested };
      }
      return null;
    };
    // busca, para UNA zona objetivo, un period vivo cuya zona-en-Pulso == target y que toZone aterrice in-zone (cobertura CAS-2326)
    window.__pzone = (target) => {
      window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false });
      window.__dev.pulse({ enabled: true });
      for (let p = 1; p < 4000; p++) {
        const nm = p * PMv + Math.floor(PMv * 0.10);
        const s = window.__dev.pulse({ nowMs: nm });
        if (!s.live || s.zone !== target) continue;
        const after = window.__dev.pulse({ nowMs: nm, toZone: true });
        return { found: true, inZone: after.inZone, zone: after.zone, boost: after.pulseMulRested };
      }
      return { found: false };
    };
  }, PM);
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.pulse && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.territory && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.pulse + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot (INDEP re-verify): enabled false + gExists false + save no 'pulse' + fingerprint stable across toggle
  const dark = await page.evaluate(() => window.__dev.pulse());       // read BEFORE any inject
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.pulse({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(321)));
  await page.evaluate(() => window.__dev.pulse({ enabled: false }));
  ok("2 byte-id OFF (fresh boot INDEP): enabled false + gExists false + zone null + boost 0 + tag \"\" + save SIN 'pulse' + fingerprint byte-estable toggle",
     dark.enabled === false && dark.gExists === false && dark.zone === null && dark.boost === 0 && dark.tag === "" &&
     !/"pulse"/.test(saveOff) && fpBefore === fpAfter,
     `enabled=${dark.enabled} gExists=${dark.gExists} zone=${dark.zone} boost=${dark.boost} tag="${dark.tag}" saveNoPulse=${!/"pulse"/.test(saveOff)} fpMatch=${fpBefore === fpAfter}`);

  await installPick(page);

  // 3 zone-in-pulse = pure fn of clock: same nowMs ⇒ identical zone+schedule
  const conv = await page.evaluate((PMv) => {
    window.__dev.pulse({ enabled: true });
    const nm = 1234 * PMv + Math.floor(PMv * 0.10);
    const a = window.__dev.pulse({ nowMs: nm }), b = window.__dev.pulse({ nowMs: nm });
    return { z1: a.zone, z2: b.zone, live1: a.live, s1: JSON.stringify(a.schedule), s2: JSON.stringify(b.schedule) };
  }, PM);
  ok("3 zona-en-Pulso = función pura del reloj: mismo nowMs ⇒ zona+schedule IDÉNTICOS (convergencia 1-página, 0 desync)",
     conv.z1 != null && conv.z1 === conv.z2 && conv.live1 === true && conv.s1 === conv.s2, `z1=${conv.z1} z2=${conv.z2} live=${conv.live1} schedMatch=${conv.s1 === conv.s2}`);

  // 4 rotation by period ⇒ ≥2 distinct pulse zones
  const rot = await page.evaluate((PMv) => {
    window.__dev.pulse({ enabled: true }); const zs = new Set();
    for (let p = 100; p < 160; p++) { const s = window.__dev.pulse({ nowMs: p * PMv + Math.floor(PMv * 0.10) }); if (s.zone) zs.add(s.zone); }
    return [...zs];
  }, PM);
  ok("4 ROTA por period: barriendo periods ⇒ ≥2 zonas-en-Pulso distintas (mundo vivo)", rot.length >= 2, `zones=${JSON.stringify(rot)}`);

  // 5 live/decay deterministic
  const ld = await page.evaluate((PMv) => {
    window.__dev.pulse({ enabled: true });
    const live = window.__dev.pulse({ nowMs: 500 * PMv + Math.floor(PMv * 0.30) });   // frac 0.30 < 0.5 ⇒ VIVO
    const dead = window.__dev.pulse({ nowMs: 500 * PMv + Math.floor(PMv * 0.75) });   // frac 0.75 ≥ 0.5 ⇒ decayó
    return { live, dead };
  }, PM);
  ok("5 FASE VIVA + DECAIMIENTO determinista: frac<liveFrac ⇒ VIVO+zona; frac≥liveFrac ⇒ decayó (live false, zona null) + nextInSec>0",
     ld.live.live === true && ld.live.zone != null && ld.dead.live === false && ld.dead.zone === null && (ld.dead.nextInSec | 0) > 0,
     `live{live:${ld.live.live},zone:${ld.live.zone}} dead{live:${ld.dead.live},zone:${ld.dead.zone},next:${ld.dead.nextInSec}}`);

  // 6 ★ COVERAGE re-test (footgun class CAS-2326): every configured pulse zone can host an OBSERVABLE live pulse (in-zone ⇒ boost 0.10)
  const cov = await page.evaluate(() => {
    const zones = window.__dev.pulse().zones || [];
    const broken = [], perZone = {};
    for (const z of zones) {
      const r = window.__pzone(z);
      perZone[z] = r;
      if (!r.found || !r.inZone || Math.abs(r.boost - 0.10) > 1e-6) broken.push(z);
    }
    return { zones, broken, perZone };
  });
  ok("6 ★ COBERTURA (re-test footgun CAS-2326): las 6 zonas de WORLD_PULSE.zones hospedan pulso VIVO OBSERVABLE (in-zone ⇒ boost 0.10). broken=[]",
     cov.zones.length === 6 && cov.broken.length === 0,
     `zones=${JSON.stringify(cov.zones)} broken=${JSON.stringify(cov.broken)}`);

  // 7 passive isolated: in-zone ⇒ boost 0.10 + inZone true; leave ⇒ 0
  const pass = await page.evaluate(() => {
    const w = window.__ppick(2000, true); if (!w) return { bad: true };
    const inz = window.__dev.pulse({ nowMs: w.nm, toZone: true });
    const out = window.__dev.pulse({ nowMs: w.nm, leave: true });
    return { zone: w.zone, inZoneMul: inz.pulseMulRested, inZone: inz.inZone, outMul: out.pulseMulRested, outInZone: out.inZone };
  });
  ok("7 PASSIVE compartido (aislado): héroe EN la zona-en-Pulso ⇒ pulseMulRested==boost(0.10) + inZone true; leave ⇒ 0 + inZone false",
     !pass.bad && near(pass.inZoneMul, 0.10) && pass.inZone === true && pass.outMul === 0 && pass.outInZone === false, JSON.stringify(pass));

  // 8 passive effective in gainXP seam + byte-id OFF
  const simSrc = await page.evaluate(async () => { const r = await fetch("sim/sim.js"); return await r.text(); });
  const seamWired = /function gainXP/.test(simSrc) && /pulseMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    const w = window.__ppick(2600, true); if (!w) return { bad: true };
    const onMul = window.__dev.pulse({ nowMs: w.nm, toZone: true }).pulseMulRested;
    window.__dev.pulse({ enabled: false });
    const s = window.__dev.pulse({ nowMs: w.nm });
    return { onMul, enabled: s.enabled, mul: s.pulseMulRested, tag: s.tag };
  });
  ok("8 PASSIVE efectivo en gainXP (seam servido) + byte-id pasivo OFF: gainXP suma pulseMul(h,'restedMult') (en zona ⇒ 0.10); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.10) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 9 precedence: PULSE cedes to STANDINGS + SOUL (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.territory({ enabled: false });
    const w = window.__ppick(3000, true); if (!w) return { bad: true };
    const T = w.nm; const base = window.__dev.pulse({ nowMs: T, toZone: true }).pulseMulRested;   // sin peers ⇒ 0.10
    // (a) vs STANDINGS (MISMO canal): jura la orden LÍDER ⇒ standingsMul>0 ⇒ pulseMul CEDE
    window.__dev.standings({ enabled: true, nowMs: T }); const leader = window.__dev.standings({ nowMs: T }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const standPeer = window.__dev.pulse({ nowMs: T, toZone: true }).standingsMulRested;
    const standCeded = window.__dev.pulse({ nowMs: T, toZone: true }).pulseMulRested;             // esperado 0
    window.__dev.standings({ enabled: false });
    // (b) vs SOUL (MISMO canal): muere ⇒ soulMul>0 ⇒ pulseMul CEDE
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: T }); window.__dev.soul({ die: true });
    const soulPeer = window.__dev.pulse({ nowMs: T, toZone: true }).soulMulRested;
    const soulCeded = window.__dev.pulse({ nowMs: T, toZone: true }).pulseMulRested;              // esperado 0
    window.__dev.soul({ enabled: false });
    // (c) vs TERRITORY (canal ⊥ safeRegen): NO afecta a pulseMul (restedMult) ⇒ pulse intacto en zona
    window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.pulse({ nowMs: T, toZone: true }).pulseMulRested;            // esperado 0.10 (canal ⊥)
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, soulPeer, soulCeded, terrCoexist };
  });
  ok("9 PRECEDENCIA: PULSE(0.10) CEDE a STANDINGS ⇒ 0 AND CEDE a SOUL ⇒ 0 (aplica el MAYOR); COEXISTE con TERRITORY(safeRegen ⊥) ⇒ 0.10 intacto",
     !prec.bad && near(prec.base, 0.10) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 && near(prec.terrCoexist, 0.10),
     JSON.stringify(prec));

  // 11 render badge draws with feature ON (Δ px vs OFF-control) — measured on THIS page before opening page2.
  // FOOTGUN (CAS-2322 #2): al flippear enabled:true, el game-loop llama tickPulse(Date.now() REAL) cada frame ⇒ el estado del pulso depende del
  // reloj de pared (vivo/decaído ~50% flaky). PIN Date.now a un timestamp de FASE VIVA para que el loop produzca un pulso VIVO determinista.
  await page.evaluate(() => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.territory({ enabled: false }); });
  await page.evaluate(() => window.__dev.pulse({ enabled: false }));
  await sleep(200);
  const sumOff = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 340).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.evaluate((PMv) => { const T = 777 * PMv + Math.floor(PMv * 0.10); window.__realNow = Date.now.bind(Date); Date.now = () => T; window.__dev.pulse({ enabled: true }); window.__dev.pulse({ nowMs: T }); }, PM);
  await sleep(260);
  const sumOn = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 340).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { if (window.__realNow) Date.now = window.__realNow; });   // restaura el reloj real (badge medido; no contamina fps/North Star)
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, ledger: !!window.__dev.ledger, standings: !!window.__dev.standings,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("11 render badge '◈ Pulso del Mundo' se DIBUJA con feature ON (Δ px vs OFF) + arco hooks presentes + fps≥55",
     sumOn !== sumOff && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.ledger && arc.standings && fps >= 55,
     `sumOff=${sumOff} sumOn=${sumOn} arc=${JSON.stringify(arc)} fps=${fps}`);

  // 10 ★ NORTH STAR — 2-client convergence (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("p2:" + m.text()); });
  // footgun (heredado cas2313): localStorage POR-ORIGEN compartido ⇒ el save de page1 bootea page2 a resume NO menu ⇒ limpiar antes del load.
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();   // footgun: página backgrounded ⇒ rAF throttled ⇒ nunca llega a menu ⇒ traer al frente ANTES de toPlay
  await toPlay(page2);
  await installPick(page2);

  // find a live period on page2 that lands in-zone, then apply the SAME nowMs on page1
  const w2 = await page2.evaluate(() => window.__ppick(4000, true));
  const north = w2 ? await (async () => {
    const T = w2.nm;
    const a = await page.evaluate((t) => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false });
      window.__dev.pulse({ enabled: true }); return window.__dev.pulse({ nowMs: t, toZone: true }); }, T);
    const b = await page2.evaluate((t) => window.__dev.pulse({ nowMs: t, toZone: true }), T);
    // A leaves the zone ⇒ A's Δ falls to 0; shared zone (pure of clock) + B's Δ must stay intact
    const aOut = await page.evaluate((t) => window.__dev.pulse({ nowMs: t, leave: true }), T);
    const bAfter = await page2.evaluate((t) => window.__dev.pulse({ nowMs: t, toZone: true }), T);
    return {
      zoneA: a.zone, zoneB: b.zone, mulA: a.pulseMulRested, mulB: b.pulseMulRested,
      schedA: JSON.stringify(a.schedule), schedB: JSON.stringify(b.schedule), aOutMul: aOut.pulseMulRested,
      zoneBAfter: bAfter.zone, mulBAfter: bAfter.pulseMulRested,
    };
  })() : { bad: true };
  ok("10 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE: 2 páginas MISMO nowMs ⇒ zona-en-Pulso IDÉNTICA + MISMA fase + MISMO Δ para ambos en zona; A sale ⇒ Δ_A=0 pero zona compartida + Δ_B INTACTOS (0 desync)",
     !north.bad && north.zoneA != null && north.zoneA === north.zoneB && north.schedA === north.schedB &&
     near(north.mulA, 0.10) && near(north.mulB, 0.10) && north.aOutMul === 0 && north.zoneBAfter === north.zoneB && near(north.mulBAfter, 0.10),
     JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2329 QA observable: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
  if (errors.length) console.log("JS errors:\n" + errors.join("\n"));
  ok("0 no JS errors during run", errors.length === 0, `errors=${errors.length}`);
} catch (e) {
  console.error("harness error:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close && server.close();
}
if (FAIL > 0) process.exitCode = 1;
