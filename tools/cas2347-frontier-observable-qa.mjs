// CAS-2347 — QA OBSERVABLE DARK for EXPEDICIÓN / FRONTIER SPREAD (FRONTIER_SPREAD.enabled:false). EVO mecánica #55.
// INDEPENDENT QA harness (NOT a copy of the GE self-verify): fresh test vectors, 2D-bucket vectors (prueba que frontierCellKey usa AMBOS ejes, no solo x),
// distinta secuencia de convergencia 2-cliente (baseline T2 → cap capCover → decay), zona NO-forest para cobertura, crowds distintas para el diferenciador.
//
// Eje FRESCO = DISPERSIÓN ESPACIAL (cuán ESPARCIDA está la comunidad). El server agrupa presentes en SUB-CELDAS COARSE (128px, mismo grid que Sendero) y cuenta el nº de
// sub-celdas DISTINTAS ocupadas (= cobertura). Ortogonal a headcount #51 / footfall #52 / composición #53 / continuidad #54 / reloj #50. Umbrales 2/3/4 → tiers → restedMult
// 0.05/0.10/0.15, cap capCover, DECAY determinista 0-RNG vida-media 45s. Passive COMPARTIDO server-authoritative ⇒ byte-idéntico entre clientes (desync = sev-1).
//
// ★ DIFERENCIADOR (≠ Congregación #51): N jugadores AMONTONADOS en la MISMA sub-celda ⇒ cover 1 ⇒ NO abre; N REPARTIDOS en ≥K sub-celdas ⇒ abre el tier K.
// ★ NORTH STAR = CONVERGENCIA 2-CLIENTE REAL: 2 páginas puppeteer, MISMA cover+reloj ⇒ cover/tier/buff idénticos byte-a-byte; subir/decaer CONVERGEN; A sale ⇒ Δ_A=0 pero
//   cover/tier server-authoritative + Δ_B INTACTOS (0 desync).
// Precedencia MÁXIMO ÚNICO: FRONTIER es la MÁS BAJA (10ª) del canal restedMult ⇒ CEDE a standings/mentor/soul/pulse/cong/wayfarer/conf/longWatch; territory(safeRegen) ⊥ coexiste.
// Run: node tools/cas2347-frontier-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2347-qa");
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

const NOW = 7_200_000;   // reloj de pared FIJO (ms) distinto del GE ⇒ proyección determinista (mismo en ambos clientes)
async function installPick(page) {
  await page.evaluate((NOW) => {
    window.__QNOW = NOW;
    // desactiva los 8 peers DEFAULT-ON del canal restedMult (arco LIVE) para medir Expedición en AISLAMIENTO
    window.__iso = () => { window.__dev.standings({ enabled: false }); window.__dev.mentor({ enabled: false }); window.__dev.soul({ enabled: false }); window.__dev.pulse({ enabled: false }); window.__dev.congregation({ enabled: false }); window.__dev.wayfarer({ enabled: false }); window.__dev.confluence({ enabled: false }); window.__dev.longWatch({ enabled: false }); };
    window.__snap = (zone, cover, at) => window.__dev.frontier({ nowMs: window.__QNOW, push: { [zone]: { cover, atMs: (at != null ? at : window.__QNOW) } } });
    window.__occ  = (zone, occ) => window.__dev.frontier({ nowMs: window.__QNOW, occupants: { [zone]: occ } });
    window.__at   = (zone, elapsedSec) => window.__dev.frontier({ nowMs: window.__QNOW + (elapsedSec || 0) * 1000, toZone: zone });
    window.__vm   = (zone) => window.__dev.frontier({ nowMs: window.__QNOW, toZone: zone });
    // teleporta a la N-ésima zona frontierable y devuelve su VM tras empujar `cover`
    window.__pickIdx = (idx, cover) => {
      window.__dev.frontier({ enabled: true });
      const zones = window.__dev.frontier().zones || [];
      const z = zones[idx]; if (!z) return null;
      const s = window.__dev.frontier({ nowMs: window.__QNOW, push: { [z]: { cover, atMs: window.__QNOW } }, toZone: z });
      return (s.zone === z && s.frontierable) ? { zone: z, cover: s.cover, tier: s.tier, boost: s.frontierMulRested } : null;
    };
    window.__pick = (cover) => window.__pickIdx(0, cover);
  }, NOW);
}

// 2D crammed: 8 jugadores TODOS dentro de la sub-celda (0,0) — varía x E y (0..127) ⇒ frontierCellKey debe dar la MISMA clave ⇒ cover 1
const CRAMMED8 = [[5, 5], [40, 12], [90, 100], [120, 60], [8, 120], [70, 70], [30, 90], [110, 15]];
// 2D spread: reparte por el EJE Y (x constante) ⇒ prueba que el bucket NO ignora y: y=0,140,300,520 ⇒ celdas (0,0),(0,1),(0,2),(0,4) ⇒ cover K
const spreadY = (k) => [[64, 0], [64, 140], [64, 300], [64, 520]].slice(0, k);
// diagonal spread: 6 jugadores en 3 sub-celdas distintas por diagonal (2 por celda) ⇒ cover 3
const DIAG3 = [[10, 10], [50, 40], [200, 200], [230, 240], [400, 400], [430, 420]];

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.frontier && window.__dev.standings && window.__dev.congregation && window.__dev.wayfarer && window.__dev.confluence && window.__dev.longWatch && window.__dev.territory && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.frontier + arc hooks + __BUILD, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot (leído ANTES de inyectar): enabled false + G.frontier nunca creado
  const dark = await page.evaluate(() => window.__dev.frontier());
  ok("2 byte-id OFF (fresh boot): enabled false AND gExists false AND cover/tier/boost/tag/coverMap vacíos",
     dark.enabled === false && dark.gExists === false && dark.tier === 0 && dark.cover === 0 && dark.boost === 0 && dark.tag === "" && dark.coverMap === null,
     `enabled=${dark.enabled} gExists=${dark.gExists} cover=${dark.cover} tag="${dark.tag}"`);

  // 3 save OFF sin clave frontier + fingerprint estable a través del toggle
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const fpB = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(777)));
  await page.evaluate(() => window.__dev.frontier({ enabled: true }));
  const fpA = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(777)));
  await page.evaluate(() => window.__dev.frontier({ enabled: false }));
  ok("3 byte-id save OFF: sin clave 'frontier'/'frontierServer' + worldFingerprint estable a través del toggle (0 RNG drift)",
     !/frontier/i.test(saveOff) && fpB === fpA, `saveHasKey=${/frontier/i.test(saveOff)} fpMatch=${fpB === fpA}`);

  await installPick(page);

  // 4 ★ COBERTURA = función PURA del ESPACIO en 2D (frontierCellKey usa x E y): 1⇒1; 8 amontonados (2D, misma celda)⇒1; reparto por eje Y 2/3/4⇒2/3/4; diagonal 6-en-3⇒3
  const cov2d = await page.evaluate((args) => {
    const { CRAMMED8, y2, y3, y4, DIAG3 } = args;
    window.__dev.frontier({ enabled: true }); window.__iso();
    const z = window.__dev.frontier().zones[0];
    const read = (occ) => { window.__occ(z, occ); return window.__vm(z).cover; };
    return { one: read([[64, 64]]), crammed: read(CRAMMED8), y2: read(y2), y3: read(y3), y4: read(y4), diag: read(DIAG3) };
  }, { CRAMMED8, y2: spreadY(2), y3: spreadY(3), y4: spreadY(4), DIAG3 });
  ok("4 ★ COBERTURA función PURA del ESPACIO 2D: 1⇒1; 8 AMONTONADOS misma sub-celda⇒1; reparto por EJE Y 2/3/4⇒2/3/4; diagonal 6-en-3-celdas⇒3 (bucket usa AMBOS ejes)",
     near(cov2d.one, 1) && near(cov2d.crammed, 1) && near(cov2d.y2, 2) && near(cov2d.y3, 3) && near(cov2d.y4, 4) && near(cov2d.diag, 3), JSON.stringify(cov2d));

  // 5 TABLA tier/boost pura del cover + cap capCover
  const tab = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__pick(4); if (!w) return { bad: true };
    const cap = window.__dev.frontier().capCover;
    const out = [];
    for (const c of [1, 2, 3, 4, 6, 999]) { window.__snap(w.zone, c); const vm = window.__vm(w.zone); out.push({ c, cover: vm.cover, tier: vm.tier, boost: vm.frontierMulRested }); }
    return { zone: w.zone, cap, out };
  });
  const eT = { 1: 0, 2: 1, 3: 2, 4: 3, 6: 3, 999: 3 };
  const eB = { 1: 0, 2: 0.05, 3: 0.10, 4: 0.15, 6: 0.15, 999: 0.15 };
  const capOk = !tab.bad && near(tab.out[tab.out.length - 1].cover, tab.cap);   // cover 999 ⇒ clamped a capCover
  const tabOk = !tab.bad && tab.out.every(r => (r.c <= tab.cap ? near(r.cover, r.c) : true) && r.tier === eT[r.c] && near(r.boost, eB[r.c]));
  ok("5 TABLA tier/boost = función PURA del COVER + CAP capCover: 1→T0/2→T1/3→T2/4→T3 (0/0.05/0.10/0.15); cover 999 ⇒ clamped a capCover, tier estable",
     tabOk && capOk, `cap=${tab.cap} ${JSON.stringify(tab.out)}`);

  // 6 ★ DIFERENCIADOR crammed vs spread (crowd 8 vs diagonal 6-en-3): amontonados NO abre; repartidos abren el tier de la dispersión
  const diff = await page.evaluate((args) => {
    const { CRAMMED8, DIAG3 } = args;
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__pick(1); if (!w) return { bad: true };
    window.__occ(w.zone, CRAMMED8); const cr = window.__vm(w.zone);         // 8 amontonados ⇒ cover 1 ⇒ NO abre (Congregación SÍ por headcount 8)
    window.__occ(w.zone, DIAG3);   const sp = window.__vm(w.zone);          // 6 repartidos en 3 celdas ⇒ cover 3 ⇒ T2
    return { zone: w.zone, crCover: cr.cover, crTier: cr.tier, crMul: cr.frontierMulRested, spCover: sp.cover, spTier: sp.tier, spMul: sp.frontierMulRested };
  }, { CRAMMED8, DIAG3 });
  ok("6 ★ DIFERENCIADOR crammed≠spread: 8 AMONTONADOS ⇒ cover 1 / tier 0 / passive 0 (NO abre, ≠ Congregación headcount); 6 REPARTIDOS en 3 sub-celdas ⇒ cover 3 / tier 2 / passive 0.10",
     !diff.bad && near(diff.crCover, 1) && diff.crTier === 0 && diff.crMul === 0 && near(diff.spCover, 3) && diff.spTier === 2 && near(diff.spMul, 0.10), JSON.stringify(diff));

  // 7 ★ DECAY determinista 0-RNG vida-media 45s desde cover 8 (cap): +45s⇒4(T3); +90s⇒2(T1); +135s⇒1(T0)
  const decay = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__pick(8); if (!w) return { bad: true };
    const z = w.zone;
    window.__snap(z, 8); const b = window.__vm(z);
    window.__snap(z, 8); const d1 = window.__at(z, 45);
    window.__snap(z, 8); const d2 = window.__at(z, 90);
    window.__snap(z, 8); const d3 = window.__at(z, 135);
    return { z, base: b.cover, baseT: b.tier, c1: d1.cover, t1: d1.tier, c2: d2.cover, t2: d2.tier, c3: d3.cover, t3: d3.tier };
  });
  ok("7 ★ DECAY determinista 0-RNG vida-media 45s: cover 8(T3); +45s⇒4(T3); +90s⇒2(T1); +135s⇒1(T0) — half-life exacta",
     !decay.bad && near(decay.base, 8) && decay.baseT === 3 && near(decay.c1, 4) && decay.t1 === 3 && near(decay.c2, 2) && decay.t2 === 1 && near(decay.c3, 1) && decay.t3 === 0, JSON.stringify(decay));

  // 8 server-authoritative reflect+validate: zona fuera de zones descartada; cover negativo ⇒ 0
  const refl = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const z0 = window.__dev.frontier().zones[0];
    window.__dev.frontier({ nowMs: window.__QNOW, push: { [z0]: { cover: 3, atMs: window.__QNOW }, nowhere_zone: { cover: 4, atMs: window.__QNOW } } });
    const s = window.__vm(z0);
    window.__dev.frontier({ nowMs: window.__QNOW, push: { [z0]: { cover: -9, atMs: window.__QNOW } } });
    const neg = window.__vm(z0);
    return { valid: s.cover, hasGhost: !!(s.coverMap && "nowhere_zone" in s.coverMap), negCover: neg.cover, negTier: neg.tier };
  });
  ok("8 SERVER-AUTHORITATIVE reflect+validate: zona válida refleja cover 3; zona fuera de `zones` DESCARTADA; cover negativo ⇒ 0/T0 (clamped)",
     near(refl.valid, 3) && !refl.hasGhost && refl.negCover === 0 && refl.negTier === 0, JSON.stringify(refl));

  // 9 PASSIVE aislado + gainXP seam servido + byte-id pasivo OFF
  const simSrc = await page.evaluate(async () => (await fetch("sim/sim.js")).text());
  const seamWired = /function gainXP/.test(simSrc) && /frontierMul\(h,\s*"restedMult"\)/.test(simSrc);
  const pass = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const w = window.__pick(3); if (!w) return { bad: true };
    const inz = window.__vm(w.zone);
    const out = window.__dev.frontier({ leave: true });
    window.__dev.frontier({ enabled: false });
    const off = window.__vm(w.zone);
    return { inMul: inz.frontierMulRested, inTier: inz.tier, outMul: out.frontierMulRested, outTier: out.tier, offMul: off.frontierMulRested, offTag: off.tag, offEnabled: off.enabled };
  });
  ok("9 PASSIVE aislado (T2=0.10) + gainXP seam servido + byte-id OFF: in-zone⇒0.10/T2; leave⇒0/T0; enabled false⇒mul 0 AND tag \"\"",
     seamWired && !pass.bad && near(pass.inMul, 0.10) && pass.inTier === 2 && pass.outMul === 0 && pass.outTier === 0 && pass.offMul === 0 && pass.offTag === "" && pass.offEnabled === false,
     `wired=${seamWired} ${JSON.stringify(pass)}`);

  // 10 PRECEDENCIA MÁXIMO ÚNICO: FRONTIER cede a CONGREGATION + WAYFARER + CONFLUENCIA + LONG_WATCH; coexiste con TERRITORY (⊥)
  const prec = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso(); window.__dev.territory({ enabled: false });
    const w = window.__pick(2); if (!w) return { bad: true };
    const zone = w.zone; const set = () => window.__snap(zone, 2);
    set(); const base = window.__vm(zone).frontierMulRested;
    window.__dev.congregation({ enabled: true }); const cc = {}; cc[zone] = 8; window.__dev.congregation({ counts: cc });
    set(); const s1 = window.__vm(zone); window.__dev.congregation({ enabled: false });
    window.__dev.wayfarer({ enabled: true }); window.__dev.wayfarer({ nowMs: 1000000 }); window.__dev.wayfarer({ tread: 100000, atMs: 1000000 });
    set(); const s2 = window.__vm(zone); window.__dev.wayfarer({ enabled: false });
    window.__dev.confluence({ enabled: true }); window.__dev.confluence({ rosters: { [zone]: { warrior: 1, mage: 1 } } });
    set(); const s3 = window.__vm(zone); window.__dev.confluence({ enabled: false });
    window.__dev.longWatch({ enabled: true }); window.__dev.longWatch({ nowMs: window.__QNOW, push: { [zone]: { streak: 90, atMs: window.__QNOW, present: 1 } } });
    set(); const s4 = window.__vm(zone); window.__dev.longWatch({ enabled: false });
    set(); window.__dev.territory({ enabled: true }); const terr = window.__vm(zone).frontierMulRested; window.__dev.territory({ enabled: false });
    return { base, congPeer: s1.congMulRested, congCeded: s1.frontierMulRested, wayPeer: s2.wayfarerMulRested, wayCeded: s2.frontierMulRested,
      confPeer: s3.confMulRested, confCeded: s3.frontierMulRested, lwPeer: s4.longWatchMulRested, lwCeded: s4.frontierMulRested, terr };
  });
  ok("10 PRECEDENCIA MÁXIMO ÚNICO: EXPEDICIÓN(0.05) CEDE a CONGREGATION⇒0 AND WAYFARER⇒0 AND CONFLUENCIA⇒0 AND LONG_WATCH⇒0 (peer>0 cada uno); COEXISTE con TERRITORY(⊥)⇒0.05",
     !prec.bad && near(prec.base, 0.05) && prec.congPeer > 0 && prec.congCeded === 0 && prec.wayPeer > 0 && prec.wayCeded === 0 &&
     prec.confPeer > 0 && prec.confCeded === 0 && prec.lwPeer > 0 && prec.lwCeded === 0 && near(prec.terr, 0.05), JSON.stringify(prec));

  // 11 0-regression: 6 arc flags served true + FRONTIER served false
  const cfgSrc = await page.evaluate(async () => (await fetch("sim/config.js")).text());
  const liveFlag = (n) => new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*true").test(cfgSrc);
  const reg = { cong: liveFlag("CONGREGATION"), way: liveFlag("WAYFARER_TRAIL"), pulse: liveFlag("WORLD_PULSE"), soul: liveFlag("SOUL_RECOVERY"), div: liveFlag("DIVERSE_COMPANY"), lw: liveFlag("LONG_WATCH"),
    fsDark: new RegExp("export const FRONTIER_SPREAD\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*false").test(cfgSrc) };
  ok("11 ★ 0-REGRESIÓN: 6 flags LIVE (CONGREGATION/WAYFARER_TRAIL/WORLD_PULSE/SOUL_RECOVERY/DIVERSE_COMPANY/LONG_WATCH) served true; FRONTIER_SPREAD served false (DARK)",
     Object.values(reg).every(Boolean), JSON.stringify(reg));

  // 12 ★ 6-zone coverage: cada zona hospeda una Expedición observable — via occupants repartidos (no push directo) ⇒ prueba el pipeline completo por zona
  const covZ = await page.evaluate(() => {
    window.__dev.frontier({ enabled: true }); window.__iso();
    const zones = window.__dev.frontier().zones || []; const broken = [];
    const OCC4 = [[0, 0], [200, 0], [0, 200], [200, 200]];   // 4 sub-celdas distintas ⇒ cover 4 ⇒ T3
    for (const z of zones) {
      window.__occ(z, OCC4);
      const s = window.__dev.frontier({ nowMs: window.__QNOW, toZone: z });
      if (!(s.zone === z && s.frontierable && s.cover === 4 && s.tier === 3 && s.frontierMulRested > 0)) broken.push({ z, zone: s.zone, cover: s.cover, tier: s.tier });
    }
    return { n: zones.length, broken };
  });
  ok("12 ★ COBERTURA 6 zonas (vía occupants repartidos): cada zona hospeda Expedición observable cover 4 ⇒ T3 broken=[]",
     covZ.n === 6 && covZ.broken.length === 0, `n=${covZ.n} broken=${JSON.stringify(covZ.broken)}`);

  // 13 render badge "Expedición" — instrument ctx.fillText (position-independent)
  await page.evaluate(() => {
    window.__ftCount = 0; const proto = CanvasRenderingContext2D.prototype;
    if (!proto.__ftPatched) { const orig = proto.fillText;
      proto.fillText = function (t, ...a) { if (typeof t === "string" && t.indexOf("Expedición") >= 0) window.__ftCount++; return orig.call(this, t, ...a); };
      proto.__ftPatched = true; }
  });
  await page.evaluate(() => { window.__iso(); window.__dev.territory({ enabled: false }); window.__dev.frontier({ enabled: false }); window.__ftCount = 0; });
  await sleep(260);
  const ftOff = await page.evaluate(() => window.__ftCount);
  await page.evaluate(() => { window.__dev.frontier({ enabled: true }); const w = window.__pick(4); if (w) window.__vm(w.zone); window.__ftCount = 0; });
  await sleep(300);
  const ftOn = await page.evaluate(() => window.__ftCount);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  const fps = await page.evaluate(async () => { let n = 0; const t0 = performance.now(); await new Promise((res) => { const l = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(l); else res(); }; requestAnimationFrame(l); }); return n; });
  ok("13 render badge 'Expedición' DIBUJA con ON (fillText>0) y NO con OFF (0) + fps≥55",
     ftOn > 0 && ftOff === 0 && fps >= 55, `ftOff=${ftOff} ftOn=${ftOn} fps=${fps}`);

  // 14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL (secuencia fresca: baseline T2 cover3 → cap cover8 T3 → decay +90s T1). page2 abre AL FINAL (blur pausa page1).
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
  const w2 = await page2.evaluate(() => { window.__dev.frontier({ enabled: true }); window.__iso(); return window.__pickIdx(2, 3); });
  const zone = w2 ? w2.zone : null;
  const north = zone ? await (async () => {
    const A = (fn, arg) => page.evaluate(fn, arg), B = (fn, arg) => page2.evaluate(fn, arg);
    // baseline cover 3 ⇒ T2/0.10 en AMBOS
    const a0 = await A((z) => { window.__dev.frontier({ enabled: true }); window.__iso(); window.__snap(z, 3); return window.__vm(z); }, zone);
    const b0 = await B((z) => { window.__snap(z, 3); return window.__vm(z); }, zone);
    // subir a cap: cover 8 ⇒ T3/0.15 en AMBOS
    const aU = await A((z) => { window.__snap(z, 8); return window.__vm(z); }, zone);
    const bU = await B((z) => { window.__snap(z, 8); return window.__vm(z); }, zone);
    // decaer: re-snap 8, +90s ⇒ 2 ⇒ T1 en AMBOS (converge)
    const aD = await A((z) => { window.__snap(z, 8); return window.__at(z, 90); }, zone);
    const bD = await B((z) => { window.__snap(z, 8); return window.__at(z, 90); }, zone);
    // A sale físicamente ⇒ Δ_A=0; cover/tier compartido + Δ_B intactos
    const aOut = await A(() => window.__dev.frontier({ leave: true }));
    const bAfter = await B((z) => { window.__snap(z, 8); return window.__at(z, 90); }, zone);
    return { zone, aZ: a0.zone, bZ: b0.zone, a0: [a0.cover, a0.tier, a0.frontierMulRested], b0: [b0.cover, b0.tier, b0.frontierMulRested],
      aU: [aU.cover, aU.tier, aU.frontierMulRested], bU: [bU.cover, bU.tier, bU.frontierMulRested],
      aD: [aD.cover, aD.tier, aD.frontierMulRested], bD: [bD.cover, bD.tier, bD.frontierMulRested],
      aOut: [aOut.cover, aOut.tier, aOut.frontierMulRested], bAfter: [bAfter.cover, bAfter.tier, bAfter.frontierMulRested] };
  })() : { bad: true };
  const eq = (x, y) => x.length === y.length && x.every((v, i) => near(v, y[i]));
  const northOk = !north.bad && north.aZ === north.bZ && north.aZ === zone &&
    eq(north.a0, [3, 2, 0.10]) && eq(north.a0, north.b0) &&           // baseline T2 idéntico
    eq(north.aU, [8, 3, 0.15]) && eq(north.aU, north.bU) &&           // cap T3 converge
    eq(north.aD, [2, 1, 0.05]) && eq(north.aD, north.bD) &&           // decay T1 converge
    eq(north.aOut, [0, 0, 0]) &&                                       // A sale ⇒ Δ_A=0
    eq(north.bAfter, [2, 1, 0.05]);                                    // B + cover/tier compartido intactos
  ok("14 ★ NORTH STAR CONVERGENCIA 2-CLIENTE (zona idx2 no-forest): baseline cover3/T2, cap cover8/T3, decay +90s/T1 ⇒ cover/tier/buff IDÉNTICOS byte-a-byte; A sale⇒Δ_A=0 pero compartido+Δ_B INTACTOS (0 desync)",
     northOk, JSON.stringify(north));

  console.log(`\n${FAIL === 0 ? "✅" : "❌"} cas2347 QA observable DARK: ${PASS} PASS / ${FAIL} FAIL  (build ${build}, err ${errors.length})`);
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
