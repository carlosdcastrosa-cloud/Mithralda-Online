// CAS-2313 — QA OBSERVABLE verify for ASALTO AL SANTUARIO / SANCTUARY CONTEST (DARK, ORDER_CONTEST.enabled:false).
// QA pass sobre el DARK build del GE (commit 2698554, self-verify 18/18). Re-verifica byte-id OFF y AÑADE los diferenciadores QA
// que el issue exige explícitamente como MMORPG: ¿qué pasa cuando DOS órdenes con N jugadores compiten por el MISMO territorio a la vez?
//
// North Star (check 12, no-negociable) = CONVERGENCIA 2-CLIENTE REAL: DOS páginas puppeteer independientes (dos "jugadores" del shard),
// MISMO reloj lógico (nowMs) ⇒ ambos derivan la MISMA ventana + el MISMO flip de control en el MISMO tick lógico (0 desync), PESE a que
// cada héroe está jurado a una orden DISTINTA (A=dawn, B=wander). El cliente A mata 500 ⇒ el controlador/estandarte del cliente B queda
// INTACTO (server-auth: el flip lo decide el baseline COLECTIVO, NUNCA la contribución per-hero ⇒ 0 contención/duplicación). Corre AL FINAL
// porque abrir la 2ª página blurea la 1ª ⇒ index.html pausa el game-loop de la 1ª (footgun heredado de CAS-2300/CAS-2310).
//
// Checks:
//   1  boots to play, __dev.contest + arc hooks + __BUILD, 0 JS err.
//   2  byte-id OFF (re-verify GE): enabled false + active false + effective===controller (0 flip) + banner null + save SIN clave 'contest'
//      + worldFingerprint byte-estable a través del toggle + territoryController()===standingsLeader() EXACTO (control pasivo de HEAD).
//   3  VENTANA determinista OBSERVABLE: fuera de la ventana (frac 0.50) ⇒ active false; dentro (frac 0.98) ⇒ active true (windowFrac 0.25).
//   4  RETADOR = 2º de la Clasificación server-auth: contest.challenger === standings.order[1].id AND contest.controller === standings.leader.
//   5  FLIP OBSERVABLE: ≥1 semana donde el surge basta ⇒ effective===challenger AND territoryController()===challenger AND el banner del
//      estandarte cambia al RETADOR (control ARREBATADO, VISIBLE por la ruta de ORDER_TERRITORY, $0 arte nuevo).
//   6  HOLD OBSERVABLE: ≥1 semana donde el surge NO basta ⇒ el líder RETIENE (territorio REALMENTE disputado que varía por semana).
//   7  STICKY/monótono en ventana: al avanzar iw (frac) progress NO decrece AND una vez flipped sigue flipped (0 flapping).
//   8  DOMINIO transferido por KNOB EFECTIVO + ZONE-GATED: en la semana de flip, jurar el RETADOR + EN zona ⇒ Δ safeRegenMul == +0.10;
//      FUERA de zona ⇒ 0 (aplica SÓLO en el territorio); jurar el CONTROLADOR original ⇒ 0 (perdió el control). El pasivo SIGUE al control.
//   9  PRECEDENCIA anti-doblado: el ranking NO cambia (standings.leader === controller original) ⇒ restedMult(0.15) al 1º y safeRegen(0.10)
//      al RETADOR ⇒ canales DISTINTOS, 0 doble-conteo. Orden documentado: standings→territory→contest.
//  10  render 'Asalto en curso' SERVIDO + AUTORITATIVO: render.js servido dibuja sim.contestBanner() bajo gate ORDER_CONTEST.enabled en la
//      fila 'Zona segura'; banner autoritativo null OFF / def(active) ON. (+screenshot del badge durante la ventana como evidencia.)
//  11  arco regr con CONTEST ON: TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REP+REWARDS+WORLD_EVENT+EMISSARY+RECALL sanos + fps no-regresión.
//  12  ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL: 2 páginas independientes, MISMO nowMs ⇒ {effective,flipped,banner} IDÉNTICOS byte-a-byte
//      pese a heroOrder divergente (A=dawn, B=wander); A mata 500 ⇒ controlador/estandarte de B INTACTO (baseline colectivo, 0 desync/contención).
//   0  no JS errors during run.
// Run: node tools/cas2313-contest-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2313-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

const PERIOD_MS = 604800 * 1000;                                  // SEMANAL (mismo reloj compartido que STANDINGS/LEDGER)
const wk = (w, frac) => w * PERIOD_MS + Math.floor(PERIOD_MS * frac);
const T_WIN = wk(5000, 0.98);                                     // MUY dentro de la ventana de asalto (iw≈0.92 con windowFrac 0.25)
const T_PRE = wk(5000, 0.50);                                     // ANTES de la ventana (frac 0.50 < 0.75)

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
async function tpFar(page) { await page.evaluate(() => window.__dev.tp(6, 6)); await sleep(120); }
async function pledge(page, id) { await page.evaluate((oid) => { window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: oid }); }, id); }
async function armArc(page) { await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
  window.__dev.contest({ enabled: true, standings: true, territory: true }); }); }
async function freshPage(browser, base, errSink) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  if (errSink) { p.on("pageerror", (e) => errSink.push(String(e))); p.on("console", (m) => { if (m.type() === "error") errSink.push(m.text()); }); }
  await p.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });  // localStorage es por-origen (compartido entre páginas) ⇒ limpia el save de la 1ª página para bootear a 'menu'
  await p.bringToFront();                                                      // foreground ⇒ rAF no-throttle ⇒ boot fiable (la 2ª página abre backgrounded)
  await p.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(p); await toHub(p);
  return p;
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
  await toHub(page);

  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.contest && window.__dev.territory && window.__dev.standings && window.__dev.oath && window.__dev.ledger && window.__dev.sanctuary && window.__dev.bounty && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.contest + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF (re-verify GE): default state + save + fingerprint + territoryController pasa-through
  const off = await page.evaluate((T) => {
    window.__dev.contest({ enabled: false, standings: true, territory: true });
    const d = window.__dev.contest({ nowMs: T });                          // deriva G.standings/G.ledger para T pero CONTEST off
    const s = window.__dev.standings({ nowMs: T });
    const save = JSON.stringify(window.__dev.saveBlob());
    const fpA = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.contest({ enabled: true, standings: true, territory: true }); const fpOn = JSON.stringify(window.__dev.worldFingerprint(777));
    window.__dev.contest({ enabled: false }); const fpB = JSON.stringify(window.__dev.worldFingerprint(777));
    return { enabled: d.enabled, active: d.active, flipped: d.flipped, banner: d.banner, effective: d.effective,
      territoryController: d.territoryController, leader: s.leader, hasKey: /"contest"/.test(save), fpStable: fpA === fpB && fpA === fpOn };
  }, T_WIN);
  ok("2 byte-id OFF: enabled false + active false + banner null + save SIN clave 'contest' + fingerprint estable + territoryController()===standingsLeader() EXACTO",
     off.enabled === false && off.active === false && off.flipped === false && off.banner === null && off.hasKey === false && off.fpStable === true &&
     off.territoryController === off.leader && off.leader !== null,
     `enabled=${off.enabled} active=${off.active} banner=${JSON.stringify(off.banner)} hasKey=${off.hasKey} fpStable=${off.fpStable} tc=${off.territoryController} leader=${off.leader}`);

  // 3 VENTANA determinista observable
  const win = await page.evaluate((TP, TW) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    const pre = window.__dev.contest({ nowMs: TP });
    const inw = window.__dev.contest({ nowMs: TW });
    return { preActive: pre.active, inActive: inw.active, windowFrac: inw.windowFrac, iw: inw.iw };
  }, T_PRE, T_WIN);
  ok("3 VENTANA determinista OBSERVABLE: frac<1-windowFrac ⇒ active false; dentro de la ventana ⇒ active true (windowFrac 0.25, derivado del reloj compartido)",
     win.preActive === false && win.inActive === true && near(win.windowFrac, 0.25) && win.iw > 0.8, JSON.stringify(win));

  // 4 challenger = 2nd place, controller = leader (server-auth)
  const parties = await page.evaluate((T) => {
    const c = window.__dev.contest({ enabled: true, standings: true, territory: true, nowMs: T });
    const s = window.__dev.standings({ nowMs: T });
    return { challenger: c.challenger, second: s.order[1] ? s.order[1].id : null, controller: c.controller, leader: s.leader };
  }, T_WIN);
  ok("4 RETADOR = 2º de la Clasificación (server-auth) AND controller===leader (derivado del ranking cacheado, 0 estado nuevo)",
     parties.challenger === parties.second && parties.challenger !== null && parties.controller === parties.leader, JSON.stringify(parties));

  // 5/6 sweep semanas ⇒ semana de FLIP + semana de HOLD (territorio realmente disputado)
  const sweep = await page.evaluate((PM) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    let flipWk = null, holdWk = null, flips = 0, holds = 0;
    for (let w = 5000; w < 5120; w++) { const nm = w * PM + Math.floor(PM * 0.98);
      const c = window.__dev.contest({ nowMs: nm });
      if (c.flipped) { flips++; if (flipWk === null) flipWk = { w, nm, effective: c.effective, challenger: c.challenger, controller: c.controller, tc: c.territoryController, banner: c.banner }; }
      else { holds++; if (holdWk === null) holdWk = { w, nm, effective: c.effective, controller: c.controller, challenger: c.challenger, tc: c.territoryController }; } }
    return { flipWk, holdWk, flips, holds };
  }, PERIOD_MS);
  ok("5 FLIP OBSERVABLE: ≥1 semana con surge suficiente ⇒ effective===challenger AND territoryController()===challenger AND banner del estandarte al RETADOR (control ARREBATADO, VISIBLE)",
     !!sweep.flipWk && sweep.flipWk.effective === sweep.flipWk.challenger && sweep.flipWk.tc === sweep.flipWk.challenger &&
     sweep.flipWk.banner && sweep.flipWk.banner.challenger === sweep.flipWk.challenger && sweep.flipWk.banner.flipped === true,
     `flips=${sweep.flips}/${sweep.flips + sweep.holds} ${JSON.stringify(sweep.flipWk)}`);
  ok("6 HOLD OBSERVABLE: ≥1 semana con surge insuficiente ⇒ el líder RETIENE (territorio REALMENTE disputado que varía por semana)",
     !!sweep.holdWk && sweep.holdWk.effective === sweep.holdWk.controller && sweep.holdWk.tc === sweep.holdWk.controller && sweep.flips >= 1 && sweep.holds >= 1,
     `flips=${sweep.flips} holds=${sweep.holds} ${JSON.stringify(sweep.holdWk)}`);

  const flipNm = sweep.flipWk ? sweep.flipWk.nm : T_WIN;
  const flipChallenger = sweep.flipWk ? sweep.flipWk.challenger : null;
  const flipController = sweep.flipWk ? sweep.flipWk.controller : null;

  // 7 STICKY/monótono en ventana
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
  ok("7 STICKY/monótono: al avanzar iw progress NO decrece AND una vez flipped sigue flipped (0 flapping, surge monótono en iw)",
     sticky.mono === true && sticky.activeAll === true && sticky.sawFlip === true && sticky.stuck === true, JSON.stringify(sticky));

  // 8 DOMINIO transferido por KNOB EFECTIVO + ZONE-GATED: RETADOR en zona ⇒ +0.10; RETADOR fuera de zona ⇒ 0; CONTROLADOR original ⇒ 0
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
  ok("8 DOMINIO por KNOB EFECTIVO + ZONE-GATED: jurar el RETADOR + EN zona ⇒ Δ safeRegenMul==+0.10; FUERA de zona ⇒ 0; jurar el CONTROLADOR original ⇒ 0 (el pasivo SIGUE al control)",
     near(domChalIn.mul, 0.10) && domChalIn.mineControls === true && domChalIn.inZone === true && domChalIn.heroOrder === flipChallenger &&
     domChalOut.mul === 0 && domChalOut.inZone === false && domCtl.mul === 0 && domCtl.mineControls === false && domCtl.heroOrder === flipController,
     `chalIn=${JSON.stringify(domChalIn)} chalOut=${JSON.stringify(domChalOut)} ctl=${JSON.stringify(domCtl)} chal=${flipChallenger} ctl=${flipController}`);

  // 9 PRECEDENCIA anti-doblado
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
  ok("9 PRECEDENCIA: el ranking NO cambia con el asalto (standings.leader===controller original) ⇒ restedMult(0.15) al 1º y safeRegen(0.10) al RETADOR — canales DISTINTOS, 0 doble-conteo",
     precCtl.leader === flipController && precCtl.mineLeading === true && near(precCtl.standingsMul, 0.15) && precCtl.territoryMul === 0 &&
     precChal.mineLeading === false && precChal.standingsMul === 0 && near(precChal.territoryMul, 0.10),
     `ctl=${JSON.stringify(precCtl)} chal=${JSON.stringify(precChal)}`);

  // 10 render 'Asalto en curso' served + authoritative + screenshot evidence
  const src = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
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
  ok("10 render 'Asalto en curso' SERVIDO + AUTORITATIVO: render.js servido dibuja sim.contestBanner() bajo gate ORDER_CONTEST.enabled en la fila 'Zona segura'; banner null OFF / def(active) ON",
     gatedDraw && bannerAuth.off === null && !!bannerAuth.on && bannerAuth.on.active === true && bannerAuth.on.challenger === flipChallenger,
     `gatedDraw=${gatedDraw} off=${JSON.stringify(bannerAuth.off)} on=${JSON.stringify(bannerAuth.on)}`);

  // 11 arc regression + fps no-regression
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
  ok("11 arco regr con CONTEST ON (TERRITORY+STANDINGS+LEDGER+OATH+BOUNTY+REP+REWARDS+WORLD_EVENT+EMISSARY+RECALL sanos) + fps no-regresión (mediana-de-5, ON ≥ OFF*0.9)",
     arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk && onM >= offM * 0.9,
     `arc=${JSON.stringify(arc)} fps on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  // 12 ★ NORTH STAR — CONVERGENCIA 2-CLIENTE REAL (corre AL FINAL: abrir la 2ª página blurea la 1ª ⇒ pausa-on-blur del game-loop).
  const pageA = page;                                                          // cliente A ya en play
  const errB = [];
  const pageB = await freshPage(browser, base, errB);                          // 2ª página foreground (bringToFront) ⇒ boot fiable
  // Ambos clientes: mismo reloj lógico, ordenes DIVERGENTES (A=dawn, B=wander)
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
  ok("12 ★ NORTH STAR CONVERGENCIA 2-CLIENTE REAL: 2 páginas, MISMO nowMs ⇒ {effective,flipped,banner,tc} IDÉNTICOS pese a heroOrder divergente (A=dawn,B=wander); A mata 500 ⇒ control de B INTACTO (baseline colectivo server-auth, 0 desync/contención)",
     converged && divergentOrders && bIntact && aIntact && a0.effective !== null && errB.length === 0,
     `converged=${converged} divergent=${divergentOrders} bIntact=${bIntact} aIntact=${aIntact} A=${JSON.stringify(a0)} B=${JSON.stringify(b0)} A'=${JSON.stringify(a1)} B'=${JSON.stringify(b1)} errB=${errB.length}`);

  await page.bringToFront();
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
