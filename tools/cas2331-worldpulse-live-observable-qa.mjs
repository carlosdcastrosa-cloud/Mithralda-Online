// CAS-2331 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — PULSO DEL MUNDO / WORLD PULSE (WORLD_PULSE.enabled:true LIVE). EVO mecánica #50.
// Gemelo LIVE de la DARK observable `tools/cas2329-worldpulse-observable-qa.mjs` (12/12 ×2 PASS): MISMOS hechos, contra el build SERVIDO en gh-pages
// tras el flip CTO/CEO CAS-2330 (WORLD_PULSE.enabled false→true, commit 58a268a). Pre-check: version.json servido debe AVANZAR de la base pre-flip
// `965ed04ab2e9` y el config servido debe mostrar WORLD_PULSE.enabled:true (si aún DARK ⇒ FAIL check 1, no self-heal destructivo — sólo señala).
//
// EVO#50 = PIVOTE FUERA del arco social (Fellowship/Mentor #47/#48) y del arco Orden/territorio (#43–46): el PRIMER sistema de estado-de-mundo
// dinámico y AMBIENTAL (living-world). Una capa que cicla por zonas y hace que el mundo COMPARTIDO se sienta VIVO y perfectamente sincronizado.
//
// North Star (check 12, no-negociable) = CONVERGENCIA 2-CLIENTE REAL LIVE: DOS páginas puppeteer independientes contra gh-pages, MISMO reloj lógico
// (nowMs) ⇒ la zona-en-Pulso (elección PURA del reloj: hash de Knuth sobre floor((now-epoch)/period)) es IDÉNTICA byte-a-byte en ambos (0 desync),
// MISMA fase viva + MISMO Δ 0.10 para ambos en zona. El passive es AMBIENTAL y COMPARTIDO (no per-hero): A sale de la zona ⇒ su Δ cae a 0 PERO la
// zona-en-Pulso (pura del reloj) + el Δ de B quedan INTACTOS. Un desync de fase = sev-1.
//
// ★ DIFERENCIADOR QA (check 7) = COBERTURA DE ZONAS (re-test de la CLASE de footgun CAS-2326): las 6 zonas de WORLD_PULSE.zones pueden REALMENTE
// hospedar un pulso VIVO OBSERVABLE (un jugador presente recibe el boost) — broken=[] obligatorio, ahora contra el sim SERVIDO.
//
// Patrón DEFAULT-ON (mirror soul-live CAS-2328 / mentor-live CAS-2324): el flip ya cargó ⇒ pulse().enabled===true en boot fresco SIN __dev flip.
// byte-id OFF se re-verifica INDEP vía TOGGLE enabled:false (World Pulse es byte-id OFF por CONSTRUCCIÓN: 0 estado nuevo, 0 clave serializada, más
// fuerte que Vestigio). Precedencia: como todo el arco está LIVE (standings/mentor/soul enabled:true), para OBSERVAR el passive del Pulso en
// AISLAMIENTO se flippean los peers DEFAULT-ON del mismo canal (restedMult) OFF in-memory antes de medir (footgun heredado CAS-2326).
//
// LIVE wiring (mirror CAS-2328): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded) y != base pre-flip; favicon-404 filtrado.
// Run: node tools/cas2331-worldpulse-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2331-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PM = 240000;                       // periodSec 240 ⇒ periodMs 240000 (reloj PROPIO de WORLD_PULSE)
const PREFLIP = "965ed04ab2e9";          // build servido ANTES del flip CAS-2330 — el LIVE debe AVANZAR de este
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const isFaviconOnly = (u) => /favicon/i.test(u || "");

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

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

async function freshPage(browser, errors, net404, tag) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(`${tag}:` + String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(`${tag}:` + m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.bringToFront();
  await page.goto(LIVE + "/?dev=1", { waitUntil: "domcontentloaded", timeout: 70000 });
  await toPlay(page); await installPick(page);
  return page;
}

const errors = [], net404 = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await freshPage(browser, errors, net404, "p1");
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // 1 boot LIMPIO LIVE + hooks + build self-consistent vs version.json + build AVANZÓ de pre-flip + served config WORLD_PULSE.enabled:true + arco 0-regr + DARK trío false
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.pulse && window.__dev.standings && window.__dev.mentor && window.__dev.soul && window.__dev.territory && window.__dev.contest && window.__dev.fellowship && window.__dev.ledger && window.__dev.oath && window.__dev.saveBlob && window.__dev.worldFingerprint));
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { PULSE: en("WORLD_PULSE"), SOUL: en("SOUL_RECOVERY"), MENTOR: en("MENTOR_BOND"), FELLOWSHIP: en("FELLOWSHIP_BOND"), CONTEST: en("ORDER_CONTEST"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"),
      LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"),
      BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const arcTrue = ["SOUL","MENTOR","FELLOWSHIP","CONTEST","TERRITORY","STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("1 boots LIVE; build self-consistent vs version.json + AVANZÓ de pre-flip; __dev.pulse + arc hooks; served WORLD_PULSE.enabled:true + arco entero true (0 regr) + DARK trío false; 0 err/404",
     hooks && build === verBuild && !!build && build !== PREFLIP && cfg.PULSE === "true" && arcTrue && darksFalse && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} preflip=${PREFLIP} PULSE=${cfg.PULSE} arcTrue=${arcTrue} darksFalse=${darksFalse} err=${errors.length} 404=${net404.length} cfg=${JSON.stringify(cfg)}`);

  // 2 DEFAULT-ON (prueba LIVE): boot fresco 0 __dev flip ⇒ pulse().enabled===true (el flip cargó del config servido) + boost 0 sin estar en zona
  const dOn = await page.evaluate(() => { const s = window.__dev.pulse(); return { enabled: s.enabled, boost: s.pulseMulRested, tag: s.tag }; });
  ok("2 DEFAULT-ON desde config servido: pulse().enabled===true (flip cargó) AND pulseMulRested 0 (passive NO activo sin estar físicamente en la zona-en-Pulso viva)",
     dOn.enabled === true && dOn.boost === 0, JSON.stringify(dOn));

  // 3 byte-id OFF via TOGGLE (LIVE re-verify INDEP): enabled:false ⇒ pulseMulRested 0 + tag "" + save SIN 'pulse' + fingerprint byte-estable; restaura ON.
  //   World Pulse es byte-id OFF por CONSTRUCCIÓN (0 estado nuevo, 0 clave serializada) ⇒ save nunca contiene 'pulse' aun con enabled ON.
  const byteId = await page.evaluate(() => {
    window.__dev.pulse({ enabled: false });
    const s = window.__dev.pulse();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.pulse({ enabled: false });
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.pulse({ enabled: true });                                        // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.pulseMulRested, tag: s.tag, zone: s.zone, saveNoPulse: !/"pulse"/.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("3 byte-id OFF (toggle LIVE): enabled false ⇒ pulseMulRested 0 + tag \"\" + zone null + save SIN 'pulse' + fingerprint byte-estable toggle (0 estado/clave nueva)",
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.zone === null && byteId.saveNoPulse && byteId.fpMatch, JSON.stringify(byteId));

  // 4 zone-in-pulse = pure fn of clock: same nowMs ⇒ identical zone+schedule (convergencia 1-página)
  const conv = await page.evaluate((PMv) => {
    window.__dev.pulse({ enabled: true });
    const nm = 1234 * PMv + Math.floor(PMv * 0.10);
    const a = window.__dev.pulse({ nowMs: nm }), b = window.__dev.pulse({ nowMs: nm });
    return { z1: a.zone, z2: b.zone, live1: a.live, s1: JSON.stringify(a.schedule), s2: JSON.stringify(b.schedule) };
  }, PM);
  ok("4 zona-en-Pulso = función pura del reloj: mismo nowMs ⇒ zona+schedule IDÉNTICOS (convergencia 1-página, 0 desync)",
     conv.z1 != null && conv.z1 === conv.z2 && conv.live1 === true && conv.s1 === conv.s2, `z1=${conv.z1} z2=${conv.z2} live=${conv.live1} schedMatch=${conv.s1 === conv.s2}`);

  // 5 rotation by period ⇒ ≥2 distinct pulse zones
  const rot = await page.evaluate((PMv) => {
    window.__dev.pulse({ enabled: true }); const zs = new Set();
    for (let p = 100; p < 160; p++) { const s = window.__dev.pulse({ nowMs: p * PMv + Math.floor(PMv * 0.10) }); if (s.zone) zs.add(s.zone); }
    return [...zs];
  }, PM);
  ok("5 ROTA por period: barriendo periods ⇒ ≥2 zonas-en-Pulso distintas (mundo vivo)", rot.length >= 2, `zones=${JSON.stringify(rot)}`);

  // 6 live/decay deterministic
  const ld = await page.evaluate((PMv) => {
    window.__dev.pulse({ enabled: true });
    const live = window.__dev.pulse({ nowMs: 500 * PMv + Math.floor(PMv * 0.30) });   // frac 0.30 < 0.5 ⇒ VIVO
    const dead = window.__dev.pulse({ nowMs: 500 * PMv + Math.floor(PMv * 0.75) });   // frac 0.75 ≥ 0.5 ⇒ decayó
    return { live, dead };
  }, PM);
  ok("6 FASE VIVA + DECAIMIENTO determinista: frac<liveFrac ⇒ VIVO+zona; frac≥liveFrac ⇒ decayó (live false, zona null) + nextInSec>0",
     ld.live.live === true && ld.live.zone != null && ld.dead.live === false && ld.dead.zone === null && (ld.dead.nextInSec | 0) > 0,
     `live{live:${ld.live.live},zone:${ld.live.zone}} dead{live:${ld.dead.live},zone:${ld.dead.zone},next:${ld.dead.nextInSec}}`);

  // 7 ★ COVERAGE re-test (footgun class CAS-2326): cada zona configurada puede hospedar un pulso VIVO OBSERVABLE (in-zone ⇒ boost 0.10). broken=[]
  const cov = await page.evaluate(() => {
    const zones = window.__dev.pulse().zones || [];
    const broken = [], perZone = {};
    for (const z of zones) { const r = window.__pzone(z); perZone[z] = r; if (!r.found || !r.inZone || Math.abs(r.boost - 0.10) > 1e-6) broken.push(z); }
    return { zones, broken, perZone };
  });
  ok("7 ★ COBERTURA LIVE (re-test footgun CAS-2326): las 6 zonas de WORLD_PULSE.zones hospedan pulso VIVO OBSERVABLE (in-zone ⇒ boost 0.10). broken=[]",
     cov.zones.length === 6 && cov.broken.length === 0, `zones=${JSON.stringify(cov.zones)} broken=${JSON.stringify(cov.broken)}`);

  // 8 passive isolated: in-zone ⇒ boost 0.10 + inZone true; leave ⇒ 0
  const pass = await page.evaluate(() => {
    const w = window.__ppick(2000, true); if (!w) return { bad: true };
    const inz = window.__dev.pulse({ nowMs: w.nm, toZone: true });
    const out = window.__dev.pulse({ nowMs: w.nm, leave: true });
    return { zone: w.zone, inZoneMul: inz.pulseMulRested, inZone: inz.inZone, outMul: out.pulseMulRested, outInZone: out.inZone };
  });
  ok("8 PASSIVE compartido (aislado): héroe EN la zona-en-Pulso ⇒ pulseMulRested==boost(0.10) + inZone true; leave ⇒ 0 + inZone false",
     !pass.bad && near(pass.inZoneMul, 0.10) && pass.inZone === true && pass.outMul === 0 && pass.outInZone === false, JSON.stringify(pass));

  // 9 passive effective in gainXP seam (sim SERVIDO) + byte-id OFF
  const simSrc = await page.evaluate(async (live) => { const r = await fetch(live + "/sim/sim.js", { cache: "no-store" }); return await r.text(); }, LIVE);
  const seamWired = /function gainXP/.test(simSrc) && /pulseMul\(h,\s*"restedMult"\)/.test(simSrc);
  const passiveOff = await page.evaluate(() => {
    const w = window.__ppick(2600, true); if (!w) return { bad: true };
    const onMul = window.__dev.pulse({ nowMs: w.nm, toZone: true }).pulseMulRested;
    window.__dev.pulse({ enabled: false });
    const s = window.__dev.pulse({ nowMs: w.nm });
    window.__dev.pulse({ enabled: true });
    return { onMul, enabled: s.enabled, mul: s.pulseMulRested, tag: s.tag };
  });
  ok("9 PASSIVE efectivo en gainXP (seam SERVIDO) + byte-id pasivo OFF: gainXP suma pulseMul(h,'restedMult') (en zona ⇒ 0.10); enabled false ⇒ mul 0 AND tag \"\"",
     seamWired && !passiveOff.bad && near(passiveOff.onMul, 0.10) && passiveOff.enabled === false && passiveOff.mul === 0 && passiveOff.tag === "",
     `wired=${seamWired} ${JSON.stringify(passiveOff)}`);

  // 10 precedence: PULSE cedes to STANDINGS + SOUL (restedMult); coexists with TERRITORY (safeRegen ⊥)
  const prec = await page.evaluate(() => {
    window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.territory({ enabled: false });
    const w = window.__ppick(3000, true); if (!w) return { bad: true };
    const T = w.nm; const base = window.__dev.pulse({ nowMs: T, toZone: true }).pulseMulRested;   // sin peers ⇒ 0.10
    window.__dev.standings({ enabled: true, nowMs: T }); const leader = window.__dev.standings({ nowMs: T }).leader;
    window.__dev.oath({ enabled: true }); window.__dev.oath({ grantRep: 1000000 }); window.__dev.oath({ pledge: leader });
    const standPeer = window.__dev.pulse({ nowMs: T, toZone: true }).standingsMulRested;
    const standCeded = window.__dev.pulse({ nowMs: T, toZone: true }).pulseMulRested;             // esperado 0
    window.__dev.standings({ enabled: false });
    window.__dev.soul({ enabled: true }); window.__dev.soul({ nowMs: T }); window.__dev.soul({ die: true });
    const soulPeer = window.__dev.pulse({ nowMs: T, toZone: true }).soulMulRested;
    const soulCeded = window.__dev.pulse({ nowMs: T, toZone: true }).pulseMulRested;              // esperado 0
    window.__dev.soul({ enabled: false });
    window.__dev.territory({ enabled: true });
    const terrCoexist = window.__dev.pulse({ nowMs: T, toZone: true }).pulseMulRested;            // esperado 0.10 (canal ⊥)
    window.__dev.territory({ enabled: false });
    return { base, standPeer, standCeded, soulPeer, soulCeded, terrCoexist };
  });
  ok("10 PRECEDENCIA: PULSE(0.10) CEDE a STANDINGS ⇒ 0 AND CEDE a SOUL ⇒ 0 (aplica el MAYOR); COEXISTE con TERRITORY(safeRegen ⊥) ⇒ 0.10 intacto",
     !prec.bad && near(prec.base, 0.10) && prec.standPeer > 0 && prec.standCeded === 0 && prec.soulPeer > 0 && prec.soulCeded === 0 && near(prec.terrCoexist, 0.10),
     JSON.stringify(prec));

  // 11 render badge draws with feature ON (Δ px vs OFF-control). FOOTGUN (CAS-2322 #2): game-loop llama tickPulse(Date.now() REAL) cada frame ⇒
  //    estado vivo/decaído ~50% flaky ⇒ PIN Date.now a un timestamp de FASE VIVA para un pulso VIVO determinista.
  await page.evaluate(() => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.territory({ enabled: false }); });
  await page.evaluate(() => window.__dev.pulse({ enabled: false }));
  await sleep(200);
  const sumOff = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 340).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.evaluate((PMv) => { const T = 777 * PMv + Math.floor(PMv * 0.10); window.__realNow = Date.now.bind(Date); Date.now = () => T; window.__dev.pulse({ enabled: true }); window.__dev.pulse({ nowMs: T }); }, PM);
  await sleep(260);
  const sumOn = await page.evaluate(() => { const c = document.querySelector("canvas"); const g = c.getContext("2d"); const d = g.getImageData(0, 380, 460, 340).data; let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7) >>> 0; return s >>> 0; });
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { if (window.__realNow) Date.now = window.__realNow; });   // restaura el reloj real (no contamina fps/North Star)
  const arc = await page.evaluate(() => ({
    terr: !!window.__dev.territory, contest: !!window.__dev.contest, fellow: !!window.__dev.fellowship, mentor: !!window.__dev.mentor, soul: !!window.__dev.soul, ledger: !!window.__dev.ledger, standings: !!window.__dev.standings,
  }));
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("11 render badge '◈ Pulso del Mundo' se DIBUJA con feature ON (Δ px vs OFF) + arco hooks presentes + fps≥55",
     sumOn !== sumOff && arc.terr && arc.contest && arc.fellow && arc.mentor && arc.soul && arc.ledger && arc.standings && fps >= 55,
     `sumOff=${sumOff} sumOn=${sumOn} arc=${JSON.stringify(arc)} fps=${fps}`);

  // 12 ★ NORTH STAR — 2-client convergence LIVE (open page2 last: opening it blurs page1 ⇒ index.html pausa el loop de page1)
  const page2 = await freshPage(browser, errors, net404, "p2");
  const w2 = await page2.evaluate(() => window.__ppick(4000, true));
  const north = w2 ? await (async () => {
    const T = w2.nm;
    const a = await page.evaluate((t) => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false });
      window.__dev.pulse({ enabled: true }); return window.__dev.pulse({ nowMs: t, toZone: true }); }, T);
    const b = await page2.evaluate((t) => window.__dev.pulse({ nowMs: t, toZone: true }), T);
    const aOut = await page.evaluate((t) => window.__dev.pulse({ nowMs: t, leave: true }), T);
    const bAfter = await page2.evaluate((t) => window.__dev.pulse({ nowMs: t, toZone: true }), T);
    return {
      zoneA: a.zone, zoneB: b.zone, mulA: a.pulseMulRested, mulB: b.pulseMulRested,
      schedA: JSON.stringify(a.schedule), schedB: JSON.stringify(b.schedule), aOutMul: aOut.pulseMulRested,
      zoneBAfter: bAfter.zone, mulBAfter: bAfter.pulseMulRested,
    };
  })() : { bad: true };
  await page2.screenshot({ path: join(OUT, "client-b-pulse.png") });
  ok("12 ★ NORTH STAR LIVE — CONVERGENCIA 2-CLIENTE: 2 páginas gh-pages MISMO nowMs ⇒ zona-en-Pulso IDÉNTICA + MISMA fase + MISMO Δ para ambos en zona; A sale ⇒ Δ_A=0 pero zona compartida + Δ_B INTACTOS (0 desync)",
     !north.bad && north.zoneA != null && north.zoneA === north.zoneB && north.schedA === north.schedB &&
     near(north.mulA, 0.10) && near(north.mulB, 0.10) && north.aOutMul === 0 && north.zoneBAfter === north.zoneB && near(north.mulBAfter, 0.10),
     JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2331 QA LIVE observable+2cliente: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
  if (errors.length) console.log("JS errors:\n" + errors.join("\n"));
  if (net404.length) console.log("net404:\n" + net404.join("\n"));
  ok("0 no JS errors/404 during run", errors.length === 0 && net404.length === 0, `errors=${errors.length} net404=${net404.length}`);
} catch (e) {
  console.error("harness error:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
if (FAIL > 0) process.exitCode = 1;
