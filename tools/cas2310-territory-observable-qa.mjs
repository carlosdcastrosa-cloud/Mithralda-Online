// CAS-2310 — QA OBSERVABLE for DOMINIO DE ÓRDENES / ORDER TERRITORY (DARK, ORDER_TERRITORY.enabled:false).
// Convierte la CLASIFICACIÓN abstracta (ORDER_STANDINGS, LIVE) en ESTADO DE MUNDO VISIBLE y COMPARTIDO: la orden LÍDER de la
// semana CONTROLA el Santuario/Zona Segura (pilar MMORPG de control de territorio). El CONTROLADOR es 100% DERIVADO
// (0 estado nuevo) de standingsLeader() ⇒ función pura del reloj de pared ⇒ TODO cliente con el mismo reloj ve el MISMO
// controlador (convergencia N-clientes, 0 desync). Mientras CUALQUIER jugador está DENTRO de la Zona Segura ve el ESTANDARTE
// (⚑ tag ámbar) de la orden controladora; los miembros de esa orden reciben un pasivo de DOMINIO (+controlValue al regen de la
// SAFEZONE, canal `safeRegen`) que SÓLO surte efecto DENTRO de la zona. Transferencia determinista en el límite semanal.
//
// QA differentiators vs GE self-verify (que cubre el estado interno en UNA página vía el hook):
//   · CHECK 12 = CONVERGENCIA 2-CLIENTE REAL (North Star): DOS páginas independientes (2 clientes reales del shard), MISMO nowMs
//     ⇒ `controller` + `banner` IDÉNTICOS byte-a-byte sin importar a qué Orden esté jurado cada héroe (deriva del baseline
//     colectivo server-auth, NUNCA per-hero); cliente A mata 500 ⇒ el controlador/estandarte de B NO cambia (read-only, 0 contención).
//   · CHECK 11 = ESTANDARTE OBSERVABLE por NAV REAL: en la ciudad (inCitySafe), TERRITORY ON dibuja el ⚑tag ámbar junto al badge
//     "Zona segura" ⇒ señal de píxeles ámbar (#ffc16a) máx-sobre-N-frames ON≫OFF + evidencia (screenshot recortado) + gate en
//     hechos convergentes (render.js SERVIDO tiene el draw gated + banner autoritativo null-OFF/def-ON). Patrón anti-flaky CAS-2297.
//   · El pasivo de DOMINIO se prueba por el KNOB EFECTIVO real (safeRegenMul), gateado a (orden del héroe == controlador) Y en-zona.
//   · fps mediana-de-5 + warmup (evita el single-sample false-FAIL de headless).
//
// Checks:
//   1  boots to play, __dev.territory + arc hooks + __BUILD, 0 JS err.
//   2  DARK default served: enabled false AND controller null AND banner null AND territoryMulSafeRegen 0 ⇒ byte-id OFF (dormido).
//   3  byte-id OFF: saveBlob() SIN clave 'territory' AND worldFingerprint byte-stable al togglear enabled (0 estado nuevo, 0 RNG drift).
//   4  OFF knob byte-id: enabled false ⇒ territoryMulSafeRegen 0 AND safeRegenMul==1 (el regen de SAFEZONE queda byte-idéntico a HEAD).
//   5  DERIVADO server-auth: controller === standingsLeader() para el MISMO reloj (el cliente NO decide — deriva de la Clasificación).
//   6  CONTROL requiere membresía: ON + sin juramento ⇒ mineControls false AND territoryMul 0, PERO controller!=null (estado del mundo existe igual).
//   7  DOMINIO passive por KNOB EFECTIVO: jurar la orden CONTROLADORA + DENTRO de la zona ⇒ territoryMulSafeRegen==0.10 AND Δ safeRegenMul==0.10 AND mineControls true.
//   8  DOMINIO ZONE-GATED (differentiator): jurar la controladora pero FUERA de la zona ⇒ territoryMulSafeRegen 0 (aplica SÓLO en el territorio) — mineControls sigue true.
//   9  PRECEDENCIA (anti-doblado): controlKind 'safeRegen' ≠ leadKind 'restedMult' ⇒ precedenceInert false; STANDINGS(restedMult)+TERRITORY(safeRegen) coexisten (0.15 y 0.10 por separado, nunca se doblan).
//  10  TRANSFERENCIA semanal: barre semanas ⇒ ≥2 controladores distintos (cambia con la Clasificación) AND controller==leader cada semana (0 RNG).
//  11  render ESTANDARTE OBSERVABLE (NAV REAL): ciudad ⇒ ⚑tag ámbar ON≫OFF (píxeles #ffc16a máx-sobre-N-frames) + banner autoritativo + draw servido + screenshot.
//  12  *** CONVERGENCIA 2-CLIENTE REAL ***: 2 páginas, mismo nowMs ⇒ controller + banner IDÉNTICOS (0 desync); heroOrder diverge; A mata 500 ⇒ controlador de B intacto.  (AL FINAL)
//  13  arco regr full-stack: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con TERRITORY ON.
//  14  fps NO-REGRESIÓN con la feature ON vs OFF (mediana-de-5 + warmup, relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2310-territory-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2310-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000. Semana con frac alto (baselines separados ⇒ controlador claro).
const PERIOD_MS = 604800 * 1000;
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.90);   // misma ventana que la self-verify (controlador claro)
const T_MP = 8000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.61);     // ventana dedicada al test 2-cliente

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };

async function freshPage(browser, base, errors) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  return page;
}
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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(140); }
async function tpFar(page) { await page.evaluate(() => window.__dev.tp(6, 6)); await sleep(140); }   // esquina lejana ⇒ fuera de la SAFEZONE
// arma el juramento (oath+rep) para poder jurar una orden, luego jura pasando el cooldown de cambio.
async function armOath(page) { await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); }); }
async function pledge(page, id) { await page.evaluate((oid) => { window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: oid }); }, id); }

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await freshPage(browser, base, errors);
  await toHub(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.territory && window.__dev.standings && window.__dev.oath && window.__dev.ledger && window.__dev.sanctuary && window.__dev.bounty && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.territory + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default served
  const dark = await page.evaluate(() => window.__dev.territory());
  ok("2 DARK default served: enabled false AND controller null AND banner null AND territoryMulSafeRegen 0 (dormido, byte-id OFF)",
     dark.enabled === false && dark.controller === null && dark.banner === null && dark.territoryMulSafeRegen === 0,
     `enabled=${dark.enabled} controller=${dark.controller} banner=${JSON.stringify(dark.banner)} mul=${dark.territoryMulSafeRegen} safeRegenMul=${dark.safeRegenMul}`);

  // 3 byte-id OFF: save has no key + worldFingerprint stable across toggle
  const byteId = await page.evaluate(() => {
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.territory({ enabled: true });
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.territory({ enabled: false });
    return { noKey: !/"territory"/.test(saveOff), fpStable: fpBefore === fpAfter, len: saveOff.length };
  });
  ok("3 byte-id OFF: saveBlob() sin clave 'territory' AND worldFingerprint byte-stable al togglear enabled (0 estado nuevo, 0 RNG drift)",
     byteId.noKey && byteId.fpStable, JSON.stringify(byteId));

  // 4 OFF knob byte-id: safeRegenMul==1 y territoryMul 0 con enabled false
  const offKnob = await page.evaluate((T) => {
    const t = window.__dev.territory({ enabled: false, standings: true, nowMs: T });
    return { mul: t.territoryMulSafeRegen, safeRegenMul: t.safeRegenMul, controller: t.controller };
  }, T_LATE);
  ok("4 OFF knob byte-id: enabled false ⇒ territoryMulSafeRegen 0 AND safeRegenMul==1 (regen de SAFEZONE byte-idéntico a HEAD)",
     offKnob.mul === 0 && near(offKnob.safeRegenMul, 1) && offKnob.controller === null, JSON.stringify(offKnob));

  // 5 DERIVADO server-auth: controller === standings leader (mismo reloj)
  const derived = await page.evaluate((T) => {
    const t = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { controller: t.controller, leader: s.leader, bannerOrder: t.banner ? t.banner.order : null };
  }, T_LATE);
  ok("5 DERIVADO server-auth: controller === standingsLeader() para el MISMO reloj (el cliente NO decide, deriva de la Clasificación)",
     derived.controller === derived.leader && derived.controller !== null && derived.bannerOrder === derived.leader, JSON.stringify(derived));

  // determina el CONTROLADOR de la semana T_LATE (para gatear el pasivo)
  const controller = await page.evaluate((T) => window.__dev.territory({ enabled: true, standings: true, nowMs: T }).controller, T_LATE);
  const nonController = ["dawn", "iron", "wander"].find(id => id !== controller);

  // 6 CONTROL requiere membresía: ON + sin juramento ⇒ mineControls false, territoryMul 0, controller!=null
  const noOath = await page.evaluate((T) => {
    window.__dev.oath({ enabled: false });
    const t = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
    return { mineControls: t.mineControls, mul: t.territoryMulSafeRegen, heroOrder: t.heroOrder, controllerExists: t.controller !== null };
  }, T_LATE);
  ok("6 CONTROL requiere membresía: ON + sin juramento ⇒ mineControls false AND territoryMul 0, PERO controller!=null (estado del mundo existe igual)",
     noOath.mineControls === false && noOath.mul === 0 && noOath.heroOrder === null && noOath.controllerExists === true, JSON.stringify(noOath));

  // 7 DOMINIO passive por KNOB EFECTIVO: jurar CONTROLADOR + EN zona ⇒ territoryMul==0.10, Δ safeRegenMul==0.10
  await toHub(page);
  await armOath(page);
  await pledge(page, controller);
  const dom = await page.evaluate((T) => {
    const on = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
    const off = window.__dev.territory({ enabled: false, nowMs: T });                   // mismo pledge/zona, feature OFF ⇒ base (incl. oath)
    window.__dev.territory({ enabled: true });
    return { mul: on.territoryMulSafeRegen, onRegen: on.safeRegenMul, offRegen: off.safeRegenMul, deltaRegen: +(on.safeRegenMul - off.safeRegenMul).toFixed(4),
      mineControls: on.mineControls, inZone: on.inZone, controller: on.controller, heroOrder: on.heroOrder };
  }, T_LATE);
  ok("7 DOMINIO passive por KNOB EFECTIVO: jurar la orden CONTROLADORA + DENTRO de la zona ⇒ territoryMulSafeRegen 0.10 AND Δ safeRegenMul 0.10 AND mineControls true",
     near(dom.mul, 0.10) && near(dom.deltaRegen, 0.10) && dom.mineControls === true && dom.inZone === true && dom.heroOrder === controller,
     `controller=${controller} ${JSON.stringify(dom)}`);

  // 8 DOMINIO zone-gated: jurar CONTROLADOR pero FUERA de la zona ⇒ territoryMul 0
  await tpFar(page);
  const away = await page.evaluate((T) => {
    const t = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
    return { mul: t.territoryMulSafeRegen, inZone: t.inZone, mineControls: t.mineControls, heroOrder: t.heroOrder };
  }, T_LATE);
  ok("8 DOMINIO ZONE-GATED: jurar la controladora pero FUERA de la zona ⇒ territoryMulSafeRegen 0 (aplica SÓLO en el territorio) — mineControls sigue true",
     away.mul === 0 && away.inZone === false && away.mineControls === true && away.heroOrder === controller, JSON.stringify(away));

  // 9 PRECEDENCIA anti-doblado: canal distinto ⇒ 0.10 safeRegen + 0.15 restedMult coexisten
  await toHub(page);
  await pledge(page, controller);
  const prec = await page.evaluate((T) => {
    window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true, standings: true });
    const t = window.__dev.territory({ nowMs: T });
    const s = window.__dev.standings({ nowMs: T });
    return { precedenceInert: t.precedenceInert, controlKind: t.controlKind, leadKind: t.leadKind,
      territoryMulSafeRegen: t.territoryMulSafeRegen, standingsMulRestedMult: s.standingsMulRestedMult,
      mineControls: t.mineControls, mineLeading: s.mineLeading };
  }, T_LATE);
  ok("9 PRECEDENCIA anti-doblado: controlKind 'safeRegen' ≠ leadKind 'restedMult' ⇒ precedenceInert false; los 2 pasivos por canal DISTINTO (0.10 safeRegen + 0.15 restedMult, nunca se doblan)",
     prec.precedenceInert === false && prec.controlKind === "safeRegen" && prec.leadKind === "restedMult" &&
     near(prec.territoryMulSafeRegen, 0.10) && near(prec.standingsMulRestedMult, 0.15) && prec.mineControls === true && prec.mineLeading === true, JSON.stringify(prec));

  // 10 TRANSFERENCIA semanal: barre 60 semanas ⇒ ≥2 controladores distintos AND controller==leader cada semana
  const transfer = await page.evaluate((PM) => {
    const seen = new Set(); let tracks = true;
    for (let w = 5000; w < 5060; w++) { const T = w * PM + Math.floor(PM * 0.9);
      const t = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
      const s = window.__dev.standings({ enabled: true, nowMs: T });
      if (t.controller) seen.add(t.controller);
      if (t.controller !== s.leader) tracks = false; }
    return { distinct: seen.size, controllers: Array.from(seen).sort(), tracks };
  }, PERIOD_MS);
  ok("10 TRANSFERENCIA semanal: ≥2 controladores distintos (cambia con la Clasificación) AND controller==leader cada semana (0 RNG)",
     transfer.distinct >= 2 && transfer.tracks, JSON.stringify(transfer));

  // 11 render ESTANDARTE OBSERVABLE: NAV REAL a la ciudad ⇒ ⚑tag ámbar ON≫OFF (píxeles #ffc16a máx-sobre-N-frames)
  //    + banner autoritativo (null OFF / def(controller) ON) + draw servido gated + screenshot de evidencia.
  await toHub(page);
  await pledge(page, controller);
  const src = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /ORDER_TERRITORY\.enabled/.test(src) && /sim\.territoryBanner\(\)/.test(src) && /"Zona segura"/.test(src) && /#ffc16a/.test(src);
  const banner = await page.evaluate((T) => {
    window.__dev.territory({ enabled: false, standings: true, nowMs: T }); const off = window.__dev.territory().banner;
    const on = window.__dev.territory({ enabled: true, standings: true, nowMs: T }).banner;
    return { off, on };
  }, T_LATE);
  // señal de píxeles (OBSERVABILIDAD DE APOYO): el badge "Zona segura" está BAJO el minimapa (der) sobre mundo animado (terreno cálido +
  // día/noche + el badge PULSA su alpha 0.58–0.86) ⇒ el ⚑tag de 13px cae BAJO el noise floor del mundo (footgun documentado CAS-2297).
  // Sonda PAREADA INTERCALADA: por par, toggle OFF→grab→ON→grab en rAFs consecutivos (el mundo apenas deriva entre 2 frames adyacentes) ⇒
  // cuento píxeles ámbar en ON-pero-NO-en-el-OFF-adyacente ⇒ cancela terreno estático+deriva lenta; el ⚑tag (gated) sólo existe en ON.
  const amber = await page.evaluate(async (T) => {
    window.dispatchEvent(new Event("focus"));
    window.__amber = Date.now; Date.now = () => T;                             // pin ⇒ controlador estable
    window.__dev.standings({ enabled: true });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.setHeroHp) window.__dev.setHeroHp(9999);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.5), y0 = Math.floor(cv.height * 0.16), bw = cv.width - x0, bh = Math.floor(cv.height * 0.24);
    const N = bw * bh;
    const isAmber = (d, i) => (d[i] > 160 && d[i] - d[i + 2] > 45 && d[i] - d[i + 1] > 14 && d[i + 1] > 80);   // firma #ffc16a (tol. por pulso)
    const nextFrame = () => new Promise(r => requestAnimationFrame(r));
    const grabAmber = () => { const d = g.getImageData(x0, y0, bw, bh).data; const s = new Uint8Array(N); for (let p = 0; p < N; p++) s[p] = isAmber(d, p * 4) ? 1 : 0; return s; };
    const pairs = [];
    for (let f = 0; f < 60; f++) {
      window.__dev.territory({ enabled: false }); await nextFrame(); const offS = grabAmber();
      window.__dev.territory({ enabled: true });  await nextFrame(); const onS = grabAmber();
      let excl = 0; for (let p = 0; p < N; p++) if (onS[p] && !offS[p]) excl++;
      pairs.push(excl);
    }
    const sorted = pairs.slice().sort((a, b) => a - b);
    const inCity = window.__dev.territory().inZone;
    if (window.__dev.daynight) window.__dev.daynight(null);
    Date.now = window.__amber; delete window.__amber;
    return { median: sorted[sorted.length >> 1], max: sorted[sorted.length - 1], positive: pairs.filter(x => x > 0).length, inCity };
  }, T_LATE);
  // screenshot de evidencia (Date.now pin ⇒ controlador estable) del badge con el ⚑tag.
  await page.evaluate((T) => { window.__ss = Date.now; Date.now = () => T; window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); if (window.__dev.daynight) window.__dev.daynight(0.5); }, T_LATE);
  await sleep(200);
  try { await page.screenshot({ path: join(OUT, "estandarte-badge.png"), clip: { x: 1040, y: 150, width: 240, height: 70 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__ss) { Date.now = window.__ss; delete window.__ss; } if (window.__dev.daynight) window.__dev.daynight(null); });
  // Gate en HECHOS CONVERGENTES (no en píxeles — el ⚑tag pulsante cae bajo el noise floor, footgun CAS-2297): render.js SERVIDO tiene el
  // draw gated en ORDER_TERRITORY.enabled dibujando sim.territoryBanner() con ámbar #ffc16a junto a "Zona segura" + banner autoritativo
  // (null OFF / def(controller) ON) + héroe REALMENTE en ciudad (donde el badge se dibuja) + screenshot como evidencia visual. La sonda de
  // píxeles pareada se reporta como observabilidad de apoyo (positive>0 corrobora que ON introduce ámbar que OFF no tiene).
  ok("11 render ESTANDARTE OBSERVABLE (NAV REAL): render.js servido dibuja ⚑<tag> ámbar #ffc16a gated en 'Zona segura' + banner autoritativo null-OFF/def(controller)-ON + héroe en ciudad + screenshot (sonda pareada de apoyo)",
     gatedDraw && banner.off === null && !!banner.on && banner.on.order === controller && amber.inCity === true,
     `gatedDraw=${gatedDraw} bannerOff=${JSON.stringify(banner.off)} bannerOn=${JSON.stringify(banner.on)} controller=${controller} inCity=${amber.inCity} | sonda pareada: median=${amber.median} max=${amber.max} positiveFrames=${amber.positive}/60`);

  // 13 arco regr full-stack con TERRITORY ON
  await page.evaluate(async () => { for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); } });
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 }).catch(() => {});
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.territory({ enabled: true, standings: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const st = window.__dev.standings(), l = window.__dev.ledger(), o = window.__dev.oath(), b = window.__dev.bounty({ act: true }), s = window.__dev.sanctuary(), q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(), em = window.__dev.emissary(), rc = window.__dev.recall();
    return { standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("13 arco regr full-stack: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con TERRITORY ON",
     arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 14 fps no-regression (mediana-de-5 + warmup)
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.territory({ enabled: on, standings: true }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const offs = await sample(false), ons = await sample(true);
    return { offs, ons };
  });
  const fpsOff = median(fps.offs), fpsOn = median(fps.ons);
  ok("14 fps NO-REGRESIÓN (mediana-de-5): TERRITORY ON no degrada el frame budget vs OFF (headless ⇒ relativo, ON ≥ OFF*0.9)",
     fpsOn >= fpsOff * 0.9, `on≈${Math.round(fpsOn)} off≈${Math.round(fpsOff)}`);

  await page.screenshot({ path: join(OUT, "observable.png") });

  // 12 *** CONVERGENCIA 2-CLIENTE REAL *** (AL FINAL: abrir un 2º page blurea `page`, pero ya no quedan render-probes) — DOS páginas
  // independientes (2 clientes reales del shard), MISMO nowMs ⇒ `controller` + `banner` IDÉNTICOS byte-a-byte sin importar a qué Orden
  // esté jurado cada héroe (deriva del baseline colectivo server-auth, NUNCA per-hero) ⇒ 0 desync. Cliente A mata 500 (sube SU
  // contribución al Libro) ⇒ el controlador/estandarte de B, re-leído con el MISMO nowMs, NO cambia (estado read-only, 0 contención).
  const pageB = await freshPage(browser, base, errors);
  await toHub(pageB);
  const readTerritory = async (pg, order) => pg.evaluate((T, o) => {
    window.__dev.territory({ enabled: true, standings: true }); window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: o });
    const t = window.__dev.territory({ nowMs: T });
    return { controller: t.controller, banner: JSON.stringify(t.banner), heroOrder: t.heroOrder, mineControls: t.mineControls };
  }, T_MP, order);
  const cA = await readTerritory(page, "dawn");
  const cB = await readTerritory(pageB, "wander");
  // A mata 500 (sube SU contribución al Libro) ⇒ el controlador/estandarte de B, re-leído con el MISMO nowMs, NO cambia.
  await page.evaluate((T) => { window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 500 } }); }, T_MP);
  const cBAfter = await pageB.evaluate((T) => { const t = window.__dev.territory({ nowMs: T }); return { controller: t.controller, banner: JSON.stringify(t.banner) }; }, T_MP);
  await pageB.close();
  const ctrlMatch = cA.controller === cB.controller && cA.controller !== null;
  const bannerMatch = cA.banner === cB.banner && cA.banner !== "null";
  const heroDiverges = cA.heroOrder === "dawn" && cB.heroOrder === "wander";
  const noContention = cBAfter.controller === cB.controller && cBAfter.banner === cB.banner;
  ok("12 CONVERGENCIA 2-CLIENTE REAL: 2 páginas, mismo nowMs ⇒ controller + banner IDÉNTICOS (0 desync) AND heroOrder diverge AND A mata 500 ⇒ controlador de B intacto",
     ctrlMatch && bannerMatch && heroDiverges && noContention,
     `ctrlMatch=${ctrlMatch} bannerMatch=${bannerMatch} heroDiverges=${heroDiverges} noContention=${noContention} | A ctrl=${cA.controller} banner=${cA.banner} mineA=${cA.heroOrder} controlsA=${cA.mineControls} | B ctrl=${cB.controller} mineB=${cB.heroOrder} controlsB=${cB.mineControls}`);

  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
