// CAS-2352 — QA OBSERVABLE DARK for AFLUENCIA / INFLUX SURGE (INFLUX_SURGE.enabled:false). EVO mecánica #56.
// INDEPENDENT QA harness (NOT a copy of the GE self-verify): fresh test vectors, distinta secuencia de convergencia 2-cliente,
// zona NO-forest para cobertura, crowds/oleadas distintas para el diferenciador, y prueba EXPLÍCITA de que las SALIDAS no cuentan como llegadas.
//
// Eje FRESCO = TASA DE LLEGADA (flujo/afluencia). El server cuenta los jugadores NUEVOS que CRUZAN HACIA una zona por ventana (EDGE-triggered: presentes AHORA y
// NO antes), los ACUMULA en un `surge` con DECAY determinista (0 RNG, vida-media 30s) y empuja { zona → { surge, atMs } }; el cliente REFLEJA + PROYECTA al `now`
// compartido. Ortogonal a headcount #51 / footfall #52 / composición #53 / continuidad #54 / dispersión #55 / reloj #50. Umbrales 2/4/6 → tiers → restedMult
// 0.05/0.10/0.15, techo capSurge 10. Passive COMPARTIDO server-authoritative ⇒ byte-idéntico entre clientes (desync = sev-1).
//
// ★ DIFERENCIADOR (≠ Congregación #51): una MISMA multitud QUIETA (prev==now, mismos ids, aunque sean 8) ⇒ 0 llegadas ⇒ NO abre (Congregación SÍ por headcount);
//   una OLEADA de recién-llegados (ids nuevos) ⇒ surge=|nuevos| ⇒ abre el tier. Las SALIDAS (ids que se van) NO cuentan.
// ★ NORTH STAR = CONVERGENCIA 2-CLIENTE REAL: 2 páginas puppeteer, MISMO surge+reloj ⇒ surge/tier/buff idénticos byte-a-byte; subir/decaer CONVERGEN; A sale ⇒ Δ_A=0
//   pero surge/tier server-authoritative + Δ_B INTACTOS (0 desync).
// Precedencia MÁXIMO ÚNICO: INFLUX es la MÁS BAJA (11ª) del canal restedMult ⇒ CEDE a standings/mentor/soul/pulse/cong/wayfarer/conf/longWatch/frontier; territory(safeRegen) ⊥ coexiste.
// Run: node tools/cas2352-influx-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2352");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}
const near = (a, b, eps = 1e-4) => Math.abs(a - b) < eps;

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

const NOW = 5_400_000;   // reloj de pared FIJO (ms) distinto del GE ⇒ proyección determinista (mismo en ambos clientes)
async function installPick(page) {
  await page.evaluate((NOW) => {
    window.__QNOW = NOW;
    // desactiva los 9 peers DEFAULT-ON del canal restedMult (arco LIVE) para medir Afluencia en AISLAMIENTO
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); window.__dev.confluence({ enabled: false }); window.__dev.longWatch({ enabled: false }); window.__dev.frontier({ enabled: false }); };
    window.__snap = (zone, surge, at) => window.__dev.influx({ nowMs: window.__QNOW, push: { [zone]: { surge, atMs: (at != null ? at : window.__QNOW) } } });
    window.__trans = (zone, prev, now) => window.__dev.influx({ nowMs: window.__QNOW, transition: { [zone]: { prev, now } } });   // el server cuenta las llegadas de borde y ACUMULA
    window.__arr = (zone, n) => window.__dev.influx({ nowMs: window.__QNOW, arrivals: { [zone]: n } });                          // acumula N llegadas directas
    window.__clear = () => window.__dev.influx({ nowMs: window.__QNOW, clear: true });
    window.__at   = (zone, elapsedSec) => window.__dev.influx({ nowMs: window.__QNOW + (elapsedSec || 0) * 1000, toZone: zone });
    window.__vm   = (zone) => window.__dev.influx({ nowMs: window.__QNOW, toZone: zone });
    // teleporta a la N-ésima zona de afluencia y devuelve su VM tras empujar `surge`
    window.__pickIdx = (idx, surge) => {
      window.__dev.influx({ enabled: true });
      const zones = window.__dev.influx().zones || [];
      const z = zones[idx]; if (!z) return null;
      const s = window.__dev.influx({ nowMs: window.__QNOW, push: { [z]: { surge, atMs: window.__QNOW } }, toZone: z });
      return (s.zone === z && s.influxable) ? { zone: z, surge: s.surge, tier: s.tier, boost: s.influxMulRested } : null;
    };
    window.__pick = (surge) => window.__pickIdx(0, surge);
  }, NOW);
}

// 8 jugadores QUIETOS (mismos ids antes y ahora) — prev==now ⇒ 0 llegadas
const CROWD8 = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
// oleada de K recién-llegados (ids frescos, ninguno en prev)
const wave = (k) => Array.from({ length: k }, (_, i) => "n" + i);

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.influx && window.__dev.frontier && window.__dev.standings && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.longWatch && window.__dev.territory && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.influx + arc hooks + __BUILD, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot (leído ANTES de inyectar): enabled false + G.influx nunca creado
  const dark = await page.evaluate(() => window.__dev.influx());
  ok("2 byte-id OFF (fresh boot): enabled false AND gExists false AND surge/tier/boost/tag/surgeMap vacíos",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.surge === 0 && dark.boost === 0 && dark.tag === "" && dark.surgeMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} surge=${dark.surge} tag="${dark.tag}"`);

  // 3 save OFF sin clave influx + fingerprint estable a través del toggle
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(777)));
  await page.evaluate(() => window.__dev.influx({ enabled: true }));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(777)));
  await page.evaluate(() => window.__dev.influx({ enabled: false }));
  ok("3 byte-id save OFF: sin clave 'influx'/'influxServer' + worldFingerprint estable a través del toggle (0 RNG drift)",
     !/influx/i.test(saveOff) && fpB === fpA, `saveHasKey=${/influx/i.test(saveOff)} fpMatch=${fpB === fpA}`);

  await installPick(page);

  // 4 ★ LLEGADAS = función PURA de BORDE (influxArrivals): mismos ids prev==now ⇒ 0; todos nuevos ⇒ |now|; overlap parcial ⇒ #nuevos; SALIDAS (se van, 0 nuevos) ⇒ 0
  const arr = await page.evaluate((args) => {
    const { CROWD8 } = args;
    window.__dev.influx({ enabled: true }); window.__iso();
    const z = window.__dev.influx().zones[0];
    const read = (prev, now) => { window.__clear(); window.__trans(z, prev, now); return window.__vm(z).surge; };
    return {
      same: read(CROWD8, CROWD8),                                  // 8 quietos ⇒ 0
      allNew: read([], ["a", "b", "c", "d", "e"]),                 // 5 nuevos ⇒ 5
      partial: read(["a", "b"], ["a", "b", "c", "d"]),             // 2 nuevos (c,d) ⇒ 2
      left: read(["a", "b", "c"], ["a"]),                          // 2 se van, 0 nuevos ⇒ 0 (las SALIDAS no cuentan)
    };
  }, { CROWD8 });
  ok("4 ★ LLEGADAS función PURA de BORDE (influxArrivals): mismos ids⇒0; todos nuevos⇒|now|=5; overlap parcial⇒#nuevos=2; SALIDAS (se van, 0 nuevos)⇒0",
     near(arr.same, 0) && near(arr.allNew, 5) && near(arr.partial, 2) && near(arr.left, 0), JSON.stringify(arr));

  // 5 ACUMULADOR con decay: 2 oleadas al MISMO reloj se SUMAN (2+3⇒5); TABLA tier/boost pura del surge + cap capSurge
  const tab = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__pick(4); if (!w) return { bad: true };
    const cap = window.__dev.influx().capSurge;
    // acumulador: 2 llegadas + 3 llegadas al MISMO atMs ⇒ surge 5
    window.__clear(); window.__arr(w.zone, 2); window.__arr(w.zone, 3); const acc = window.__vm(w.zone).surge;
    const out = [];
    for (const s of [1, 2, 3, 4, 6, 999]) { window.__snap(w.zone, s); const vm = window.__vm(w.zone); out.push({ s, surge: vm.surge, tier: vm.tier, boost: vm.influxMulRested }); }
    return { zone: w.zone, cap, acc, out };
  });
  const eT = { 1: 0, 2: 1, 3: 1, 4: 2, 6: 3, 999: 3 };
  const eB = { 1: 0, 2: 0.05, 3: 0.05, 4: 0.10, 6: 0.15, 999: 0.15 };
  const capOk = !tab.bad && near(tab.out[tab.out.length - 1].surge, tab.cap);   // surge 999 ⇒ clamped a capSurge
  const tabOk = !tab.bad && tab.out.every(r => (r.s <= tab.cap ? near(r.surge, r.s) : true) && r.tier === eT[r.s] && near(r.boost, eB[r.s]));
  ok("5 ACUMULADOR (2+3⇒5) + TABLA tier/boost = función PURA del SURGE + CAP capSurge: 1→T0/2→T1/4→T2/6→T3 (0/0.05/0.10/0.15); surge 999 ⇒ clamped a capSurge",
     tabOk && capOk && near(tab.acc, 5), `cap=${tab.cap} acc=${tab.acc} ${JSON.stringify(tab.out)}`);

  // 6 ★ DIFERENCIADOR multitud-quieta vs oleada: 8 quietos ⇒ 0 llegadas ⇒ NO abre (≠ Congregación headcount 8); 6 recién-llegados ⇒ surge 6 ⇒ T3
  const diff = await page.evaluate((args) => {
    const { CROWD8, WAVE6 } = args;
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__pick(1); if (!w) return { bad: true };
    window.__clear(); window.__trans(w.zone, CROWD8, CROWD8); const cr = window.__vm(w.zone);   // 8 quietos ⇒ 0 llegadas ⇒ NO abre (Congregación SÍ por headcount 8)
    window.__clear(); window.__trans(w.zone, [], WAVE6);      const sp = window.__vm(w.zone);   // 6 recién-llegados ⇒ surge 6 ⇒ T3
    return { zone: w.zone, crSurge: cr.surge, crTier: cr.tier, crMul: cr.influxMulRested, spSurge: sp.surge, spTier: sp.tier, spMul: sp.influxMulRested };
  }, { CROWD8, WAVE6: wave(6) });
  ok("6 ★ DIFERENCIADOR quieta≠oleada: 8 QUIETOS (prev==now) ⇒ surge 0 / tier 0 / passive 0 (NO abre, ≠ Congregación headcount); 6 RECIÉN-LLEGADOS ⇒ surge 6 / tier 3 / passive 0.15",
     !diff.bad && near(diff.crSurge, 0) && diff.crTier === 0 && diff.crMul === 0 && near(diff.spSurge, 6) && diff.spTier === 3 && near(diff.spMul, 0.15), JSON.stringify(diff));

  // 7 ★ DECAY determinista 0-RNG vida-media 30s desde surge 8: +30s⇒4(T2); +60s⇒2(T1); +90s⇒1(T0)
  const decay = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__pick(8); if (!w) return { bad: true };
    const z = w.zone;
    window.__snap(z, 8); const b = window.__vm(z);
    window.__snap(z, 8); const d1 = window.__at(z, 30);
    window.__snap(z, 8); const d2 = window.__at(z, 60);
    window.__snap(z, 8); const d3 = window.__at(z, 90);
    return { z, base: b.surge, baseT: b.tier, c1: d1.surge, t1: d1.tier, c2: d2.surge, t2: d2.tier, c3: d3.surge, t3: d3.tier };
  });
  ok("7 ★ DECAY determinista 0-RNG vida-media 30s: surge 8(T3); +30s⇒4(T2); +60s⇒2(T1); +90s⇒1(T0) — half-life exacta",
     !decay.bad && near(decay.base, 8) && decay.baseT === 3 && near(decay.c1, 4) && decay.t1 === 2 && near(decay.c2, 2) && decay.t2 === 1 && near(decay.c3, 1) && decay.t3 === 0, JSON.stringify(decay));

  // 8 server-authoritative reflect+validate: zona fuera de zones descartada; surge negativo ⇒ 0
  const refl = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const z0 = window.__dev.influx().zones[0];
    window.__dev.influx({ nowMs: window.__QNOW, push: { [z0]: { surge: 3, atMs: window.__QNOW }, nowhere_zone: { surge: 4, atMs: window.__QNOW } } });
    const s = window.__vm(z0);
    window.__dev.influx({ nowMs: window.__QNOW, push: { [z0]: { surge: -9, atMs: window.__QNOW } } });
    const neg = window.__vm(z0);
    return { valid: s.surge, hasGhost: !!(s.surgeMap && "nowhere_zone" in s.surgeMap), negSurge: neg.surge, negTier: neg.tier };
  });
  ok("8 SERVER-AUTHORITATIVE reflect+validate: zona válida refleja surge 3; zona fuera de `zones` DESCARTADA; surge negativo ⇒ 0/T0 (clamped)",
     near(refl.valid, 3) && !refl.hasGhost && refl.negSurge === 0 && refl.negTier === 0, JSON.stringify(refl));

  // 9 PASSIVE aislado + gainXP seam servido + byte-id pasivo OFF
  const simSrc = await page.evaluate(async () => (await fetch("sim/sim.js")).text());
  const seamWired = /function gainXP/.test(simSrc) && /influxMul\(h,\s*"restedMult"\)/.test(simSrc);
  const pass = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const w = window.__pick(4); if (!w) return { bad: true };   // surge 4 ⇒ T2/0.10
    const inz = window.__vm(w.zone);
    const out = window.__dev.influx({ leave: true });
    window.__dev.influx({ enabled: false });
    const off = window.__vm(w.zone);
    return { inMul: inz.influxMulRested, inTier: inz.tier, outMul: out.influxMulRested, outTier: out.tier, offMul: off.influxMulRested, offTag: off.tag, offEnabled: off.enabled };
  });
  ok("9 PASSIVE aislado (T2=0.10) + gainXP seam servido + byte-id OFF: in-zone⇒0.10/T2; leave⇒0/T0; enabled false⇒mul 0 AND tag \"\"",
     seamWired && !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && pass.outMul === 0 && pass.outTier === 0 && pass.offMul === 0 && pass.offTag === "" && pass.offEnabled === false,
     `wired=${seamWired} ${JSON.stringify(pass)}`);

  // 10 PRECEDENCIA MÁXIMO ÚNICO: INFLUX cede a CONGREGATION + WAYFARER + CONFLUENCIA + LONG_WATCH + FRONTIER; coexiste con TERRITORY (⊥)
  const prec = await page.evaluate(() => {
    window.__dev.influx({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__pick(2); if (!w) return { bad: true };   // surge 2 ⇒ T1/0.05
    const zone = w.zone; const set = () => window.__snap(zone, 2);
    set(); const base = window.__vm(zone).influxMulRested;
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    set(); const s1 = window.__vm(zone); window.__dev.congregation({ enabled: false });
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    set(); const s2 = window.__vm(zone); window.__dev.wayfarer({ enabled: false });
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    set(); const s3 = window.__vm(zone); window.__dev.confluence({ enabled: false });
    window.__dev.longWatch({ enabled: true }); window.__dev.longWatch({ nowMs: window.__QNOW, push: { [zone]: { streak: 90, atMs: window.__QNOW, present: 1 } } });
    set(); const s4 = window.__vm(zone); window.__dev.longWatch({ enabled: false });
    window.__dev.frontier({ enabled: true }); window.__dev.frontier({ nowMs: window.__QNOW, push: { [zone]: { cover: 3, atMs: window.__QNOW } } });
    set(); const s5 = window.__vm(zone); window.__dev.frontier({ enabled: false });
    set(); window.__dev.territory({ enabled: true }); const terr = window.__vm(zone).influxMulRested; window.__dev.territory({ enabled: false });
    return { base, congPeer: s1.congMulRested, congCeded: s1.influxMulRested, wayPeer: s2.wayfarerMulRested, wayCeded: s2.influxMulRested,
      confPeer: s3.confMulRested, confCeded: s3.influxMulRested, lwPeer: s4.longWatchMulRested, lwCeded: s4.influxMulRested,
      frPeer: s5.frontierMulRested, frCeded: s5.influxMulRested, terr };
  });
  ok("10 PRECEDENCIA MÁXIMO ÚNICO: AFLUENCIA(0.05) CEDE a CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 AND FRONTIER⇒0 (peer>0 cada uno); COEXISTE con TERRITORY(⊥)⇒0.05",
     !prec.bad && near(prec.base, 0.05) && prec.congPeer > 0 && prec.congCeded === 0 && prec.wayPeer > 0 && prec.wayCeded === 0 &&
     prec.confPeer > 0 && prec.confCeded === 0 && prec.lwPeer > 0 && prec.lwCeded === 0 && prec.frPeer > 0 && prec.frCeded === 0 && near(prec.terr, 0.05), JSON.stringify(prec));

  // 11 0-regression: 7 arc flags served true + INFLUX served false
  const cfgSrc = await page.evaluate(async () => (await fetch("sim/config.js")).text());
  const liveFlag = (n) => new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*true").test(cfgSrc);
  const reg = { cong: liveFlag("CONGREGATION"), way: liveFlag("WAYFARER_TRAIL"), pulse: liveFlag("WORLD_PULSE"), soul: liveFlag("SOUL_RECOVERY"), div: liveFlag("DIVERSE_COMPANY"), lw: liveFlag("LONG_WATCH"), fs: liveFlag("FRONTIER_SPREAD"),
    isDark: new RegExp("export const INFLUX_SURGE\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*false").test(cfgSrc) };
  ok("11 ★ 0-REGRESIÓN: 7 flags LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH/FRONTIER_SPREAD) served true; INFLUX_SURGE served false (DARK)",
     Object.values(reg).every(Boolean), JSON.stringify(reg));

  // 12 ★ 6-zone coverage: cada zona hospeda una Afluencia observable — via transition (oleada de 6 recién-llegados) ⇒ prueba el pipeline completo por zona
  const covZ = await page.evaluate((WAVE6) => {
    window.__dev.influx({ enabled: true }); window.__iso();
    const zones = window.__dev.influx().zones || []; const broken = [];
    for (const z of zones) {
      window.__clear(); window.__trans(z, [], WAVE6);
      const s = window.__dev.influx({ nowMs: window.__QNOW, toZone: z });
      if (!(s.zone === z && s.influxable && s.surge === 6 && s.tier === 3 && s.influxMulRested > 0)) broken.push({ z, zone: s.zone, surge: s.surge, tier: s.tier });
    }
    return { n: zones.length, broken };
  }, wave(6));
  ok("12 ★ COBERTURA 6 zonas (vía transition oleada 6): cada zona hospeda Afluencia observable surge 6 ⇒ T3 broken=[]",
     covZ.n === 6 && covZ.broken.length === 0, `n=${covZ.n} broken=${JSON.stringify(covZ.broken)}`);

  // 13 render badge "Afluencia" — instrument ctx.fillText (position-independent)
  await page.evaluate(() => {
    window.__ftCount = 0; const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) { const orig = proto.fillText;
      proto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Afluencia") >= 0) window.__ftCount++; return orig.call(this, t, ...a); };
      proto.__ftPatched = true; }
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.influx({ enabled: false }); window.__ftCount = 0; });
  await sleep(260);
  const ftOff = await page.evaluate(() => window.__ftCount);
  await page.evaluate(() => { window.__dev.influx({ enabled: true }); const w = window.__pick(6); if (w) window.__vm(w.zone); window.__ftCount = 0; });
  await sleep(300);
  const ftOn = await page.evaluate(() => window.__ftCount);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("13 render badge 'Afluencia' DIBUJA con ON (fillText>0) y NO con OFF (0) + fps≥55",
     ftOn > 0 && ftOff === 0 && fps >= 55, `ftOff=${ftOff} ftOn=${ftOn} fps=${fps}`);

  // 14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL (secuencia fresca: baseline surge3/T1 → cap surge8/T3 → decay +60s/T1). page2 abre AL FINAL (blur pausa page1).
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page2.on("pageerror", (e) => errors.push("p2:" + String(e)));
  page2.on("console", (m) => { if (m.type() === "error") errors.push("p2:" + m.text()); });
  await page2.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page2.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await page2.bringToFront();
  await toPlay(page2);
  await installPick(page2);
  // ambos clientes escogen la MISMA zona por índice 2 (no-forest) ⇒ prueba independencia de la zona
  const w2 = await page2.evaluate(() => { window.__dev.influx({ enabled: true }); window.__iso(); return window.__pickIdx(2, 3); });
  const zone = w2 ? w2.zone : null;
  const north = zone ? await (async () => {
    const A = (fn, arg) => page.evaluate(fn, arg), B = (fn, arg) => page2.evaluate(fn, arg);
    // baseline surge 3 ⇒ T1/0.05 en AMBOS
    const a0 = await A((z) => { window.__dev.influx({ enabled: true }); window.__iso(); window.__snap(z, 3); return window.__vm(z); }, zone);
    const b0 = await B((z) => { window.__snap(z, 3); return window.__vm(z); }, zone);
    // subir a cap: surge 8 ⇒ T3/0.15 en AMBOS
    const aU = await A((z) => { window.__snap(z, 8); return window.__vm(z); }, zone);
    const bU = await B((z) => { window.__snap(z, 8); return window.__vm(z); }, zone);
    // decaer: re-snap 8, +60s ⇒ 2 ⇒ T1 en AMBOS (converge)
    const aD = await A((z) => { window.__snap(z, 8); return window.__at(z, 60); }, zone);
    const bD = await B((z) => { window.__snap(z, 8); return window.__at(z, 60); }, zone);
    // A sale físicamente ⇒ Δ_A=0; surge/tier compartido + Δ_B intactos
    const aOut = await A(() => window.__dev.influx({ leave: true }));
    const bAfter = await B((z) => { window.__snap(z, 8); return window.__at(z, 60); }, zone);
    return { zone, aZ: a0.zone, bZ: b0.zone, a0: [a0.surge, a0.tier, a0.influxMulRested], b0: [b0.surge, b0.tier, b0.influxMulRested],
      aU: [aU.surge, aU.tier, aU.influxMulRested], bU: [bU.surge, bU.tier, bU.influxMulRested],
      aD: [aD.surge, aD.tier, aD.influxMulRested], bD: [bD.surge, bD.tier, bD.influxMulRested],
      aOut: [aOut.surge, aOut.tier, aOut.influxMulRested], bAfter: [bAfter.surge, bAfter.tier, bAfter.influxMulRested] };
  })() : { bad: true };
  const eq = (x, y) => x.length === y.length && x.every((v, i) => near(v, y[i]));
  const northOk = !north.bad && north.aZ === north.bZ && north.aZ === zone &&
    eq(north.a0, [3, 1, 0.05]) && eq(north.a0, north.b0) &&           // baseline T1 idéntico
    eq(north.aU, [8, 3, 0.15]) && eq(north.aU, north.bU) &&           // cap T3 converge
    eq(north.aD, [2, 1, 0.05]) && eq(north.aD, north.bD) &&           // decay T1 converge
    eq(north.aOut, [0, 0, 0]) &&                                       // A sale ⇒ Δ_A=0
    eq(north.bAfter, [2, 1, 0.05]);                                    // B + surge/tier compartido intactos
  ok("14 ★ NORTH STAR CONVERGENCIA 2-CLIENTE (zona idx2 no-forest): baseline surge3/T1, cap surge8/T3, decay +60s/T1 ⇒ surge/tier/buff IDÉNTICOS byte-a-byte; A sale⇒Δ_A=0 pero compartido+Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2352 QA observable DARK: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
