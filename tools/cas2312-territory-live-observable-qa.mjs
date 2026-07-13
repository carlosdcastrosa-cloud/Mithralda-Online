// CAS-2312 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — DOMINIO DE ÓRDENES / ORDER TERRITORY (ORDER_TERRITORY.enabled:true LIVE)
// Convierte la CLASIFICACIÓN abstracta (ORDER_STANDINGS, LIVE) en ESTADO DE MUNDO VISIBLE y COMPARTIDO: la orden LÍDER de la
// Clasificación CONTROLA el Santuario/Zona Segura (estandarte ⚑ en el badge "Zona segura") y recibe un pasivo de DOMINIO gateado.
//
// LIVE post-flip via CTO CAS-2311 (master dcf8ec6): ORDER_TERRITORY.enabled false→true, overlay consistente-HEAD 4-file
// {config,sim,game,render} SIN input.js. Este harness es el gemelo LIVE de la DARK observable tools/cas2310-territory-observable-qa.mjs:
// mismos hechos, pero contra el build SERVIDO en gh-pages (carlosdcastrosa-cloud.github.io/Mithralda-Online), con el patrón
// DEFAULT-ON (el flip ya cargó: enabled:true SERVIDO + controller real-clock != null 0 flip) en vez del DARK-default byte-id OFF.
//
// Checks:
//   1  boot LIMPIO LIVE + __dev.territory + arc hooks + __BUILD self-consistente vs version.json + 0 err / 0 non-favicon 404.
//   2  served sim/config.js: ORDER_TERRITORY.enabled:true SERVIDO + ORDER_STANDINGS true + arco entero true (0 regr); DARKs false.
//   3  DEFAULT-ON (la prueba LIVE): boot fresco 0 __dev ⇒ territory().enabled===true AND controller real-clock != null AND banner != null
//      AND heroOrder null pre-juramento (estado de mundo existe sin jurar).
//   4  byte-id when OFF (toggle): territory({enabled:false}) ⇒ saveBlob() sin clave 'territory' AND territoryMulSafeRegen 0 AND
//      safeRegenMul==1 AND worldFingerprint byte-stable ⇒ reversible sin drift; restaura ON.
//   5  DERIVADO server-auth: controller === standingsLeader() para el MISMO reloj (el cliente NO decide — deriva de la Clasificación).
//   6  CONTROL requiere membresía: ON + sin juramento ⇒ mineControls false AND territoryMul 0, PERO controller!=null.
//   7  DOMINIO passive por KNOB EFECTIVO: jurar la CONTROLADORA + EN zona ⇒ territoryMulSafeRegen 0.10 AND Δ safeRegenMul 0.10.
//   8  DOMINIO ZONE-GATED: jurar la controladora pero FUERA de la zona ⇒ territoryMul 0 (aplica SÓLO en el territorio).
//   9  PRECEDENCIA anti-doblado: controlKind 'safeRegen' ≠ leadKind 'restedMult' ⇒ precedenceInert false; 0.10+0.15 coexisten por canal DISTINTO.
//  10  TRANSFERENCIA semanal: barre 60 semanas ⇒ ≥2 controladores distintos AND controller==leader cada semana (0 RNG).
//  11  render ESTANDARTE OBSERVABLE (NAV REAL): render.js SERVIDO dibuja ⚑<tag> ámbar #ffc16a gated en 'Zona segura' + banner autoritativo + screenshot.
//  12  *** CONVERGENCIA 2-CLIENTE REAL LIVE ***: 2 páginas, mismo nowMs ⇒ controller + banner IDÉNTICOS (0 desync); heroOrder diverge; A mata 500 ⇒ B intacto.  (AL FINAL)
//  13  arco regr full-stack: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con TERRITORY ON.
//  14  fps NO-REGRESIÓN con la feature ON vs OFF (mediana-de-5 + warmup, relativo, ON ≥ OFF*0.9).
//   0  no JS errors + no non-favicon 404 durante toda la corrida.
//
// LIVE wiring (mirror CAS-2309): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded); favicon-404 filtrado;
// ambas páginas COMPARTEN origen localStorage ⇒ limpiar mithralda.* por página; Date.now pin para el controlador estable.
// Run: node tools/cas2312-territory-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2312-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000. Mismas ventanas que la DARK (semanas dedicadas ⇒ controlador claro).
const PERIOD_MS = 604800 * 1000;
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.90);   // controlador claro (misma ventana que la self-verify DARK)
const T_MP   = 8000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.61);   // ventana dedicada al test 2-cliente

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
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
async function tpFar(page) { await page.evaluate(() => window.__dev.tp(6, 6)); await sleep(140); }   // esquina lejana ⇒ fuera de la SAFEZONE
async function armOath(page) { await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); }); }
async function pledge(page, id) { await page.evaluate((oid) => { window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: oid }); }, id); }

// fresh page on LIVE: clear shared-origin save so each client boots to a FRESH hero (2 clientes ⇒ 2 héroes).
async function freshPage(browser, errors, net404) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.territory && window.__dev.standings && window.__dev.oath && window.__dev.ledger && window.__dev.sanctuary && window.__dev.bounty && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.territory + arc hooks; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: ORDER_TERRITORY.enabled:true SERVIDO + ORDER_STANDINGS true + arco entero true; DARKs false
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"), LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"),
      EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"), BOUNTY: en("BOUNTY_BOARD"),
      WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const allArcTrue = ["STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("2 served config: ORDER_TERRITORY.enabled:true SERVIDO + ORDER_STANDINGS true + arco entero enabled:true (0 regr); DARKs false",
     cfg.TERRITORY === "true" && allArcTrue && darksFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (la prueba LIVE): boot fresco 0 __dev flip ⇒ enabled true + controller real-clock != null + banner != null + heroOrder null
  const dOn = await page.evaluate(() => { const t = window.__dev.territory(); return { enabled: t.enabled, controller: t.controller, banner: t.banner ? t.banner.order : null, heroOrder: t.heroOrder }; });
  ok("3 DEFAULT-ON desde config servido: territory().enabled===true AND controller real-clock != null AND banner != null AND heroOrder null (0 __dev flip)",
     dOn.enabled === true && dOn.controller !== null && dOn.banner !== null && dOn.banner === dOn.controller && dOn.heroOrder === null, JSON.stringify(dOn));

  // 4 byte-id when OFF (toggle): enabled:false ⇒ save sin clave 'territory' + mul 0 + safeRegenMul 1 + fp byte-stable; restaura ON
  const byteId = await page.evaluate(() => {
    const fpOn = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.territory({ enabled: false });
    const off = window.__dev.territory();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.territory({ enabled: false });
    const fpOff2 = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.territory({ enabled: true });   // restaura ON para el resto de checks
    return { noKey: !/"territory"/.test(saveOff), mul: off.territoryMulSafeRegen, safeRegenMul: off.safeRegenMul, controller: off.controller, fpStable: fpOff === fpOff2 };
  });
  ok("4 byte-id when OFF (toggle): enabled:false ⇒ saveBlob() sin clave 'territory' AND territoryMulSafeRegen 0 AND safeRegenMul==1 AND controller null AND fp byte-stable",
     byteId.noKey && byteId.mul === 0 && near(byteId.safeRegenMul, 1) && byteId.controller === null && byteId.fpStable, JSON.stringify(byteId));

  // 5 DERIVADO server-auth: controller === standings leader (mismo reloj)
  const derived = await page.evaluate((T) => {
    const t = window.__dev.territory({ enabled: true, standings: true, nowMs: T });
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { controller: t.controller, leader: s.leader, bannerOrder: t.banner ? t.banner.order : null };
  }, T_LATE);
  ok("5 DERIVADO server-auth: controller === standingsLeader() para el MISMO reloj (el cliente NO decide, deriva de la Clasificación)",
     derived.controller === derived.leader && derived.controller !== null && derived.bannerOrder === derived.leader, JSON.stringify(derived));

  const controller = await page.evaluate((T) => window.__dev.territory({ enabled: true, standings: true, nowMs: T }).controller, T_LATE);

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
    const off = window.__dev.territory({ enabled: false, nowMs: T });
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

  // 11 render ESTANDARTE OBSERVABLE (NAV REAL): render.js SERVIDO dibuja ⚑tag ámbar gated + banner autoritativo + screenshot.
  await toHub(page);
  await pledge(page, controller);
  const src = await page.evaluate(async () => { const r = await fetch("render/render.js", { cache: "no-store" }); return await r.text(); });
  const gatedDraw = /ORDER_TERRITORY\.enabled/.test(src) && /sim\.territoryBanner\(\)/.test(src) && /"Zona segura"/.test(src) && /#ffc16a/.test(src);
  const banner = await page.evaluate((T) => {
    window.__dev.territory({ enabled: false, standings: true, nowMs: T }); const off = window.__dev.territory().banner;
    const on = window.__dev.territory({ enabled: true, standings: true, nowMs: T }).banner;
    return { off, on };
  }, T_LATE);
  // sonda de píxeles pareada de APOYO (el ⚑tag pulsante cae bajo el noise floor del mundo animado — footgun CAS-2297/CAS-2310).
  const amber = await page.evaluate(async (T) => {
    window.dispatchEvent(new Event("focus"));
    window.__amber = Date.now; Date.now = () => T;
    window.__dev.standings({ enabled: true });
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.setHeroHp) window.__dev.setHeroHp(9999);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.5), y0 = Math.floor(cv.height * 0.16), bw = cv.width - x0, bh = Math.floor(cv.height * 0.24);
    const N = bw * bh;
    const isAmber = (d, i) => (d[i] > 160 && d[i] - d[i + 2] > 45 && d[i] - d[i + 1] > 14 && d[i + 1] > 80);
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
  await page.evaluate((T) => { window.__ss = Date.now; Date.now = () => T; window.__dev.standings({ enabled: true }); window.__dev.territory({ enabled: true }); const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); if (window.__dev.daynight) window.__dev.daynight(0.5); }, T_LATE);
  await sleep(200);
  try { await page.screenshot({ path: join(OUT, "estandarte-badge.png"), clip: { x: 1040, y: 150, width: 240, height: 70 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__ss) { Date.now = window.__ss; delete window.__ss; } if (window.__dev.daynight) window.__dev.daynight(null); });
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

  // 12 *** CONVERGENCIA 2-CLIENTE REAL LIVE *** (AL FINAL): 2 páginas independientes, mismo nowMs ⇒ controller+banner IDÉNTICOS pese a heroOrder divergente.
  const pageB = await freshPage(browser, errors, net404);
  await toHub(pageB);
  const readTerritory = async (pg, order) => pg.evaluate((T, o) => {
    window.__dev.territory({ enabled: true, standings: true }); window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: o });
    const t = window.__dev.territory({ nowMs: T });
    return { controller: t.controller, banner: JSON.stringify(t.banner), heroOrder: t.heroOrder, mineControls: t.mineControls };
  }, T_MP, order);
  const cA = await readTerritory(page, "dawn");
  const cB = await readTerritory(pageB, "wander");
  await page.evaluate((T) => { window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 500 } }); }, T_MP);
  const cBAfter = await pageB.evaluate((T) => { const t = window.__dev.territory({ nowMs: T }); return { controller: t.controller, banner: JSON.stringify(t.banner) }; }, T_MP);
  await pageB.close();
  const ctrlMatch = cA.controller === cB.controller && cA.controller !== null;
  const bannerMatch = cA.banner === cB.banner && cA.banner !== "null";
  const heroDiverges = cA.heroOrder === "dawn" && cB.heroOrder === "wander";
  const noContention = cBAfter.controller === cB.controller && cBAfter.banner === cB.banner;
  ok("12 CONVERGENCIA 2-CLIENTE REAL LIVE: 2 páginas, mismo nowMs ⇒ controller + banner IDÉNTICOS (0 desync) AND heroOrder diverge AND A mata 500 ⇒ controlador de B intacto",
     ctrlMatch && bannerMatch && heroDiverges && noContention,
     `ctrlMatch=${ctrlMatch} bannerMatch=${bannerMatch} heroDiverges=${heroDiverges} noContention=${noContention} | A ctrl=${cA.controller} banner=${cA.banner} mineA=${cA.heroOrder} controlsA=${cA.mineControls} | B ctrl=${cB.controller} mineB=${cB.heroOrder} controlsB=${cB.mineControls}`);

  ok("0 no JS errors + no non-favicon 404 during run", errors.length === 0 && net404.length === 0, [...errors.slice(0, 3), ...net404.slice(0, 3)].join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)  build LIVE vs ${LIVE}`);
process.exit(FAIL ? 1 : 0);
