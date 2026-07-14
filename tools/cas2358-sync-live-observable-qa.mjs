// CAS-2358 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — SINCRONÍA DE BATALLA / BATTLE SYNCHRONY (BATTLE_SYNC.enabled:true LIVE). EVO mecánica #57.
// Gemelo LIVE de la DARK observable `tools/cas2355-sync-observable-qa.mjs` (16/16 ×2 PASS): MISMOS hechos, contra el build
// SERVIDO en gh-pages tras el flip CAS-2357 (`BATTLE_SYNC.enabled:false→true`, overlay 4-file consistent-HEAD, build ca76c70473c2).
// URL oficial de verificación = gh-pages `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (NO el mirror
// `.higgsfield.gg`, congelado por outage — ver CAS-412). El config servido DEBE mostrar BATTLE_SYNC.enabled:true; si aún DARK ⇒ FAIL check 1.
//
// Eje FRESCO = CORRELACIÓN / SIMULTANEIDAD de gestas de combate. El server marca, por zona, el instante de la ÚLTIMA gesta (kill —
// REUSA el contador monótono h.kills, SIN input.js) de cada jugador co-presente y empuja { zona → { id → últimoKillMs } }; el cliente
// REFLEJA + PROYECTA al `now` compartido contando cuántos ids DISTINTOS caen en la ventana deslizante [now−windowMs, now].
// Ortogonal a headcount #51 / footfall #52 / composición #53 / continuidad #54 / dispersión #55 / afluencia/flujo #56 / nivel #48.
// Umbrales 2/3/4 → tiers → restedMult 0.05/0.10/0.15. Passive COMPARTIDO server-authoritative ⇒ byte-idéntico entre clientes (desync = sev-1).
//
// ★ DIFERENCIADORES (ortogonalidad):
//   (a) vs #51 Congregación (headcount): N presentes pero INACTIVOS (kills viejos fuera de ventana) ⇒ syncCount 0 ⇒ NO abre.
//   (b) vs #56 Afluencia (flujo): distinct-players, no kill-count (mismo id 2 kills ⇒ 1).
//   (c) vs correlación temporal: 2 ids que matan en ventanas SEPARADAS ⇒ en cualquier `now` sólo 1 cae ⇒ NO abre.
//   (d) vs solo: 1 jugador solo matando ⇒ count 1 ⇒ NO abre (requiere ≥2 DISTINTOS).
// ★ DECAY = expiración de la VENTANA DESLIZANTE (0 RNG): una gesta más vieja que windowSec deja de contar (decay determinista).
// ★ NORTH STAR = CONVERGENCIA 2-CLIENTE REAL LIVE: 2 páginas puppeteer contra gh-pages, MISMO snapshot de kills+reloj ⇒
//   count/tier/buff idénticos byte-a-byte; subir tier / expirar la ventana CONVERGEN; A sale ⇒ Δ_A=0 pero server-authoritative + Δ_B INTACTOS.
// Precedencia MÁXIMO ÚNICO: BATTLE_SYNC es la MÁS BAJA (12ª/última) del canal restedMult ⇒ CEDE a standings/mentor/soul/pulse/cong/wayfarer/conf/longWatch/frontier/influx; territory(safeRegen) ⊥ coexiste.
//
// Difs vs la DARK (post-flip LIVE): (1) check 1 = build servido AVANZÓ de pre-flip `4f8028979f1c` (EVO#56 INFLUX flip) + version.json
// self-consistent + BATTLE_SYNC.enabled:true served + 8 flags del arco served true (0-regr) + 0 err/404; (2) check 2 = DEFAULT-ON (boot
// fresco 0 __dev ⇒ sync().enabled===true cargó del config servido) + byte-id OFF vía TOGGLE (save-SIN-clave + fingerprint estable).
// Run: node tools/cas2358-sync-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2358-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PREFLIP = "4f8028979f1c";          // build servido ANTES del flip (EVO#56 INFLUX flip live CAS-2353) — el LIVE debe AVANZAR de este
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

const NOW = 9_300_000;   // reloj de pared FIJO COMPARTIDO (ms), distinto del DARK (9_000_000) ⇒ proyección determinista byte-a-byte entre ambos clientes
async function installQA(page) {
  await page.evaluate((NOW) => {
    window.__QNOW = NOW;
    // flippa OFF in-memory a los 11 peers DEFAULT-ON del canal restedMult (arco LIVE) — para medir Sincronía AISLADA
    window.__iso = () => { for (const k of ["standings","mentor","soul","pulse","congregation","wayfarer","confluence","longWatch","frontier","influx"]) { try { window.__dev[k]({ enabled: false }); } catch (e) {} } };
    // server EMPUJA el snapshot crudo { id → últimoKillMs }
    window.__push = (zone, marks) => window.__dev.sync({ nowMs: window.__QNOW, push: { [zone]: marks } });
    // server registra la GESTA (kill) de cada id en la zona a `atMs` (default = reloj compartido) — driver NATURAL
    window.__kills = (zone, ids, atMs) => window.__dev.sync({ nowMs: window.__QNOW, kills: { [zone]: { ids, atMs: (atMs != null ? atMs : window.__QNOW) } } });
    window.__clear = () => window.__dev.sync({ nowMs: window.__QNOW, clear: true });
    window.__at = (zone, elapsedSec) => window.__dev.sync({ nowMs: window.__QNOW + (elapsedSec || 0) * 1000, toZone: zone });
    window.__vm = (zone) => window.__dev.sync({ nowMs: window.__QNOW, toZone: zone });
    window.__pickIdx = (idx, ids) => {
      window.__dev.sync({ enabled: true });
      const zones = window.__dev.sync().zones || [];
      const z = zones[idx]; if (!z) return null;
      window.__dev.sync({ nowMs: window.__QNOW, clear: true });
      if (ids && ids.length) window.__dev.sync({ nowMs: window.__QNOW, kills: { [z]: { ids, atMs: window.__QNOW } } });
      const s = window.__dev.sync({ nowMs: window.__QNOW, toZone: z });
      return (s.zone === z && s.syncable) ? { zone: z, count: s.count, tier: s.tier, boost: s.syncMulRested } : null;
    };
    window.__pick = (ids) => window.__pickIdx(0, ids);
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

  // config servido (una vez) — 8 flags arco served + BATTLE_SYNC.enabled:true
  const cfgSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/config.js", { cache: "no-store" })).text(), LIVE);
  const en = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
  const servedTrue = en("BATTLE_SYNC") === "true";
  const arc = { CONGREGATION: en("CONGREGATION"), WAYFARER: en("WAYFARER_TRAIL"), PULSE: en("WORLD_PULSE"), SOUL: en("SOUL_RECOVERY"), DIVERSE: en("DIVERSE_COMPANY"), LONG_WATCH: en("LONG_WATCH"), FRONTIER: en("FRONTIER_SPREAD"), INFLUX: en("INFLUX_SURGE") };
  const arcTrue = Object.values(arc).every((v) => v === "true");

  // 1 boot LIMPIO LIVE + hooks + build self-consistent vs version.json + AVANZÓ de pre-flip + served BATTLE_SYNC.enabled:true + arco 0-regr + 0 err/404
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.sync && window.__dev.influx && window.__dev.frontier && window.__dev.standings && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.longWatch && window.__dev.territory && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build self-consistent vs version.json + AVANZÓ de pre-flip; __dev.sync + arc hooks; served BATTLE_SYNC.enabled:true + 8 flags del arco true (0 regr); 0 err/404",
     hooks && build === verBuild && !!build && build !== PREFLIP && servedTrue && arcTrue && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} preflip=${PREFLIP} BATTLE_SYNC=${en("BATTLE_SYNC")} arc=${JSON.stringify(arc)} err=${errors.length} 404=${net404.length}`);

  // 2 DEFAULT-ON desde config servido + byte-id OFF vía TOGGLE
  const dOn = await page.evaluate(() => { const s = window.__dev.sync(); return { enabled: s.enabled, mul: s.syncMulRested, tier: s.tier, count: s.count }; });
  const byteId = await page.evaluate(() => {
    window.__dev.sync({ enabled: false, leave: true });
    const s = window.__dev.sync();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fp1 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.sync({ enabled: false });
    const fp2 = JSON.stringify(window.__dev.worldFingerprint(321));
    window.__dev.sync({ enabled: true });                                          // restaura ON (DEFAULT-ON servido)
    return { enabled: s.enabled, mul: s.syncMulRested, tag: s.tag, tier: s.tier, saveNoKey: !/["']sync/i.test(saveOff) && !/syncAt/i.test(saveOff), fpMatch: fp1 === fp2 };
  });
  ok("2 DEFAULT-ON desde config servido: sync().enabled===true (flip cargó) + passive 0 sin kills; byte-id OFF (toggle): enabled false ⇒ mul 0 + tag \"\" + save SIN clave sync/syncAt + fingerprint byte-estable",
     dOn.enabled === true && dOn.mul === 0 && dOn.tier === 0 && dOn.count === 0 &&
     byteId.enabled === false && byteId.mul === 0 && byteId.tag === "" && byteId.tier === 0 && byteId.saveNoKey && byteId.fpMatch,
     `dOn=${JSON.stringify(dOn)} byteId=${JSON.stringify(byteId)}`);

  await installQA(page);   // re-instala tras el toggle (idempotente)

  // 3 ★ syncCount = función PURA de la ventana deslizante (ids DISTINTOS en [now−windowMs, now]). Casos borde byte-verificables.
  const cnt = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const z = window.__dev.sync().zones[0];
    const winMs = (window.__dev.sync().windowSec | 0) * 1000;
    const read = (marks, atSec) => { window.__clear(); window.__push(z, marks); return window.__at(z, atSec || 0).count; };
    return {
      winMs,
      trio: read({ a: window.__QNOW, b: window.__QNOW, c: window.__QNOW }, 0),           // 3 distintos matando a la vez ⇒ 3
      dup: read({ a: window.__QNOW }, 0),                                                // 1 solo (marca única) ⇒ 1
      inactive: read({ a: window.__QNOW - 10000, b: window.__QNOW - 8000, c: window.__QNOW - 9000, d: window.__QNOW - 7000 }, 0), // 4 con kills VIEJOS (>5s) ⇒ 0
      edgeIn: read({ a: window.__QNOW - 5000 }, 0),                                      // dt=5000 == windowMs ⇒ borde INCLUSIVO ⇒ 1
      edgeOut: read({ a: window.__QNOW - 5001 }, 0),                                     // dt=5001 > windowMs ⇒ EXPIRADA ⇒ 0
      future: read({ a: window.__QNOW, b: window.__QNOW + 3000 }, 0),                    // b en el futuro (dt<0) ⇒ no cuenta ⇒ 1
    };
  });
  ok("3 ★ syncCount PURA ventana deslizante: 3-a-la-vez⇒3; 1-solo⇒1; 4-INACTIVOS(kills viejos)⇒0; borde dt==5000⇒1 (inclusivo); dt>window⇒0 (expira); futuro(dt<0)⇒no-cuenta⇒1",
     cnt.winMs === 5000 && cnt.trio === 3 && cnt.dup === 1 && cnt.inactive === 0 && cnt.edgeIn === 1 && cnt.edgeOut === 0 && cnt.future === 1, JSON.stringify(cnt));

  // 4 TABLA tier/boost = función PURA del count: <2⇒T0; 2⇒T1(0.05); 3⇒T2(0.10); 4+⇒T3(0.15). Monótona, sin histéresis.
  const tab = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const z = window.__dev.sync().zones[0];
    const out = [];
    for (const n of [1, 2, 3, 4, 7]) {
      window.__clear(); window.__kills(z, Array.from({ length: n }, (_, i) => "k" + i), window.__QNOW);
      const vm = window.__vm(z); out.push({ n, count: vm.count, tier: vm.tier, boost: vm.syncMulRested });
    }
    return out;
  });
  const eT = { 1: 0, 2: 1, 3: 2, 4: 3, 7: 3 };
  const eB = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 7: 0.15 };
  const tabOk = tab.every(r => r.count === r.n && r.tier === eT[r.n] && near(r.boost, eB[r.n]));
  ok("4 TABLA tier/boost PURA del count (driver kills): 1→T0/0; 2→T1/0.05; 3→T2/0.10; 4→T3/0.15; 7→T3/0.15 (monótona)",
     tabOk, JSON.stringify(tab));

  // 5 ★ DIFERENCIADOR (a)/(b): N INACTIVOS ⇒ 0 (NO abre, ≠ Congregación headcount); mismo id 2 kills ⇒ 1 (no kill-count); 3 distintos juntos ⇒ T2
  const diff = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const z = window.__dev.sync().zones[0];
    window.__clear(); window.__push(z, { a: window.__QNOW - 20000, b: window.__QNOW - 18000, c: window.__QNOW - 15000, d: window.__QNOW - 12000, e: window.__QNOW - 30000 });
    const inact = window.__vm(z);
    window.__clear(); window.__kills(z, ["solo"], window.__QNOW); window.__kills(z, ["solo"], window.__QNOW);
    const soloDup = window.__vm(z);
    window.__clear(); window.__kills(z, ["x", "y", "w"], window.__QNOW);
    const trio = window.__vm(z);
    return { inCount: inact.count, inTier: inact.tier, inMul: inact.syncMulRested, inMarks: inact.marksMap ? Object.keys(inact.marksMap[z] || {}).length : 0,
      soloCount: soloDup.count, soloTier: soloDup.tier, trioCount: trio.count, trioTier: trio.tier, trioMul: trio.syncMulRested };
  });
  ok("5 ★ DIFERENCIADOR: 5 presentes INACTIVOS (headcount 5, kills viejos) ⇒ syncCount 0 / tier 0 / passive 0 (NO abre, ≠ Congregación #51 / Afluencia #56); MISMO id 2 kills ⇒ 1 DISTINTO (NO abre); 3 distintos juntos ⇒ 3 / T2 / 0.10",
     diff.inCount === 0 && diff.inTier === 0 && diff.inMul === 0 && diff.inMarks === 5 && diff.soloCount === 1 && diff.soloTier === 0 && diff.trioCount === 3 && diff.trioTier === 2 && near(diff.trioMul, 0.10), JSON.stringify(diff));

  // 6 ★ DIFERENCIADOR (c) CORRELACIÓN temporal: 2 ids que matan en ventanas SEPARADAS (10s aparte) ⇒ máx synchrony 1 ⇒ NO abre
  const corr = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const z = window.__dev.sync().zones[0];
    window.__clear(); window.__push(z, { p1: window.__QNOW, p2: window.__QNOW + 10000 });
    const atA = window.__at(z, 0).count;    // now=NOW: p1 dt0 in, p2 futuro ⇒ 1
    const atMid = window.__at(z, 5).count;  // now=NOW+5000: p1 dt5000 borde in, p2 futuro ⇒ 1
    const atB = window.__at(z, 10).count;   // now=NOW+10000: p1 dt10000 out, p2 dt0 in ⇒ 1
    const atGap = window.__at(z, 7).count;  // now=NOW+7000: p1 dt7000 out, p2 futuro ⇒ 0 (hueco entre ventanas)
    window.__clear(); window.__push(z, { p1: window.__QNOW, p2: window.__QNOW });
    const together = window.__at(z, 0).count;
    return { atA, atMid, atB, atGap, together };
  });
  ok("6 ★ CORRELACIÓN temporal (no rate acumulado): 2 ids en ventanas SEPARADAS (10s aparte) ⇒ máx synchrony 1 en cualquier now (NOW⇒1, +5s⇒1, +10s⇒1, +7s hueco⇒0) ⇒ NO abre; los MISMOS 2 JUNTOS ⇒ 2 ⇒ abre",
     corr.atA === 1 && corr.atMid === 1 && corr.atB === 1 && corr.atGap === 0 && corr.together === 2, JSON.stringify(corr));

  // 7 ★ DECAY = expiración de la ventana deslizante (0 RNG). Kills escalonados ⇒ proyección al avanzar el reloj expira determinista.
  const decay = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const z = window.__dev.sync().zones[0];
    window.__clear(); window.__push(z, { p1: window.__QNOW, p2: window.__QNOW + 2000, p3: window.__QNOW + 4000, p4: window.__QNOW + 4000 });
    const t0 = window.__at(z, 4);      // p1 dt4000, p2 dt2000, p3/p4 dt0 ⇒ 4 (T3)
    const t1 = window.__at(z, 6);      // p1 out, p2 dt4000, p3/p4 dt2000 ⇒ 3 (T2)
    const t2 = window.__at(z, 8);      // p1/p2 out, p3/p4 dt4000 ⇒ 2 (T1)
    const t3 = window.__at(z, 9.001);  // TODAS > ventana ⇒ 0 (T0)
    return { c0: t0.count, r0: t0.tier, c1: t1.count, r1: t1.tier, c2: t2.count, r2: t2.tier, c3: t3.count, r3: t3.tier, m3: t3.syncMulRested };
  });
  ok("7 ★ DECAY expiración de ventana deslizante 0-RNG (kills escalonados): +4s⇒4/T3; +6s⇒3/T2; +8s⇒2/T1; +9.001s⇒0/T0 (todas expiran ⇒ sincronía cierra determinista)",
     decay.c0 === 4 && decay.r0 === 3 && decay.c1 === 3 && decay.r1 === 2 && decay.c2 === 2 && decay.r2 === 1 && decay.c3 === 0 && decay.r3 === 0 && decay.m3 === 0, JSON.stringify(decay));

  // 8 server-authoritative reflect+validate: zona fuera de `zones` DESCARTADA; kill de zona inválida ignorado
  const refl = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const z0 = window.__dev.sync().zones[0];
    window.__clear();
    window.__dev.sync({ nowMs: window.__QNOW, push: { [z0]: { a: window.__QNOW, b: window.__QNOW }, nowhere_zone: { z: window.__QNOW } } });
    const s = window.__vm(z0);
    const ghostCounts = !!(s.countMap && "nowhere_zone" in s.countMap);
    window.__dev.sync({ nowMs: window.__QNOW, kill: { zone: "nowhere_zone", id: "q", atMs: window.__QNOW } });
    const s2 = window.__vm(z0);
    return { valid: s.count, ghostCounts, validAfter: s2.count };
  });
  ok("8 SERVER-AUTHORITATIVE reflect+validate: zona válida cuenta 2 sincronizados; zona fuera de `zones` NO entra en el count proyectado; kill a zona inválida ignorado",
     refl.valid === 2 && refl.ghostCounts === false && refl.validAfter === 2, JSON.stringify(refl));

  // 9 PASSIVE aislado + gainXP seam SERVIDO en sim.js live + byte-id pasivo OFF
  const simSrc = await page.evaluate(async (live) => (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text(), LIVE);
  const seamWired = /function gainXP/.test(simSrc) && /syncMul\(h,\s*"restedMult"\)/.test(simSrc);
  const pass = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const w = window.__pick(["a", "b", "c"]); if (!w) return { bad: true };   // 3 distintos ⇒ T2/0.10
    const inz = window.__vm(w.zone);
    const out = window.__dev.sync({ leave: true });
    window.__dev.sync({ enabled: false });
    const off = window.__vm(w.zone);
    window.__dev.sync({ enabled: true });
    return { inMul: inz.syncMulRested, inTier: inz.tier, outMul: out.syncMulRested, outTier: out.tier, offMul: off.syncMulRested, offTag: off.tag, offEnabled: off.enabled };
  });
  ok("9 PASSIVE aislado (T2=0.10) + gainXP seam SERVIDO en sim.js live + byte-id OFF: in-zone⇒0.10/T2; leave⇒0/T0; enabled false⇒mul 0 AND tag \"\"",
     seamWired && !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && pass.outMul === 0 && pass.outTier === 0 && pass.offMul === 0 && pass.offTag === "" && pass.offEnabled === false,
     `wired=${seamWired} ${JSON.stringify(pass)}`);

  // 10 PRECEDENCIA MÁXIMO ÚNICO: SINCRONÍA cede a CONGREGATION + WAYFARER + CONFLUENCIA + LONG_WATCH + FRONTIER + INFLUX; coexiste con TERRITORY (⊥)
  const prec = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__pick(["a", "b"]); if (!w) return { bad: true };   // 2 distintos ⇒ T1/0.05
    const zone = w.zone; const set = () => window.__kills(zone, ["a", "b"], window.__QNOW);
    window.__clear(); set(); const base = window.__vm(zone).syncMulRested;
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
    window.__clear(); set(); window.__dev.territory({ enabled: true }); const terr = window.__vm(zone).syncMulRested; window.__dev.territory({ enabled: false });
    return { base, congPeer: s1.congMulRested, congCeded: s1.syncMulRested, wayPeer: s2.wayfarerMulRested, wayCeded: s2.syncMulRested,
      confPeer: s3.confMulRested, confCeded: s3.syncMulRested, lwPeer: s4.longWatchMulRested, lwCeded: s4.syncMulRested,
      frPeer: s5.frontierMulRested, frCeded: s5.syncMulRested, inPeer: s6.influxMulRested, inCeded: s6.syncMulRested, terr };
  });
  ok("10 PRECEDENCIA MÁXIMO ÚNICO: SINCRONÍA(0.05) CEDE a CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 AND FRONTIER⇒0 AND INFLUX⇒0 (peer>0 cada uno); COEXISTE con TERRITORY(⊥)⇒0.05",
     !prec.bad && near(prec.base, 0.05) && prec.congPeer > 0 && prec.congCeded === 0 && prec.wayPeer > 0 && prec.wayCeded === 0 &&
     prec.confPeer > 0 && prec.confCeded === 0 && prec.lwPeer > 0 && prec.lwCeded === 0 && prec.frPeer > 0 && prec.frCeded === 0 &&
     prec.inPeer > 0 && prec.inCeded === 0 && near(prec.terr, 0.05), JSON.stringify(prec));

  // 11 ★ 0-REGRESIÓN LIVE: 8 arc flags served true + BATTLE_SYNC served true (re-read from served config)
  ok("11 ★ 0-REGRESIÓN LIVE: 8 flags del arco served true (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD/INFLUX_SURGE); BATTLE_SYNC served true",
     arcTrue && servedTrue, `BATTLE_SYNC=${en("BATTLE_SYNC")} arc=${JSON.stringify(arc)}`);

  // 12 ★ 6-zone coverage: cada zona hospeda una Sincronía observable — 4 distintos matando juntos ⇒ T3
  const covZ = await page.evaluate(() => {
    window.__dev.sync({ enabled: true }); window.__iso();
    const zones = window.__dev.sync().zones || []; const broken = [];
    for (const z of zones) {
      window.__clear(); window.__kills(z, ["a", "b", "c", "d"], window.__QNOW);
      const s = window.__dev.sync({ nowMs: window.__QNOW, toZone: z });
      if (!(s.zone === z && s.syncable && s.count === 4 && s.tier === 3 && s.syncMulRested > 0)) broken.push({ z, zone: s.zone, count: s.count, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("12 ★ COBERTURA 6 zonas (4 distintos juntos): cada zona hospeda Sincronía observable count 4 ⇒ T3 broken=[]",
     covZ.n === 6 && covZ.broken.length === 0, `n=${covZ.n} broken=${JSON.stringify(covZ.broken)}`);

  // 13 render badge "Sincronía" — instrument ctx.fillText (position-independent)
  await page.evaluate(() => {
    window.__ftCount = 0; const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) { const orig = proto.fillText;
      proto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Sincronía") >= 0) window.__ftCount++; return orig.call(this, t, ...a); };
      proto.__ftPatched = true; }
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.sync({ enabled: false }); window.__ftCount = 0; });
  await sleep(260);
  const ftOff = await page.evaluate(() => window.__ftCount);
  await page.evaluate(() => { window.__dev.sync({ enabled: true }); const w = window.__pick(["a", "b", "c", "d"]); if (w) window.__vm(w.zone); window.__ftCount = 0; });
  await sleep(300);
  const ftOn = await page.evaluate(() => window.__ftCount);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("13 render badge 'Sincronía' DIBUJA con ON (fillText>0) y NO con OFF (0) + fps≥55",
     ftOn > 0 && ftOff === 0 && fps >= 55, `ftOff=${ftOff} ftOn=${ftOn} fps=${fps}`);

  // 14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (driver kills: baseline 2/T1 → subir 4/T3 → expirar ventana +9s/T0). page2 abre AL FINAL (blur pausa page1).
  const page2 = await freshPage(browser, errors, net404, "p2");
  const w2 = await page2.evaluate(() => { window.__dev.sync({ enabled: true }); window.__iso(); return window.__pickIdx(2, []); });
  const zone = w2 ? w2.zone : null;
  const MARK2 = { a: NOW, b: NOW };                    // 2 distintos a NOW ⇒ T1
  const MARK4 = { a: NOW, b: NOW, c: NOW, d: NOW };    // 4 distintos a NOW ⇒ T3
  const north = zone ? await (async () => {
    const A = (fn, arg) => page.evaluate(fn, arg), B = (fn, arg) => page2.evaluate(fn, arg);
    const a0 = await A((a) => { window.__dev.sync({ enabled: true }); window.__iso(); window.__clear(); window.__push(a.z, a.m); return window.__vm(a.z); }, { z: zone, m: MARK2 });
    const b0 = await B((a) => { window.__clear(); window.__push(a.z, a.m); return window.__vm(a.z); }, { z: zone, m: MARK2 });
    const aU = await A((a) => { window.__clear(); window.__push(a.z, a.m); return window.__vm(a.z); }, { z: zone, m: MARK4 });
    const bU = await B((a) => { window.__clear(); window.__push(a.z, a.m); return window.__vm(a.z); }, { z: zone, m: MARK4 });
    const aD = await A((a) => { window.__clear(); window.__push(a.z, a.m); return window.__at(a.z, 9); }, { z: zone, m: MARK4 });
    const bD = await B((a) => { window.__clear(); window.__push(a.z, a.m); return window.__at(a.z, 9); }, { z: zone, m: MARK4 });
    const aOut = await A(() => window.__dev.sync({ leave: true }));
    const bAfter = await B((a) => { window.__clear(); window.__push(a.z, a.m); return window.__vm(a.z); }, { z: zone, m: MARK4 });
    return { zone, aZ: a0.zone, bZ: b0.zone, a0: [a0.count, a0.tier, a0.syncMulRested], b0: [b0.count, b0.tier, b0.syncMulRested],
      aU: [aU.count, aU.tier, aU.syncMulRested], bU: [bU.count, bU.tier, bU.syncMulRested],
      aD: [aD.count, aD.tier, aD.syncMulRested], bD: [bD.count, bD.tier, bD.syncMulRested],
      aOut: [aOut.count, aOut.tier, aOut.syncMulRested], bAfter: [bAfter.count, bAfter.tier, bAfter.syncMulRested] };
  })() : { bad: true };
  const eq = (x, y) => x.length === y.length && x.every((v, i) => near(v, y[i]));
  const northOk = !north.bad && north.aZ === north.bZ && north.aZ === zone &&
    eq(north.a0, [2, 1, 0.05]) && eq(north.a0, north.b0) &&           // baseline T1 idéntico
    eq(north.aU, [4, 3, 0.15]) && eq(north.aU, north.bU) &&           // subir T3 converge
    eq(north.aD, [0, 0, 0]) && eq(north.aD, north.bD) &&              // expirar ventana ⇒ T0 converge
    eq(north.aOut, [0, 0, 0]) &&                                       // A sale ⇒ Δ_A=0
    eq(north.bAfter, [4, 3, 0.15]);                                    // B server-authoritative + Δ_B intactos
  ok("14 ★ NORTH STAR CONVERGENCIA 2-CLIENTE LIVE (zona idx2 no-forest, driver kills): baseline 2/T1, subir 4/T3, expirar ventana +9s/T0 ⇒ count/tier/buff IDÉNTICOS byte-a-byte; A sale⇒Δ_A=0 pero server-authoritative+Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));
  await page2.close();

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2358 QA POST-FLIP LIVE observable+2-cliente: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length}, 404 ${net404.length})`);
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
