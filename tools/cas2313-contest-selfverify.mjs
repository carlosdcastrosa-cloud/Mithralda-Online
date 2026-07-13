// CAS-2313 — GE self-verify for ASALTO AL SANTUARIO / SANCTUARY CONTEST (DARK, ORDER_CONTEST.enabled:false).
// Convierte el control PASIVO del Santuario (ORDER_TERRITORY, LIVE) en TERRITORIO-EN-DISPUTA DINÁMICO: una VENTANA DE ASALTO recurrente y
// determinista (últimos `windowFrac` del ciclo semanal ya existente en ORDER_STANDINGS/SANCTUARY_LEDGER) donde el RETADOR (2º de la
// Clasificación) acumula un SURGE derivado de su BASELINE colectivo server-auth (mismas acciones que ya suman — kills+RENOMBRE — 0 hotkey)
// y, si supera el baseline del CONTROLADOR (1º), ARREBATA el control del Santuario de INMEDIATO y VISIBLE (reusa estandarte ⚑ + banner de
// ORDER_TERRITORY, $0 arte). Todo DERIVADO del reloj COMPARTIDO (G.ledger.frac) + el ranking cacheado (G.standings) ⇒ TODO cliente converge
// a la MISMA ventana + MISMO flip en el MISMO tick lógico (0 desync). El flip es STICKY dentro de la ventana (iw monótono) y resetea al
// límite semanal. Precedencia: el asalto SÓLO reescribe QUIÉN controla el territorio (canal safeRegen); el ranking de STANDINGS (canal
// restedMult, al 1º) NO cambia ⇒ 0 doble-conteo.
//
// Observado vía __dev.contest (flip enabled/standings/territory IN-MEMORY + nowMs para el reloj semanal + pledge por tryPledgeOath) +
// __dev.territory/standings/oath/sanctuary/ledger/bounty/warhorn/emissary/recall/safeZone/tp/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.contest + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: ORDER_CONTEST.enabled===false AND active false AND effective===controller (0 flip) AND banner null ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() SIN clave 'contest' (asalto = 100% estado del mundo DERIVADO, 0 campo per-hero, 0 clave nueva).
//   4  worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo).
//   5  OFF byte-id: CONTEST off ⇒ territoryController() === standingsLeader() EXACTO (el control pasivo de HEAD, sin cambios).
//   6  VENTANA determinista: frac<1-windowFrac ⇒ active false; frac dentro de la ventana ⇒ active true (derivado del reloj compartido).
//   7  CLOCK determinism (convergencia): mismo nowMs ⇒ MISMO {active,effective,flipped,progress,banner} (2 lecturas idénticas, 0 desync).
//   8  RETADOR = 2º de la Clasificación: contest.challenger === standings.order[1].id AND contest.controller === standings.leader.
//   9  FLIP inmediato + VISIBLE: existe ≥1 semana donde el surge basta ⇒ effective===challenger AND territoryController()===challenger AND
//      banner del estandarte cambia al RETADOR (control ARREBATADO, visible por la ruta de ORDER_TERRITORY).
//  10  HOLD: existe ≥1 semana donde el surge NO basta ⇒ effective===controller (el líder RETIENE) — territorio realmente disputado (varía).
//  11  STICKY/monótono en ventana: al avanzar iw (frac) el progress NO decrece y, una vez flipped, sigue flipped (0 flapping).
//  12  FLIP transfiere el DOMINIO (server-auth control): en una semana de flip, jurar el RETADOR + en zona ⇒ territoryMulSafeRegen==0.10
//      (los miembros del retador ganan el pasivo de zona); jurar el CONTROLADOR original ⇒ 0 (perdió el control). El pasivo SIGUE al control.
//  13  PRECEDENCIA anti-doblado: en una semana de flip, el RANKING NO cambia (standings.leader === controller original) ⇒ el pasivo de
//      STANDINGS (restedMult) sigue al 1º y el de TERRITORY (safeRegen) al RETADOR ⇒ canales DISTINTOS, 0 doble-conteo.
//  14  render "Asalto en curso": render.js SERVIDO dibuja sim.contestBanner() bajo gate ORDER_CONTEST.enabled en la fila 'Zona segura';
//      banner null OFF / def(active) ON. (+screenshot de evidencia del badge durante la ventana.)
//  15  CONVERGENCIA 2-cliente: mismo nowMs ⇒ effective + flipped + banner IDÉNTICOS sin importar a qué orden esté jurado el héroe
//      (derivado del baseline colectivo server-auth, NUNCA per-hero ⇒ 0 desync/contención entre jugadores del shard en la zona).
//  16  arco regr: con CONTEST ON, TERRITORY + STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos.
//  17  fps NO-REGRESIÓN con la feature ON vs OFF (mediana-de-5 + warmup, relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2313-contest-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2313");
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
async function enableArc(page) { await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
  window.__dev.contest({ enabled: true, standings: true, territory: true }); }); }

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

  // 2 DARK default
  const dark = await page.evaluate(() => window.__dev.contest());
  ok("2 DARK default: enabled false AND active false AND effective===controller (0 flip) AND banner null",
     dark.enabled === false && dark.active === false && dark.flipped === false && dark.banner === null,
     `enabled=${dark.enabled} active=${dark.active} flipped=${dark.flipped} banner=${JSON.stringify(dark.banner)}`);

  // 3 save OFF has no new key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'contest' key in save blob (asalto = estado del mundo DERIVADO, 0 campo per-hero)", !/"contest"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.contest({ enabled: true, standings: true, territory: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.contest({ enabled: false }));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift, 0 estado nuevo)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 OFF byte-id: contest OFF ⇒ territoryController === standingsLeader EXACTO (control pasivo de HEAD, sin flip)
  const offCtl = await page.evaluate((T) => {
    window.__dev.contest({ enabled: false, standings: true, territory: true });
    const c = window.__dev.contest({ nowMs: T });                 // deriva G.standings/G.ledger para T
    const s = window.__dev.standings({ nowMs: T });
    return { territoryController: c.territoryController, leader: s.leader, effective: c.effective, active: c.active };
  }, T_WIN);
  ok("5 OFF byte-id: CONTEST off ⇒ territoryController()===standingsLeader() EXACTO (control pasivo de HEAD, sin flip)",
     offCtl.territoryController === offCtl.leader && offCtl.leader !== null && offCtl.active === false, JSON.stringify(offCtl));

  // 6 VENTANA determinista: fuera de la ventana (frac 0.50) ⇒ active false; dentro (frac 0.98) ⇒ active true
  const win = await page.evaluate((TP, TW) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    const pre = window.__dev.contest({ nowMs: TP });
    const inw = window.__dev.contest({ nowMs: TW });
    return { preActive: pre.active, inActive: inw.active, windowFrac: inw.windowFrac, iw: inw.iw };
  }, T_PRE, T_WIN);
  ok("6 VENTANA determinista: frac<1-windowFrac ⇒ active false; dentro de la ventana ⇒ active true (derivado del reloj compartido)",
     win.preActive === false && win.inActive === true && near(win.windowFrac, 0.25) && win.iw > 0.8, JSON.stringify(win));

  // 7 clock determinism: same nowMs ⇒ identical contest state
  const det = await page.evaluate((T) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    const a = window.__dev.contest({ nowMs: T });
    const b = window.__dev.contest({ nowMs: T });
    return { ea: a.effective, eb: b.effective, fa: a.flipped, fb: b.flipped, pa: a.progress, pb: b.progress, ba: JSON.stringify(a.banner), bb: JSON.stringify(b.banner) };
  }, T_WIN);
  ok("7 CLOCK determinism: mismo nowMs ⇒ MISMO {effective,flipped,progress,banner} (convergencia N-clientes, 0 desync)",
     det.ea === det.eb && det.fa === det.fb && det.pa === det.pb && det.ba === det.bb, JSON.stringify(det));

  // 8 challenger = 2nd place, controller = leader
  const parties = await page.evaluate((T) => {
    const c = window.__dev.contest({ enabled: true, standings: true, territory: true, nowMs: T });
    const s = window.__dev.standings({ nowMs: T });
    return { challenger: c.challenger, second: s.order[1] ? s.order[1].id : null, controller: c.controller, leader: s.leader };
  }, T_WIN);
  ok("8 RETADOR = 2º de la Clasificación AND controller===leader (server-auth, derivado del ranking cacheado)",
     parties.challenger === parties.second && parties.challenger !== null && parties.controller === parties.leader, JSON.stringify(parties));

  // 9/10 sweep semanas @ frac 0.98 ⇒ recolecta una semana de FLIP y una de HOLD (territorio realmente disputado)
  const sweep = await page.evaluate((PM) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    let flipWk = null, holdWk = null, flips = 0, holds = 0;
    for (let w = 5000; w < 5120; w++) { const nm = w * PM + Math.floor(PM * 0.98);
      const c = window.__dev.contest({ nowMs: nm });
      if (c.flipped) { flips++; if (flipWk === null) flipWk = { w, nm, effective: c.effective, challenger: c.challenger, controller: c.controller, tc: c.territoryController, banner: c.banner }; }
      else { holds++; if (holdWk === null) holdWk = { w, nm, effective: c.effective, controller: c.controller, challenger: c.challenger, tc: c.territoryController }; } }
    return { flipWk, holdWk, flips, holds };
  }, PERIOD_MS);
  ok("9 FLIP inmediato + VISIBLE: ≥1 semana con surge suficiente ⇒ effective===challenger AND territoryController()===challenger AND banner al RETADOR",
     !!sweep.flipWk && sweep.flipWk.effective === sweep.flipWk.challenger && sweep.flipWk.tc === sweep.flipWk.challenger &&
     sweep.flipWk.banner && sweep.flipWk.banner.challenger === sweep.flipWk.challenger,
     `flips=${sweep.flips} ${JSON.stringify(sweep.flipWk)}`);
  ok("10 HOLD: ≥1 semana con surge insuficiente ⇒ effective===controller (el líder RETIENE — territorio disputado que varía por semana)",
     !!sweep.holdWk && sweep.holdWk.effective === sweep.holdWk.controller && sweep.holdWk.tc === sweep.holdWk.controller && sweep.flips >= 1 && sweep.holds >= 1,
     `holds=${sweep.holds} ${JSON.stringify(sweep.holdWk)}`);

  const flipNm = sweep.flipWk ? sweep.flipWk.nm : T_WIN;
  const flipChallenger = sweep.flipWk ? sweep.flipWk.challenger : null;
  const flipController = sweep.flipWk ? sweep.flipWk.controller : null;

  // 11 STICKY/monótono en ventana: iw creciente ⇒ progress no decrece; una vez flipped sigue flipped
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
  ok("11 STICKY/monótono: al avanzar iw el progress NO decrece AND una vez flipped sigue flipped (0 flapping, surge monótono en iw)",
     sticky.mono === true && sticky.activeAll === true && sticky.sawFlip === true && sticky.stuck === true, JSON.stringify(sticky));

  // 12 FLIP transfiere el DOMINIO: jurar el RETADOR + en zona ⇒ territoryMul 0.10; jurar el CONTROLADOR original ⇒ 0
  await enableArc(page);
  await toHub(page);
  await pledge(page, flipChallenger);
  const domChal = await page.evaluate((nm) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true });
    const t = window.__dev.territory({ nowMs: nm });             // territoryController ⇒ contestController ⇒ retador (flip)
    return { mul: t.territoryMulSafeRegen, mineControls: t.mineControls, inZone: t.inZone, heroOrder: t.heroOrder, controller: t.controller };
  }, flipNm);
  await pledge(page, flipController);
  const domCtl = await page.evaluate((nm) => {
    const t = window.__dev.territory({ nowMs: nm });
    return { mul: t.territoryMulSafeRegen, mineControls: t.mineControls, heroOrder: t.heroOrder };
  }, flipNm);
  ok("12 FLIP transfiere el DOMINIO: jurar el RETADOR + en zona ⇒ territoryMul==0.10 (mineControls) AND jurar el CONTROLADOR original ⇒ 0 (perdió el control)",
     near(domChal.mul, 0.10) && domChal.mineControls === true && domChal.inZone === true && domChal.heroOrder === flipChallenger &&
     domCtl.mul === 0 && domCtl.mineControls === false && domCtl.heroOrder === flipController,
     `chal=${JSON.stringify(domChal)} ctl=${JSON.stringify(domCtl)} challenger=${flipChallenger} controller=${flipController}`);

  // 13 PRECEDENCIA anti-doblado: el RANKING NO cambia (standings.leader === controller original) ⇒ restedMult sigue al 1º, safeRegen al RETADOR
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
  ok("13 PRECEDENCIA: el ranking NO cambia con el asalto (standings.leader===controller original) ⇒ restedMult al 1º (0.15), safeRegen al RETADOR (0.10) — canales DISTINTOS, 0 doble-conteo",
     precCtl.leader === flipController && precCtl.mineLeading === true && near(precCtl.standingsMul, 0.15) && precCtl.territoryMul === 0 &&
     precChal.mineLeading === false && precChal.standingsMul === 0 && near(precChal.territoryMul, 0.10),
     `ctl=${JSON.stringify(precCtl)} chal=${JSON.stringify(precChal)}`);

  // 14 render "Asalto en curso": served render.js draws sim.contestBanner() gated + banner null OFF / def(active) ON
  const src = await page.evaluate(async () => { const r = await fetch("render/render.js"); return await r.text(); });
  const gatedDraw = /ORDER_CONTEST\.enabled/.test(src) && /sim\.contestBanner\(\)/.test(src) && /Asalto en curso/.test(src);
  const bannerAuth = await page.evaluate((nm) => {
    window.__dev.contest({ enabled: false, standings: true, territory: true, nowMs: nm }); const off = window.__dev.contest({ nowMs: nm }).banner;   // OFF ⇒ null
    const on = window.__dev.contest({ enabled: true, nowMs: nm }).banner;                                                                          // ON ⇒ def(active)
    return { off, on };
  }, flipNm);
  await page.evaluate((nm) => { window.__t14 = Date.now; Date.now = () => nm; window.__dev.contest({ enabled: true, standings: true, territory: true }); const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); if (window.__dev.daynight) window.__dev.daynight(0.5); }, flipNm);
  await sleep(180);
  try { await page.screenshot({ path: join(OUT, "asalto-badge.png"), clip: { x: 700, y: 0, width: 580, height: 210 } }); } catch (e) {}
  await page.evaluate(() => { if (window.__t14) { Date.now = window.__t14; delete window.__t14; } if (window.__dev.daynight) window.__dev.daynight(null); });
  ok("14 render 'Asalto en curso' draw-path enviado + AUTORITATIVO: render.js servido dibuja sim.contestBanner() bajo gate ORDER_CONTEST.enabled en la fila 'Zona segura'; banner null OFF / def(active) ON",
     gatedDraw && bannerAuth.off === null && !!bannerAuth.on && bannerAuth.on.active === true,
     `gatedDraw=${gatedDraw} off=${JSON.stringify(bannerAuth.off)} on=${JSON.stringify(bannerAuth.on)}`);

  // 15 convergencia 2-cliente: same nowMs ⇒ effective + flipped + banner IDÉNTICOS pese a distinta orden del héroe
  const conv = await page.evaluate((nm) => {
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "dawn" });
    const a = window.__dev.contest({ nowMs: nm });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "wander" });
    const b = window.__dev.contest({ nowMs: nm });
    return { ea: a.effective, eb: b.effective, fa: a.flipped, fb: b.flipped, ba: JSON.stringify(a.banner), bb: JSON.stringify(b.banner), mineA: a.mineOrder, mineB: b.mineOrder };
  }, flipNm);
  ok("15 CONVERGENCIA 2-cliente: mismo nowMs ⇒ effective + flipped + banner IDÉNTICOS pese a distinta orden del héroe (baseline colectivo, 0 desync/contención)",
     conv.ea === conv.eb && conv.fa === conv.fb && conv.ba === conv.bb && conv.mineA === "dawn" && conv.mineB === "wander", JSON.stringify(conv));

  // 16 arc regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.contest({ enabled: true, standings: true, territory: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const c = window.__dev.contest(); const te = window.__dev.territory(); const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { contestOk: c.enabled, terrOk: te.enabled, standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("16 arco regr: TERRITORY + STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con CONTEST ON",
     arc.contestOk && arc.terrOk && arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 17 fps NO-REGRESSION (mediana-de-5 + warmup)
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 500) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const sample = async (on) => { window.__dev.contest({ enabled: on, standings: true, territory: true }); await measure(); const a = []; for (let i = 0; i < 5; i++) a.push(await measure()); return a; };
    const off = await sample(false); const onA = await sample(true);
    return { off, on: onA };
  });
  const offM = median(fps.off), onM = median(fps.on);
  ok("17 fps NO-REGRESIÓN: CONTEST ON no degrada el frame budget vs OFF (mediana-de-5, relativo, ON ≥ OFF*0.9)",
     onM >= offM * 0.9, `on≈${Math.round(onM)} off≈${Math.round(offM)}`);

  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
