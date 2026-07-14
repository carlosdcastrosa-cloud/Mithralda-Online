// CAS-2360 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — MARCHA / CONVOY MARCH (CONVOY_MARCH.enabled:true LIVE). EVO mecánica #58.
// Gemelo LIVE de la DARK observable `tools/cas2356-convoy-observable-qa.mjs` (16/16 ×2 PASS): MISMOS hechos, contra el build
// SERVIDO en gh-pages tras el flip CAS-2359 (`CONVOY_MARCH.enabled:false→true`, overlay 4-file consistent-HEAD, build c3cac4d5d50a).
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (NO el mirror
// `.higgsfield.gg`, congelado por outage — ver CAS-412). El config servido DEBE mostrar CONVOY_MARCH.enabled:true; si aún DARK ⇒ FAIL check 1.
//
// Eje FRESCO = COHERENCIA DIRECCIONAL de los vectores de VELOCIDAD de los presentes EN MOVIMIENTO por zona coarse (PRIMER eje VECTORIAL del
// arco; #47–56 todos ESCALARES). El server suma los vectores de velocidad de los movers (rapidez>minSpeed), compara |Σv| contra Σ|v| ⇒
// coeficiente c∈[0,1] (c=1 mismo rumbo; c≈0 dispersos/opuestos). Mientras ≥K movers tengan c≥umbral SOSTENIDO ACUMULA un `march`
// (accruePerSec·dt) con DECAY determinista (vida-media 20s); empuja { zona → { march, atMs } }; el cliente REFLEJA + PROYECTA al `now` compartido.
// Umbrales 2/4/6 → tiers → restedMult 0.05/0.10/0.15. Passive COMPARTIDO server-authoritative ⇒ byte-idéntico entre clientes (desync = sev-1).
//
// ★ DIFERENCIADORES (ortogonalidad):
//   (a) vs #51 Congregación (headcount): N jugadores QUIETOS (vels ~0) ⇒ movers 0 ⇒ NO abre, por muchos que sean.
//   (b) vectorial puro: N moviéndose en rumbos OPUESTOS/dispersos ⇒ |Σv|≈0 ⇒ c≈0 < umbral ⇒ NO abre, por muchos que sean.
//   (c) vs solo: 1 jugador moviéndose ⇒ movers<K ⇒ NO abre (requiere ≥K alineados).
//   (d) convoy: ≥K con rumbo común sostenido ⇒ c≈1 ⇒ ACUMULA ⇒ abre por tiers.
// ★ DECAY = vida-media determinista 0-RNG (march·0.5^(dt/halfLife)) al FRENAR/DIVERGIR el convoy.
// ★ NORTH STAR = CONVERGENCIA 2-CLIENTE REAL LIVE: 2 páginas puppeteer contra gh-pages, MISMO snapshot {march,atMs}+reloj ⇒
//   march/tier/buff idénticos byte-a-byte; sostener(T3)/decaer(T1) CONVERGEN; A sale ⇒ Δ_A=0 pero server-authoritative + Δ_B INTACTOS (0 desync).
// Precedencia MÁXIMO ÚNICO: CONVOY_MARCH es la MÁS BAJA del canal restedMult (última, tras BATTLE_SYNC) ⇒ CEDE a standings/mentor/soul/pulse/
//   cong/wayfarer/conf/longWatch/frontier/influx/sync; territory(safeRegen) ⊥ coexiste.
//
// Difs vs la DARK (post-flip LIVE): (1) check 1 = build servido AVANZÓ de pre-flip `ca76c70473c2` (EVO#57 BATTLE_SYNC flip) + version.json
// self-consistent + CONVOY_MARCH.enabled:true served + 9 flags del arco served true (0-regr) + 0 err/404; (2) check 2 = DEFAULT-ON (boot
// fresco ⇒ convoy().enabled===true cargó del config servido) + byte-id OFF vía TOGGLE (save-SIN-clave + fingerprint estable).
// Run: node tools/cas2360-convoy-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2360-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PREFLIP = "ca76c70473c2";          // build servido ANTES del flip (EVO#57 BATTLE_SYNC flip live CAS-2357) — el LIVE debe AVANZAR de este
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;
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

const NOW = 9_300_000;   // reloj de pared FIJO COMPARTIDO (ms) ⇒ proyección determinista byte-a-byte entre ambos clientes
async function installQA(page) {
  await page.evaluate((NOW) => {
    window.__QNOW = NOW;
    // desactiva los 11 peers DEFAULT-ON del canal restedMult (arco LIVE incl. BATTLE_SYNC) para medir Marcha en AISLAMIENTO
    window.__iso = () => { for (const k of ["standings","mentor","soul","pulse","congregation","wayfarer","confluence","longWatch","frontier","influx","sync"]) { try { window.__dev[k]({ enabled: false }); } catch (e) {} } };
    // server EMPUJA el snapshot crudo { zona → { march, atMs } }
    window.__push = (zone, march, atMs) => window.__dev.convoy({ nowMs: window.__QNOW, push: { [zone]: { march, atMs: (atMs != null ? atMs : window.__QNOW) } } });
    // server computa la COHERENCIA del MOVIMIENTO {vels,dt} y acumula/decae — driver NATURAL (diferenciadores: quietos/opuestos ⇒ 0)
    window.__move = (zone, vels, dt) => window.__dev.convoy({ nowMs: window.__QNOW, movement: { [zone]: { vels, dt } } });
    // función PURA convoyCoherence(vels,minSpeed) SIN tocar el snapshot
    window.__probe = (vels, minSpeed) => window.__dev.convoy({ coherenceProbe: (minSpeed != null ? { vels, minSpeed } : { vels }) }).probe;
    window.__clear = () => window.__dev.convoy({ nowMs: window.__QNOW, clear: true });
    window.__at = (zone, elapsedSec) => window.__dev.convoy({ nowMs: window.__QNOW + (elapsedSec || 0) * 1000, toZone: zone });
    window.__vm = (zone) => window.__dev.convoy({ nowMs: window.__QNOW, toZone: zone });
    window.__pickIdx = (idx, march) => {
      window.__dev.convoy({ enabled: true });
      const zones = window.__dev.convoy().zones || [];
      const z = zones[idx]; if (!z) return null;
      window.__dev.convoy({ nowMs: window.__QNOW, clear: true });
      if (march != null) window.__dev.convoy({ nowMs: window.__QNOW, push: { [z]: { march, atMs: window.__QNOW } } });
      const s = window.__dev.convoy({ nowMs: window.__QNOW, toZone: z });
      return (s.zone === z && s.convoyable) ? { zone: z, march: s.march, tier: s.tier, boost: s.convoyMulRested } : null;
    };
  }, NOW);
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
  await toPlay(page); await installQA(page);
  return page;
}

const errors = [], net404 = [];
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
try {
  const page = await freshPage(browser, errors, net404, "p1");
  const build = await page.evaluate(() => window.__BUILD || null);
  const verBuild = await page.evaluate(async (live) => { try { const r = await fetch(live + "/version.json", { cache: "no-store" }); const j = await r.json(); return j.build; } catch (e) { return ""; } }, LIVE);

  // config servido (una vez) — 9 flags arco served + CONVOY_MARCH.enabled:true
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const servedTrue = en("CONVOY_MARCH") === "true";
  const arc = { CONGREGATION: en("CONGREGATION"), WAYFARER: en("WAYFARER_TRAIL"), PULSE: en("WORLD_PULSE"), SOUL: en("SOUL_RECOVERY"), DIVERSE: en("DIVERSE_COMPANY"), LONG_WATCH: en("LONG_WATCH"), FRONTIER: en("FRONTIER_SPREAD"), INFLUX: en("INFLUX_SURGE"), BATTLE_SYNC: en("BATTLE_SYNC") };
  const arcTrue = Object.values(arc).every((v) => v === "true");

  // 1 boot LIMPIO LIVE + hooks + build self-consistent vs version.json + AVANZÓ de pre-flip + served CONVOY_MARCH.enabled:true + arco 0-regr + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.convoy && window.__dev.sync && window.__dev.influx && window.__dev.frontier && window.__dev.standings && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.longWatch && window.__dev.territory && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build self-consistent vs version.json + AVANZÓ de pre-flip; __dev.convoy + arc hooks; served CONVOY_MARCH.enabled:true + 9 flags del arco true (0 regr); 0 err/404",
     hooks && build === verBuild && !!build && build !== PREFLIP && servedTrue && arcTrue && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} preflip=${PREFLIP} CONVOY_MARCH=${en("CONVOY_MARCH")} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 DEFAULT-ON desde config servido + byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.convoy(); return { enabled: s.enabled, mul: s.convoyMulRested, tier: s.tier, march: s.march }; });
  const byteId = await page.evaluate(() => {
    window.__dev.convoy({ enabled: false, leave: true });
    const s = window.__dev.convoy();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(4242));
    window.__dev.convoy({ enabled: false });
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(4242));
    window.__dev.convoy({ enabled: true });                                          // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.convoyMulRested, tag: s.tag, tier: s.tier, saveNoKey: !/["']convoy/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON desde config servido: convoy().enabled===true (flip cargó) + passive 0 sin march; byte-id OFF (toggle): enabled false ⇒ mul 0 + tag \"\" + save SIN clave convoy + fingerprint byte-estable",
     dOn.enabled === true && dOn.mul === 0 && dOn.tier === 0 && dOn.march === 0 &&
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.tier === 0 && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installQA(page);   // re-instala tras el toggle (idempotente)

  // 3 ★ COHERENCIA = función PURA (convoyCoherence vía coherenceProbe). Casos borde byte-verificables del EJE VECTORIAL.
  const coh = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const minSpeed = window.__dev.convoy().minSpeed;
    const P = (vels, ms) => { const r = window.__probe(vels, ms); return { movers: r.movers, c: r.c }; };
    return {
      minSpeed,
      same3: P([{ vx: 0.6, vy: 0.8 }, { vx: 0.6, vy: 0.8 }, { vx: 0.6, vy: 0.8 }]),  // 3 mismo rumbo ⇒ c=1 / movers 3
      anti2: P([{ vx: 0.6, vy: 0.8 }, { vx: -0.6, vy: -0.8 }]),                       // 2 opuestos ⇒ c=0 / movers 2
      still4: P([{ vx: 0, vy: 0 }, { vx: 0, vy: 0 }, { vx: 0, vy: 0 }, { vx: 0, vy: 0 }]), // 4 quietos ⇒ movers 0 / c 0
      slow: P([{ vx: 0.3, vy: 0 }, { vx: 0, vy: 0.2 }], 0.5),                         // ambos bajo minSpeed(0.5) ⇒ movers 0
      ortho: P([{ vx: 1, vy: 0 }, { vx: 0, vy: 1 }]),                                 // ortogonales ⇒ c≈0.7071 / movers 2
    };
  });
  const cohOk = coh.minSpeed === 0.5 &&
    coh.same3.movers === 3 && near(coh.same3.c, 1) &&
    coh.anti2.movers === 2 && near(coh.anti2.c, 0) &&
    coh.still4.movers === 0 && near(coh.still4.c, 0) &&
    coh.slow.movers === 0 &&
    coh.ortho.movers === 2 && near(coh.ortho.c, 0.70710678, 1e-5);
  ok("3 ★ COHERENCIA PURA (convoyCoherence): 3 mismo-rumbo⇒c=1/movers3; 2 opuestos⇒c=0/movers2; 4 QUIETOS⇒movers0/c0; bajo-minSpeed(0.5)⇒movers0; ortogonal (1,0)+(0,1)⇒c≈0.7071/movers2",
     cohOk, JSON.stringify(coh));

  // 4 TABLA tier/boost = función PURA del MARCH (vía push): <2⇒T0; 2⇒T1(0.05); 4⇒T2(0.10); 6⇒T3(0.15); 8⇒T3. Monótona, sin histéresis.
  const tab = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const z = window.__dev.convoy().zones[0];
    const out = [];
    for (const m of [1, 2, 4, 6, 8]) {
      window.__clear(); window.__push(z, m, window.__QNOW);
      const vm = window.__vm(z); out.push({ m, march: vm.march, tier: vm.tier, boost: vm.convoyMulRested });
    }
    return out;
  });
  const eT = { 1: 0, 2: 1, 4: 2, 6: 3, 8: 3 };
  const eB = { 1: 0, 2: 0.05, 4: 0.10, 6: 0.15, 8: 0.15 };
  const tabOk = tab.every(r => near(r.march, r.m) && r.tier === eT[r.m] && near(r.boost, eB[r.m]));
  ok("4 TABLA tier/boost PURA del march: 1→T0/0; 2→T1/0.05; 4→T2/0.10; 6→T3/0.15; 8→T3/0.15 (monótona, sin histéresis)",
     tabOk, JSON.stringify(tab));

  // 5 ★ ACUMULADOR sostenido = función del MOVIMIENTO (driver movement): convoy coherente (3 mismo rumbo) dt=3 ⇒ march 3 (T1); dt=6 ⇒ march 6 (T3).
  const accr = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const z = window.__dev.convoy().zones[0];
    window.__clear(); window.__move(z, [{ vx: 0.6, vy: 0.8 }, { vx: 0.6, vy: 0.8 }, { vx: 0.6, vy: 0.8 }], 3);
    const s3 = window.__vm(z);
    window.__clear(); window.__move(z, [{ vx: 0.6, vy: 0.8 }, { vx: 0.6, vy: 0.8 }, { vx: 0.6, vy: 0.8 }], 6);
    const s6 = window.__vm(z);
    return { m3: s3.march, t3: s3.tier, m6: s6.march, t6: s6.tier };
  });
  ok("5 ★ ACUMULADOR PURA del movimiento (accruePerSec·dt): 3 movers coherentes dt=3⇒march 3/T1; dt=6⇒march 6/T3",
     near(accr.m3, 3) && accr.t3 === 1 && near(accr.m6, 6) && accr.t6 === 3, JSON.stringify(accr));

  // 6 ★ DIFERENCIADOR quietos/opuestos/solo vs convoy (driver movement, dt=6):
  const diff = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const z = window.__dev.convoy().zones[0];
    window.__clear(); window.__move(z, Array.from({ length: 8 }, () => ({ vx: 0, vy: 0 })), 6);
    const s = window.__dev.convoy({ nowMs: window.__QNOW, toZone: z }); const still8 = { march: s.march, tier: s.tier, mul: s.convoyMulRested };
    window.__clear();
    window.__move(z, [...Array.from({ length: 4 }, () => ({ vx: 0.6, vy: 0.8 })), ...Array.from({ length: 4 }, () => ({ vx: -0.6, vy: -0.8 }))], 6);
    const o = window.__dev.convoy({ nowMs: window.__QNOW, toZone: z }); const opp8 = { march: o.march, tier: o.tier, mul: o.convoyMulRested };
    window.__clear(); window.__move(z, [{ vx: 0.6, vy: 0.8 }], 6);
    const l = window.__dev.convoy({ nowMs: window.__QNOW, toZone: z }); const solo1 = { march: l.march, tier: l.tier, mul: l.convoyMulRested };
    window.__clear(); window.__move(z, [{ vx: 0.6, vy: 0.8 }, { vx: 0.6, vy: 0.8 }, { vx: 0.6, vy: 0.8 }], 6);
    const c = window.__dev.convoy({ nowMs: window.__QNOW, toZone: z }); const conv3 = { march: c.march, tier: c.tier, mul: c.convoyMulRested };
    return { still8, opp8, solo1, conv3, minMovers: window.__dev.convoy().minMovers, cThreshold: window.__dev.convoy().cThreshold };
  });
  ok("6 ★ DIFERENCIADOR (dt=6): 8 QUIETOS⇒march 0/T0/0 (≠Congregación headcount); 8 OPUESTOS (c≈0)⇒0; 1 solo (movers<K=3)⇒0; 3 rumbo común⇒march 6/T3/passive>0",
     near(diff.still8.march, 0) && diff.still8.tier === 0 && diff.still8.mul === 0 &&
     near(diff.opp8.march, 0) && diff.opp8.tier === 0 && diff.opp8.mul === 0 &&
     near(diff.solo1.march, 0) && diff.solo1.tier === 0 && diff.solo1.mul === 0 &&
     near(diff.conv3.march, 6) && diff.conv3.tier === 3 && diff.conv3.mul > 0 &&
     diff.minMovers === 3 && near(diff.cThreshold, 0.6), JSON.stringify(diff));

  // 7 ★ DECAY determinista 0-RNG por vida-media (march·0.5^(dt/halfLife)): push march 8 ⇒ +20s⇒4/T2; +40s⇒2/T1; +60s⇒1/T0.
  const decay = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const z = window.__dev.convoy().zones[0]; const hl = window.__dev.convoy().halfLifeSec;
    window.__clear(); window.__push(z, 8, window.__QNOW);
    const t0 = window.__at(z, 0), t1 = window.__at(z, hl), t2 = window.__at(z, hl * 2), t3 = window.__at(z, hl * 3);
    return { hl, m0: t0.march, r0: t0.tier, m1: t1.march, r1: t1.tier, m2: t2.march, r2: t2.tier, m3: t3.march, r3: t3.tier };
  });
  ok("7 ★ DECAY vida-media 0-RNG (hl=20s): march 8@0⇒8/T3; +20s⇒4/T2; +40s⇒2/T1; +60s⇒1/T0 (determinista, techo capMarch no interfiere)",
     decay.hl === 20 && near(decay.m0, 8) && decay.r0 === 3 && near(decay.m1, 4) && decay.r1 === 2 && near(decay.m2, 2) && decay.r2 === 1 && near(decay.m3, 1) && decay.r3 === 0, JSON.stringify(decay));

  // 8 server-authoritative reflect+validate: zona fuera de `zones` DESCARTADA; march ≤0 ⇒ no entra en el snapshot proyectado.
  const refl = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const z0 = window.__dev.convoy().zones[0];
    window.__clear();
    window.__dev.convoy({ nowMs: window.__QNOW, push: { [z0]: { march: 6, atMs: window.__QNOW }, nowhere_zone: { march: 6, atMs: window.__QNOW } } });
    const s = window.__vm(z0);
    const ghost = !!(s.marchMap && "nowhere_zone" in s.marchMap);
    window.__clear(); window.__dev.convoy({ nowMs: window.__QNOW, push: { [z0]: { march: -5, atMs: window.__QNOW } } });
    const neg = window.__vm(z0);
    return { valid: s.march, ghost, hasNeg: !!(neg.marchMap && z0 in neg.marchMap), negMarch: neg.march, negTier: neg.tier };
  });
  ok("8 SERVER-AUTHORITATIVE reflect+validate: zona válida march 6; zona fuera de `zones` NO entra en el snapshot; march negativo ⇒ descartado (march 0/T0)",
     near(refl.valid, 6) && refl.ghost === false && refl.hasNeg === false && near(refl.negMarch, 0) && refl.negTier === 0, JSON.stringify(refl));

  // 9 PASSIVE aislado + gainXP seam SERVIDO en sim.js live + byte-id pasivo OFF
  const simSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text(), LIVE);
  const seamWired = /function gainXP/.test(simSrc) && /convoyMul\(h,\s*"restedMult"\)/.test(simSrc);
  const pass = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const w = window.__pickIdx(0, 6); if (!w) return { bad: true };   // march 6 ⇒ T3/0.15
    const inz = window.__vm(w.zone);
    const out = window.__dev.convoy({ leave: true });
    window.__dev.convoy({ enabled: false });
    const off = window.__vm(w.zone);
    window.__dev.convoy({ enabled: true });
    return { inMul: inz.convoyMulRested, inTier: inz.tier, outMul: out.convoyMulRested, outTier: out.tier, offMul: off.convoyMulRested, offTag: off.tag, offEnabled: off.enabled };
  });
  ok("9 PASSIVE aislado (T3=0.15) + gainXP seam SERVIDO en sim.js live + byte-id OFF: in-zone⇒0.15/T3; leave⇒0/T0; enabled false⇒mul 0 AND tag \"\"",
     seamWired && !pass.bad && near(pass.inMul, 0.15) && pass.inTier === 3 && pass.outMul === 0 && pass.outTier === 0 && pass.offMul === 0 && pass.offTag === "" && pass.offEnabled === false,
     `wired=${seamWired} ${JSON.stringify(pass)}`);

  // 10 PRECEDENCIA MÁXIMO ÚNICO: MARCHA cede a CONGREGATION + WAYFARER + CONFLUENCIA + LONG_WATCH + FRONTIER + INFLUX + BATTLE_SYNC; coexiste con TERRITORY (⊥)
  const prec = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__pickIdx(0, 2); if (!w) return { bad: true };   // march 2 ⇒ T1/0.05
    const zone = w.zone; const set = () => window.__push(zone, 2, window.__QNOW);
    window.__clear(); set(); const base = window.__vm(zone).convoyMulRested;
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    window.__clear(); set(); const s1 = window.__vm(zone); window.__dev.congregation({ enabled: false });
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    window.__clear(); set(); const s2 = window.__vm(zone); window.__dev.wayfarer({ enabled: false });
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    window.__clear(); set(); const s3 = window.__vm(zone); window.__dev.confluence({ enabled: false });
    window.__dev.longWatch({ enabled: true }); window.__dev.longWatch({ nowMs: window.__QNOW, push: { [zone]: { streak: 90, atMs: window.__QNOW, present: 1 } } });
    window.__clear(); set(); const s4 = window.__vm(zone); window.__dev.longWatch({ enabled: false });
    window.__dev.frontier({ enabled: true }); window.__dev.frontier({ nowMs: window.__QNOW, push: { [zone]: { cover: 3, atMs: window.__QNOW } } });
    window.__clear(); set(); const s5 = window.__vm(zone); window.__dev.frontier({ enabled: false });
    window.__dev.influx({ enabled: true }); window.__dev.influx({ nowMs: window.__QNOW, push: { [zone]: { surge: 6, atMs: window.__QNOW } } });
    window.__clear(); set(); const s6 = window.__vm(zone); window.__dev.influx({ enabled: false });
    window.__dev.sync({ enabled: true }); window.__dev.sync({ nowMs: window.__QNOW, push: { [zone]: { a: window.__QNOW, b: window.__QNOW, c: window.__QNOW } } });
    window.__clear(); set(); const s7 = window.__vm(zone); const s7sync = window.__dev.sync({ nowMs: window.__QNOW, toZone: zone }); window.__dev.sync({ enabled: false });
    window.__clear(); set(); window.__dev.territory({ enabled: true }); const terr = window.__vm(zone).convoyMulRested; window.__dev.territory({ enabled: false });
    return { base, congPeer: s1.congMulRested, congCeded: s1.convoyMulRested, wayPeer: s2.wayfarerMulRested, wayCeded: s2.convoyMulRested,
      confPeer: s3.confMulRested, confCeded: s3.convoyMulRested, lwPeer: s4.longWatchMulRested, lwCeded: s4.convoyMulRested,
      frPeer: s5.frontierMulRested, frCeded: s5.convoyMulRested, inPeer: s6.influxMulRested, inCeded: s6.convoyMulRested,
      syPeer: s7sync.syncMulRested, syCeded: s7.convoyMulRested, terr };
  });
  ok("10 PRECEDENCIA MÁXIMO ÚNICO: MARCHA(0.05) CEDE a CONGREGATION AND WAYFARER AND CONFLUENCIA AND LONG_WATCH AND FRONTIER AND INFLUX AND BATTLE_SYNC (peer>0, convoy⇒0 cada uno); COEXISTE con TERRITORY(⊥)⇒0.05",
     !prec.bad && near(prec.base, 0.05) && prec.congPeer > 0 && prec.congCeded === 0 && prec.wayPeer > 0 && prec.wayCeded === 0 &&
     prec.confPeer > 0 && prec.confCeded === 0 && prec.lwPeer > 0 && prec.lwCeded === 0 && prec.frPeer > 0 && prec.frCeded === 0 &&
     prec.inPeer > 0 && prec.inCeded === 0 && prec.syPeer > 0 && prec.syCeded === 0 && near(prec.terr, 0.05), JSON.stringify(prec));

  // 11 ★ 0-REGRESIÓN LIVE: 9 arc flags served true + CONVOY_MARCH served true (re-read from served config)
  ok("11 ★ 0-REGRESIÓN LIVE: 9 flags del arco served true (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE/BATTLE_SYNC); CONVOY_MARCH served true",
     arcTrue && servedTrue, `CONVOY_MARCH=${en("CONVOY_MARCH")} arc=${JSON.stringify(arc)}`);

  // 12 ★ 6-zone coverage: cada zona hospeda una Marcha observable — march 6 ⇒ T3
  const covZ = await page.evaluate(() => {
    window.__dev.convoy({ enabled: true }); window.__iso();
    const zones = window.__dev.convoy().zones || []; const broken = [];
    for (const z of zones) {
      window.__clear(); window.__push(z, 6, window.__QNOW);
      const s = window.__dev.convoy({ nowMs: window.__QNOW, toZone: z });
      if (!(s.zone === z && s.convoyable && Math.abs(s.march - 6) < 1e-4 && s.tier === 3 && s.convoyMulRested > 0)) broken.push({ z, zone: s.zone, march: s.march, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("12 ★ COBERTURA 6 zonas (march 6): cada zona hospeda Marcha observable T3 broken=[]",
     covZ.n === 6 && covZ.broken.length === 0, `n=${covZ.n} broken=${JSON.stringify(covZ.broken)}`);

  // 13 render badge "Marcha" — instrument ctx.fillText (position-independent)
  await page.evaluate(() => {
    window.__ftCount = 0; const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) { const orig = proto.fillText;
      proto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Marcha") >= 0) window.__ftCount++; return orig.call(this, t, ...a); };
      proto.__ftPatched = true; }
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.convoy({ enabled: false }); window.__ftCount = 0; });
  await sleep(260);
  const ftOff = await page.evaluate(() => window.__ftCount);
  await page.evaluate(() => { window.__dev.convoy({ enabled: true }); const w = window.__pickIdx(0, 6); if (w) window.__vm(w.zone); window.__ftCount = 0; });
  await sleep(300);
  const ftOn = await page.evaluate(() => window.__ftCount);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("13 render badge 'Marcha' DIBUJA con ON (fillText>0) y NO con OFF (0) + fps≥55",
     ftOn > 0 && ftOff === 0 && fps >= 55, `ftOff=${ftOff} ftOn=${ftOn} fps=${fps}`);

  // 14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (zona idx2 no-forest, driver push): baseline 2/T1 → sostener 6/T3 → decaer +40s/T1. page2 abre AL FINAL (blur pausa page1).
  const page2 = await freshPage(browser, errors, net404, "p2");
  const w2 = await page2.evaluate(() => { window.__dev.convoy({ enabled: true }); window.__iso(); return window.__pickIdx(2, null); });
  const zone = w2 ? w2.zone : null;
  const north = zone ? await (async () => {
    const A = (fn, arg) => page.evaluate(fn, arg), B = (fn, arg) => page2.evaluate(fn, arg);
    const a0 = await A((a) => { window.__dev.convoy({ enabled: true }); window.__iso(); window.__clear(); window.__push(a.z, 2, window.__QNOW); return window.__vm(a.z); }, { z: zone });
    const b0 = await B((a) => { window.__clear(); window.__push(a.z, 2, window.__QNOW); return window.__vm(a.z); }, { z: zone });
    const aU = await A((a) => { window.__clear(); window.__push(a.z, 6, window.__QNOW); return window.__vm(a.z); }, { z: zone });
    const bU = await B((a) => { window.__clear(); window.__push(a.z, 6, window.__QNOW); return window.__vm(a.z); }, { z: zone });
    const aD = await A((a) => { window.__clear(); window.__push(a.z, 8, window.__QNOW); return window.__at(a.z, 40); }, { z: zone });
    const bD = await B((a) => { window.__clear(); window.__push(a.z, 8, window.__QNOW); return window.__at(a.z, 40); }, { z: zone });
    const aOut = await A(() => window.__dev.convoy({ leave: true }));
    const bAfter = await B((a) => { window.__clear(); window.__push(a.z, 6, window.__QNOW); return window.__vm(a.z); }, { z: zone });
    return { zone, aZ: a0.zone, bZ: b0.zone, a0: [a0.march, a0.tier, a0.convoyMulRested], b0: [b0.march, b0.tier, b0.convoyMulRested],
      aU: [aU.march, aU.tier, aU.convoyMulRested], bU: [bU.march, bU.tier, bU.convoyMulRested],
      aD: [aD.march, aD.tier, aD.convoyMulRested], bD: [bD.march, bD.tier, bD.convoyMulRested],
      aOut: [aOut.march, aOut.tier, aOut.convoyMulRested], bAfter: [bAfter.march, bAfter.tier, bAfter.convoyMulRested] };
  })() : { bad: true };
  const eq = (x, y) => x.length === y.length && x.every((v, i) => near(v, y[i]));
  const northOk = !north.bad && north.aZ === north.bZ && north.aZ === zone &&
    eq(north.a0, [2, 1, 0.05]) && eq(north.a0, north.b0) &&           // baseline T1 idéntico
    eq(north.aU, [6, 3, 0.15]) && eq(north.aU, north.bU) &&           // sostener T3 converge
    eq(north.aD, [2, 1, 0.05]) && eq(north.aD, north.bD) &&           // decaer +40s ⇒ T1 converge
    eq(north.aOut, [0, 0, 0]) &&                                       // A sale ⇒ Δ_A=0
    eq(north.bAfter, [6, 3, 0.15]);                                    // B server-authoritative + Δ_B intactos
  ok("14 ★ NORTH STAR CONVERGENCIA 2-CLIENTE LIVE (zona idx2 no-forest, driver push): baseline 2/T1, sostener 6/T3, decaer +40s/T1 ⇒ march/tier/buff IDÉNTICOS byte-a-byte; A sale⇒Δ_A=0 pero server-authoritative+Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));
  await page2.close();

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2360 QA POST-FLIP LIVE observable+2-cliente: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length}, 404 ${net404.length})`);
  if (errors.length) console.log("JS errors:\n" + errors.join("\n"));
  if (net404.length) console.log("404s:\n" + net404.join("\n"));
  ok("0 no JS errors / 0 relevant 404 during run", errors.length === 0 && net404.length === 0, `errors=${errors.length} 404=${net404.length}`);
} catch (e) {
  console.error("harness error:", e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
if (FAIL > 0) process.exitCode = 1;
