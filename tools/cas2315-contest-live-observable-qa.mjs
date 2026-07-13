// CAS-2315 — POST-FLIP LIVE OBSERVABLE + 2-CLIENTE QA — ASALTO AL SANTUARIO / SANCTUARY CONTEST (ORDER_CONTEST.enabled:true LIVE)
// Convierte el control PASIVO del Santuario (ORDER_TERRITORY, LIVE) en TERRITORIO-EN-DISPUTA DINÁMICO: una VENTANA DE ASALTO
// determinista y recurrente donde el RETADOR (2º de ORDER_STANDINGS) puede ARREBATAR el control al líder. El flip es VISIBLE
// para TODOS los en-zona (reutiliza el estandarte ⚑ + banner de ORDER_TERRITORY, $0 arte).
//
// LIVE post-flip via CTO CAS-2314 (master 4c8afd2): ORDER_CONTEST.enabled false→true, overlay consistente-HEAD 4-file
// {config,sim,game,render} SIN input.js, served build 58ca99608ccd. Este harness es el gemelo LIVE de la DARK observable
// tools/cas2313-contest-observable-qa.mjs: MISMOS hechos, pero contra el build SERVIDO en gh-pages
// (carlosdcastrosa-cloud.github.io/Mithralda-Online), con el patrón DEFAULT-ON (el flip ya cargó: enabled:true SERVIDO +
// effective real-clock derivado del ranking) en vez del DARK-default byte-id OFF (que aquí se re-verifica vía TOGGLE).
//
// Checks:
//   1  boot LIMPIO LIVE + __dev.contest + arc hooks + __BUILD self-consistente vs version.json + 0 err / 0 non-favicon 404.
//   2  served sim/config.js: ORDER_CONTEST.enabled:true SERVIDO + ORDER_TERRITORY/ORDER_STANDINGS true + arco entero true (0 regr); DARKs false.
//   3  DEFAULT-ON (la prueba LIVE): boot fresco 0 __dev flip ⇒ contest().enabled===true AND effective real-clock != null AND
//      territoryController()===effective (el control efectivo existe SIN tocar __dev, derivado del ranking server-auth).
//   4  byte-id when OFF (toggle): contest({enabled:false}) ⇒ saveBlob() sin clave 'contest' AND effective===standingsLeader() (0 flip)
//      AND banner null AND worldFingerprint byte-stable ⇒ reversible sin drift; restaura ON.
//   5  VENTANA determinista OBSERVABLE: fuera de la ventana (frac 0.50) ⇒ active false; dentro (frac 0.98) ⇒ active true (windowFrac 0.25).
//   6  RETADOR = 2º de la Clasificación server-auth: contest.challenger === standings.order[1].id AND contest.controller === standings.leader.
//   7  FLIP OBSERVABLE: ≥1 semana donde el surge basta ⇒ effective===challenger AND territoryController()===challenger AND banner al RETADOR.
//   8  HOLD OBSERVABLE: ≥1 semana donde el surge NO basta ⇒ el líder RETIENE (territorio REALMENTE disputado que varía por semana).
//   9  STICKY/monótono en ventana: al avanzar iw progress NO decrece AND una vez flipped sigue flipped (0 flapping).
//  10  DOMINIO transferido por KNOB EFECTIVO + ZONE-GATED: semana de flip ⇒ jurar el RETADOR + EN zona ⇒ Δ safeRegenMul==+0.10;
//      FUERA de zona ⇒ 0; jurar el CONTROLADOR original ⇒ 0 (el pasivo SIGUE al control).
//  11  PRECEDENCIA anti-doblado: el ranking NO cambia (standings.leader===controller original) ⇒ restedMult(0.15) al 1º y safeRegen(0.10) al RETADOR.
//  12  render 'Asalto en curso' SERVIDO + AUTORITATIVO: render.js servido dibuja sim.contestBanner() bajo gate ORDER_CONTEST.enabled + screenshot.
//  13  arco regr full-stack con CONTEST ON + fps no-regresión (mediana-de-5).
//  14  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE: 2 páginas, MISMO nowMs ⇒ {effective,flipped,banner,tc} IDÉNTICOS pese a heroOrder
//      divergente (A=dawn,B=wander); A mata 500 ⇒ control de B INTACTO (baseline colectivo server-auth, 0 desync/contención).  (AL FINAL)
//   0  no JS errors + no non-favicon 404 durante toda la corrida.
//
// LIVE wiring (mirror CAS-2312): gh-pages ?dev=1; build comparado con version.json servido (NO hardcoded); favicon-404 filtrado;
// ambas páginas COMPARTEN origen localStorage ⇒ limpiar mithralda.* por página (bootea a 'menu' no 'resume'); 2ª página bringToFront.
// Run: node tools/cas2315-contest-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2315-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                  // SEMANAL (mismo reloj compartido que STANDINGS/LEDGER/TERRITORY)
const wk = (w, frac) => w * PERIOD_MS + Math.floor(PERIOD_MS * frac);
const T_WIN = wk(5000, 0.98);                                     // MUY dentro de la ventana de asalto (iw≈0.92 con windowFrac 0.25)
const T_PRE = wk(5000, 0.50);                                     // ANTES de la ventana (frac 0.50 < 0.75)

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
async function armArc(page) { await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); }); }
async function pledge(page, id) { await page.evaluate((oid) => { window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: oid }); }, id); }

// fresh page on LIVE: clear shared-origin save so each client boots to a FRESH hero (2 clientes ⇒ 2 héroes) at 'menu' no 'resume'.
async function freshPage(browser, errors, net404) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  page.on("requestfailed", (r) => { if (!isFaviconOnly(r.url())) net404.push(r.url()); });
  page.on("response", (r) => { if (r.status() === 404 && !isFaviconOnly(r.url())) net404.push(r.url()); });
  await page.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await page.bringToFront();                                                    // foreground ⇒ rAF no-throttle ⇒ boot fiable (2ª página abre backgrounded)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.contest && window.__dev.territory && window.__dev.standings && window.__dev.oath && window.__dev.ledger && window.__dev.sanctuary && window.__dev.bounty && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.contest + arc hooks; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: ORDER_CONTEST.enabled:true SERVIDO + TERRITORY/STANDINGS true + arco entero true; DARKs false
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { CONTEST: en("ORDER_CONTEST"), TERRITORY: en("ORDER_TERRITORY"), STANDINGS: en("ORDER_STANDINGS"), LEDGER: en("SANCTUARY_LEDGER"),
      OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"), BOUNTY: en("BOUNTY_BOARD"),
      WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"), SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const allArcTrue = ["TERRITORY","STANDINGS","LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("2 served config: ORDER_CONTEST.enabled:true SERVIDO + ORDER_TERRITORY/ORDER_STANDINGS true + arco entero enabled:true (0 regr); DARKs false",
     cfg.CONTEST === "true" && allArcTrue && darksFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (la prueba LIVE): boot fresco 0 __dev flip ⇒ enabled true + effective real-clock != null + territoryController===effective
  const dOn = await page.evaluate(() => { const c = window.__dev.contest(); return { enabled: c.enabled, effective: c.effective, tc: c.territoryController, controller: c.controller, challenger: c.challenger }; });
  ok("3 DEFAULT-ON desde config servido: contest().enabled===true AND effective real-clock != null AND territoryController()===effective (0 __dev flip, derivado del ranking server-auth)",
     dOn.enabled === true && dOn.effective !== null && dOn.tc === dOn.effective && dOn.controller !== null, JSON.stringify(dOn));

  // 4 byte-id when OFF (toggle): enabled:false ⇒ save sin clave 'contest' + effective===leader (0 flip) + banner null + fp byte-stable; restaura ON
  const byteId = await page.evaluate((T) => {
    const fpOn = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.contest({ enabled: false, standings: true, territory: true });
    const d = window.__dev.contest({ nowMs: T });
    const s = window.__dev.standings({ nowMs: T });
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fpOff = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.contest({ enabled: false });
    const fpOff2 = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.contest({ enabled: true, standings: true, territory: true });   // restaura ON
    return { enabled: d.enabled, active: d.active, flipped: d.flipped, banner: d.banner, effective: d.effective, tc: d.territoryController,
      leader: s.leader, noKey: !/"contest"/.test(saveOff), fpStable: fpOff === fpOff2 };
  }, T_WIN);
  // OFF ⇒ el contest NO computa effective (eso es tarea de ORDER_TERRITORY): effective null es CORRECTO; el control PASA-THROUGH
  // al líder pasivo vía territoryController()===standingsLeader() (mismo invariante byte-id que la DARK CAS-2313).
  ok("4 byte-id when OFF (toggle): enabled:false ⇒ saveBlob() sin clave 'contest' AND active/flipped false AND banner null AND territoryController()===standingsLeader() (control pasa-through, 0 flip) AND worldFingerprint byte-stable",
     byteId.enabled === false && byteId.active === false && byteId.flipped === false && byteId.banner === null && byteId.noKey === true &&
     byteId.fpStable === true && byteId.effective === null && byteId.tc === byteId.leader && byteId.leader !== null, JSON.stringify(byteId));

  // 5 VENTANA determinista observable
  const win = await page.evaluate((TP, TW) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    const pre = window.__dev.contest({ nowMs: TP });
    const inw = window.__dev.contest({ nowMs: TW });
    return { preActive: pre.active, inActive: inw.active, windowFrac: inw.windowFrac, iw: inw.iw };
  }, T_PRE, T_WIN);
  ok("5 VENTANA determinista OBSERVABLE: frac<1-windowFrac ⇒ active false; dentro de la ventana ⇒ active true (windowFrac 0.25, derivado del reloj compartido)",
     win.preActive === false && win.inActive === true && near(win.windowFrac, 0.25) && win.iw > 0.8, JSON.stringify(win));

  // 6 challenger = 2nd place, controller = leader (server-auth)
  const parties = await page.evaluate((T) => {
    const c = window.__dev.contest({ enabled: true, standings: true, territory: true, nowMs: T });
    const s = window.__dev.standings({ nowMs: T });
    return { challenger: c.challenger, second: s.order[1] ? s.order[1].id : null, controller: c.controller, leader: s.leader };
  }, T_WIN);
  ok("6 RETADOR = 2º de la Clasificación (server-auth) AND controller===leader (derivado del ranking cacheado, 0 estado nuevo)",
     parties.challenger === parties.second && parties.challenger !== null && parties.controller === parties.leader, JSON.stringify(parties));

  // 7/8 sweep semanas ⇒ semana de FLIP + semana de HOLD (territorio realmente disputado)
  const sweep = await page.evaluate((PM) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    let flipWk = null, holdWk = null, flips = 0, holds = 0;
    for (let w = 5000; w < 5120; w++) { const nm = w * PM + Math.floor(PM * 0.98);
      const c = window.__dev.contest({ nowMs: nm });
      if (c.flipped) { flips++; if (flipWk === null) flipWk = { w, nm, effective: c.effective, challenger: c.challenger, controller: c.controller, tc: c.territoryController, banner: c.banner }; }
      else { holds++; if (holdWk === null) holdWk = { w, nm, effective: c.effective, controller: c.controller, challenger: c.challenger, tc: c.territoryController }; } }
    return { flipWk, holdWk, flips, holds };
  }, PERIOD_MS);
  ok("7 FLIP OBSERVABLE: ≥1 semana con surge suficiente ⇒ effective===challenger AND territoryController()===challenger AND banner del estandarte al RETADOR (control ARREBATADO, VISIBLE)",
     !!sweep.flipWk && sweep.flipWk.effective === sweep.flipWk.challenger && sweep.flipWk.tc === sweep.flipWk.challenger &&
     sweep.flipWk.banner && sweep.flipWk.banner.challenger === sweep.flipWk.challenger && sweep.flipWk.banner.flipped === true,
     `flips=${sweep.flips}/${sweep.flips + sweep.holds} ${JSON.stringify(sweep.flipWk)}`);
  ok("8 HOLD OBSERVABLE: ≥1 semana con surge insuficiente ⇒ el líder RETIENE (territorio REALMENTE disputado que varía por semana)",
     !!sweep.holdWk && sweep.holdWk.effective === sweep.holdWk.controller && sweep.holdWk.tc === sweep.holdWk.controller && sweep.flips >= 1 && sweep.holds >= 1,
     `flips=${sweep.flips} holds=${sweep.holds} ${JSON.stringify(sweep.holdWk)}`);

  const flipNm = sweep.flipWk ? sweep.flipWk.nm : T_WIN;
  const flipChallenger = sweep.flipWk ? sweep.flipWk.challenger : null;
  const flipController = sweep.flipWk ? sweep.flipWk.controller : null;

  // 9 STICKY/monótono en ventana
  const sticky = await page.evaluate((wkNm, PM) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    const wIdx = Math.floor(wkNm / PM);
    let lastP = -1, mono = true, sawFlip = false, stuck = true, activeAll = true;
    for (const frac of [0.76, 0.80, 0.85, 0.90, 0.95, 0.99]) { const nm = wIdx * PM + Math.floor(PM * frac);
      const c = window.__dev.contest({ nowMs: nm });
      if (!c.active) activeAll = false;
      if (c.progress + 1e-9 < lastP) mono = false; lastP = c.progress;
      if (c.flipped) sawFlip = true; else if (sawFlip) stuck = false; }
    return { mono, sawFlip, stuck, activeAll };
  }, flipNm, PERIOD_MS);
  ok("9 STICKY/monótono: al avanzar iw progress NO decrece AND una vez flipped sigue flipped (0 flapping, surge monótono en iw)",
     sticky.mono === true && sticky.activeAll === true && sticky.sawFlip === true && sticky.stuck === true, JSON.stringify(sticky));

  // 10 DOMINIO transferido por KNOB EFECTIVO + ZONE-GATED: RETADOR en zona ⇒ +0.10; RETADOR fuera ⇒ 0; CONTROLADOR original ⇒ 0
  await armArc(page);
  await toHub(page);
  await pledge(page, flipChallenger);
  const domChalIn = await page.evaluate((nm) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    const t = window.__dev.territory({ nowMs: nm });
    return { mul: t.territoryMulSafeRegen, mineControls: t.mineControls, inZone: t.inZone, heroOrder: t.heroOrder };
  }, flipNm);
  await tpFar(page);
  const domChalOut = await page.evaluate((nm) => {
    const t = window.__dev.territory({ nowMs: nm });
    return { mul: t.territoryMulSafeRegen, inZone: t.inZone };
  }, flipNm);
  await toHub(page);
  await pledge(page, flipController);
  const domCtl = await page.evaluate((nm) => {
    const t = window.__dev.territory({ nowMs: nm });
    return { mul: t.territoryMulSafeRegen, mineControls: t.mineControls, heroOrder: t.heroOrder };
  }, flipNm);
  ok("10 DOMINIO por KNOB EFECTIVO + ZONE-GATED: jurar el RETADOR + EN zona ⇒ Δ safeRegenMul==+0.10; FUERA de zona ⇒ 0; jurar el CONTROLADOR original ⇒ 0 (el pasivo SIGUE al control)",
     near(domChalIn.mul, 0.10) && domChalIn.mineControls === true && domChalIn.inZone === true && domChalIn.heroOrder === flipChallenger &&
     domChalOut.mul === 0 && domChalOut.inZone === false && domCtl.mul === 0 && domCtl.mineControls === false && domCtl.heroOrder === flipController,
     `chalIn=${JSON.stringify(domChalIn)} chalOut=${JSON.stringify(domChalOut)} ctl=${JSON.stringify(domCtl)} chal=${flipChallenger} ctl=${flipController}`);

  // 11 PRECEDENCIA anti-doblado
  await toHub(page);
  await pledge(page, flipController);
  const precCtl = await page.evaluate((nm) => {
    const s = window.__dev.standings({ nowMs: nm });
    const t = window.__dev.territory({ nowMs: nm });
    return { leader: s.leader, mineLeading: s.mineLeading, standingsMul: s.standingsMulRestedMult, territoryMul: t.territoryMulSafeRegen };
  }, flipNm);
  await pledge(page, flipChallenger);
  const precChal = await page.evaluate((nm) => {
    const s = window.__dev.standings({ nowMs: nm });
    const t = window.__dev.territory({ nowMs: nm });
    return { mineLeading: s.mineLeading, standingsMul: s.standingsMulRestedMult, territoryMul: t.territoryMulSafeRegen };
  }, flipNm);
  ok("11 PRECEDENCIA: el ranking NO cambia con el asalto (standings.leader===controller original) ⇒ restedMult(0.15) al 1º y safeRegen(0.10) al RETADOR — canales DISTINTOS, 0 doble-conteo",
     precCtl.leader === flipController && precCtl.mineLeading === true && near(precCtl.standingsMul, 0.15) && precCtl.territoryMul === 0 &&
     precChal.mineLeading === false && precChal.standingsMul === 0 && near(precChal.territoryMul, 0.10),
     `ctl=${JSON.stringify(precCtl)} chal=${JSON.stringify(precChal)}`);

  // 12 render 'Asalto en curso' served + authoritative + screenshot evidence
  const src = await page.evaluate(async () => { const r = await fetch("render/render.js", { cache: "no-store" }); return await r.text(); });
  const gatedDraw = /ORDER_CONTEST\.enabled/.test(src) && /sim\.contestBanner\(\)/.test(src) && /Asalto en curso/.test(src);
  const bannerAuth = await page.evaluate((nm) => {
    window.__dev.contest({ enabled: false, standings: true, territory: true, nowMs: nm }); const bOff = window.__dev.contest({ nowMs: nm }).banner;
    const bOn = window.__dev.contest({ enabled: true, nowMs: nm }).banner;
    return { off: bOff, on: bOn };
  }, flipNm);
  await page.evaluate((nm) => { window.__tqa = Date.now; Date.now = () => nm; window.__dev.contest({ enabled: true, standings: true, territory: true }); const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); if (window.__dev.daynight) window.__dev.daynight(0.5); }, flipNm);
  await sleep(200);
  try { await page.screenshot({ path: join(OUT, "asalto-badge.png"), clip: { x: 700, y: 0, width: 580, height: 220 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__tqa) { Date.now = window.__tqa; delete window.__tqa; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("12 render 'Asalto en curso' SERVIDO + AUTORITATIVO: render.js servido dibuja sim.contestBanner() bajo gate ORDER_CONTEST.enabled en la fila 'Zona segura'; banner null OFF / def(active) ON",
     gatedDraw && bannerAuth.off === null && !!bannerAuth.on && bannerAuth.on.active === true && bannerAuth.on.challenger === flipChallenger,
     `gatedDraw=${gatedDraw} off=${JSON.stringify(bannerAuth.off)} on=${JSON.stringify(bannerAuth.on)}`);

  // 13 arc regression + fps no-regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const c = window.__dev.contest(); const te = window.__dev.territory(); const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.contest({ enabled: on, standings: true, territory: true }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const o = await sample(false); const n = await sample(true);
    return { off: o, on: n };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("13 arco regr con CONTEST ON (TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REP+REWARDS+WORLD_EVENT+EMISSARY+RECALL sanos) + fps no-regresión (mediana-de-5, ON ≥ OFF*0.9)",
     arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk && onM >= offM * 0.9,
     `arc=${JSON.stringify(arc)} fps on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  await page.screenshot({ path: join(OUT, "observable.png") });

  // 14 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL LIVE (corre AL FINAL: abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur del game-loop).
  const pageA = page;                                                          // cliente A ya en play
  const pageB = await freshPage(browser, errors, net404);                      // 2ª página foreground (bringToFront) ⇒ boot fiable
  await toHub(pageB);
  const readClient = async (p, order) => p.evaluate((args) => {
    const [nm, oid] = args;
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: oid });
    const c = window.__dev.contest({ nowMs: nm });
    return { effective: c.effective, flipped: c.flipped, banner: JSON.stringify(c.banner), tc: c.territoryController, mine: c.mineOrder, challenger: c.challenger, controller: c.controller };
  }, [flipNm, order]);
  const a0 = await readClient(pageA, "dawn");
  const b0 = await readClient(pageB, "wander");
  // Cliente A mata 500 (contribución per-hero MASIVA) ⇒ NO debe mover el control de B (server-auth baseline colectivo, 0 contención)
  await pageA.evaluate(() => { for (let i = 0; i < 5; i++) window.__dev.oath({ kill: { n: 100 } }); });
  const a1 = await pageA.evaluate((nm) => { const c = window.__dev.contest({ nowMs: nm }); return { effective: c.effective, banner: JSON.stringify(c.banner), tc: c.territoryController }; }, flipNm);
  const b1 = await pageB.evaluate((nm) => { const c = window.__dev.contest({ nowMs: nm }); return { effective: c.effective, banner: JSON.stringify(c.banner), tc: c.territoryController }; }, flipNm);
  const converged = a0.effective === b0.effective && a0.flipped === b0.flipped && a0.banner === b0.banner && a0.tc === b0.tc;
  const divergentOrders = a0.mine === "dawn" && b0.mine === "wander" && a0.mine !== b0.mine;
  const bIntact = b1.effective === b0.effective && b1.banner === b0.banner && b1.tc === b0.tc;
  const aIntact = a1.effective === a0.effective && a1.tc === a0.tc;              // A tampoco cambia (control = baseline colectivo, no per-hero)
  try { await pageB.screenshot({ path: join(OUT, "client-b.png") }); } catch (e) {}
  await pageB.close();
  ok("14 ★ NORTH STAR CONVERGENCIA 2-CLIENTE REAL LIVE: 2 páginas, MISMO nowMs ⇒ {effective,flipped,banner,tc} IDÉNTICOS pese a heroOrder divergente (A=dawn,B=wander); A mata 500 ⇒ control de B INTACTO (baseline colectivo server-auth, 0 desync/contención)",
     converged && divergentOrders && bIntact && aIntact && a0.effective !== null,
     `converged=${converged} divergent=${divergentOrders} bIntact=${bIntact} aIntact=${aIntact} A=${JSON.stringify(a0)} B=${JSON.stringify(b0)} A'=${JSON.stringify(a1)} B'=${JSON.stringify(b1)}`);

  await pageA.bringToFront();
  await pageA.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors + no non-favicon 404 during run", errors.length === 0 && net404.length === 0, [...errors.slice(0, 3), ...net404.slice(0, 3)].join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)  build LIVE vs ${LIVE}`);
process.exit(FAIL ? 1 : 0);
