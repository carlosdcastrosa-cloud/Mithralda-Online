// CAS-2305 — QA OBSERVABLE for CLASIFICACIÓN DE ÓRDENES / ORDER STANDINGS (DARK, ORDER_STANDINGS.enabled:false).
// Capa SOCIAL COMPETITIVA sobre el arco del Santuario: un RANKING SEMANAL COMPARTIDO de las 3 Órdenes deterministas
// (dawn/iron/wander) por su BASELINE colectivo del Libro (SANCTUARY_LEDGER, LIVE). El ranking es una función PURA del reloj de
// pared (0 RNG) ⇒ TODO cliente con el mismo reloj converge a la MISMA clasificación (0 desync bajo N jugadores). La orden en el
// PUESTO 1 esa semana otorga a sus miembros (por Juramento) un PASIVO FIJO y ACOTADO: +leadValue al mult de Descanso.
//
// QA differentiators vs GE self-verify (que ya cubre el estado interno vía el hook en UNA sola página):
//   · CHECK 9 = CONVERGENCIA 2-CLIENTE REAL (el North Star del ticket): DOS páginas independientes (2 clientes reales del shard),
//     MISMO nowMs inyectado ⇒ el `order` (totales+rangos+leader) es IDÉNTICO byte-a-byte, sin importar a qué Orden esté jurado
//     cada héroe (usa SÓLO el baseline colectivo, NUNCA la contribución per-hero) ⇒ 0 desync, server-authority-ready. Además:
//     la orden del héroe (heroOrder) DIVERGE por cliente pero el pasivo del líder es el MISMO estado del mundo (sin contención).
//   · El PASIVO DEL LÍDER se prueba por el KNOB EFECTIVO real de gainXP (restedXpMult 1.5→1.65), gateado a LIDERAR (no basta jurar).
//   · Render por NAVEGACIÓN REAL: ♛ nameplate (tp real + Date.now pin) + fila del Tablón (bountyTP+KeyE→bounty).
//   · fps mediana-de-3 (evita el single-sample false-FAIL de headless).
//
// Checks:
//   1  boots to play, __dev.standings + arc hooks + __BUILD, 0 JS err.
//   2  DARK default served: enabled false AND leader null AND gExists false AND standingsMul 0 ⇒ byte-id OFF (clasificación dormida).
//   3  byte-id OFF: saveBlob() sin clave 'standings' AND worldFingerprint byte-stable al togglear enabled (0 RNG drift).
//   4  RANKING PURO: mismo nowMs ⇒ mismo leader + totales/rangos; ranking válido (rangos 1..3, desc, leader==rango1).
//   5  PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND mineLeading false AND standingsMul 0 (la clasificación existe igual).
//   6  LEADER passive por KNOB EFECTIVO: jurar la orden LÍDER ⇒ mineLeading true AND restedXpMult == base+0.15 (seam real de Descanso).
//   7  LEADER passive gateado a LIDERAR: jurar una orden NO-líder ⇒ mineLeading false AND standingsMul 0 AND restedXpMult == base.
//   8  ROTACIÓN semanal: barre semanas y encuentra los 3 líderes ⇒ identidad/rivalidad social cambiante (0 RNG, determinista).
//   9  *** CONVERGENCIA 2-CLIENTE REAL ***: 2 páginas, mismo nowMs ⇒ `order` (totales+leader) IDÉNTICO; heroOrder diverge; sin contención.  (AL FINAL)
//  10  render nameplate ♛: NAV REAL, orden del héroe LIDERANDO ⇒ se dibuja el ♛ (Δ px STANDINGS on vs off; tag/★ idénticos, Date.now pin).
//  11  render standings-row: NAV REAL al Tablón (bountyTP+KeyE→bounty) ⇒ la fila de Clasificación crece el panel con ON vs OFF.
//  12  arco regr full-stack: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con STANDINGS ON.
//  13  fps NO-REGRESIÓN (mediana-de-3) con la feature ON vs OFF (relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2305-standings-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2305-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000. Elegimos una semana con frac alto (baselines separados ⇒ ranking claro).
const PERIOD_MS = 604800 * 1000;
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.90);   // frac ≈ 0.90 (misma ventana que la self-verify: leader='dawn')
const T_MP = 8000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.61);     // ventana dedicada al test 2-cliente

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };

// clear any shared-origin save so each page boots to a FRESH hero (2 clientes ⇒ 2 héroes) — footgun warhorn/emissary/ledger.
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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(120); }
// arma el juramento (oath+rep+rank) para poder jurar una orden.
async function armOath(page) { await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); }); }
// jura una orden pasando SIEMPRE el cooldown de cambio (switchCooldownKills) antes.
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots to play, __dev.standings + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default served
  const dark = await page.evaluate(() => window.__dev.standings());
  ok("2 DARK default served: enabled false AND leader null AND gExists false AND standingsMul 0 (clasificación dormida, byte-id OFF)",
     dark.enabled === false && dark.leader === null && dark.gExists === false && dark.standingsMulRestedMult === 0,
     `enabled=${dark.enabled} leader=${dark.leader} gExists=${dark.gExists} mul=${dark.standingsMulRestedMult} restedXpMult=${dark.restedXpMult}`);

  // 3 byte-id OFF: save has no key + worldFingerprint stable across toggle
  const byteId = await page.evaluate(() => {
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.standings({ enabled: true });
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.standings({ enabled: false });
    return { noKey: !/"standings"/.test(saveOff), fpStable: fpBefore === fpAfter, len: saveOff.length };
  });
  ok("3 byte-id OFF: saveBlob() sin clave 'standings' AND worldFingerprint byte-stable al togglear enabled (0 RNG drift)",
     byteId.noKey && byteId.fpStable, JSON.stringify(byteId));

  // 4 ranking puro + válido
  const valid = await page.evaluate((T) => {
    window.__dev.standings({ enabled: true });
    const a = window.__dev.standings({ nowMs: T }), b = window.__dev.standings({ nowMs: T });
    const byRank = a.order.slice().sort((x, y) => x.rank - y.rank);
    const ranks = a.order.map(o => o.rank).sort().join(",");
    let desc = true; for (let i = 1; i < byRank.length; i++) if (byRank[i].total > byRank[i - 1].total) desc = false;
    return { detLeader: a.leader === b.leader, detOrder: JSON.stringify(a.order.map(o => [o.id, o.rank, o.total])) === JSON.stringify(b.order.map(o => [o.id, o.rank, o.total])),
      ranks, desc, leader: a.leader, rank1: byRank[0].id, n: a.order.length, order: a.order.map(o => [o.id, o.rank, o.total]) };
  }, T_LATE);
  ok("4 RANKING PURO+válido: mismo nowMs ⇒ mismo leader/order (determinista) AND rangos 1..3 desc AND leader==rango1",
     valid.detLeader && valid.detOrder && valid.ranks === "1,2,3" && valid.desc && valid.leader === valid.rank1 && valid.n === 3,
     `leader=${valid.leader} order=${JSON.stringify(valid.order)}`);

  // determina el LÍDER de la semana T_LATE (para gatear el pasivo)
  const leader = await page.evaluate((T) => window.__dev.standings({ enabled: true, nowMs: T }).leader, T_LATE);
  const nonLeader = ["dawn", "iron", "wander"].find(id => id !== leader);

  // 5 pledge required: ON + no oath ⇒ heroOrder null, mineLeading false, standingsMul 0 (community ranking still exists)
  const noOath = await page.evaluate((T) => {
    window.__dev.oath({ enabled: false });
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { heroOrder: s.heroOrder, mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, leaderExists: s.leader !== null };
  }, T_LATE);
  ok("5 PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND mineLeading false AND standingsMul 0 (clasificación existe igual)",
     noOath.heroOrder === null && noOath.mineLeading === false && noOath.mul === 0 && noOath.leaderExists === true, JSON.stringify(noOath));

  // 6 leader passive por KNOB EFECTIVO real: jurar la orden LÍDER ⇒ mineLeading true AND restedXpMult == base(1.5)+0.15
  await armOath(page);
  await pledge(page, leader);
  const lead = await page.evaluate((T) => {
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, restedXpMult: s.restedXpMult, heroOrder: s.heroOrder };
  }, T_LATE);
  ok("6 LEADER passive por KNOB EFECTIVO: jurar la orden LÍDER ⇒ mineLeading true AND standingsMul 0.15 AND restedXpMult 1.5→1.65 (seam real de Descanso)",
     lead.mineLeading === true && near(lead.mul, 0.15) && near(lead.restedXpMult, 1.65) && lead.heroOrder === leader, `leader=${leader} ${JSON.stringify(lead)}`);

  // 7 leader passive gateado a LIDERAR: jurar una orden NO-líder ⇒ mineLeading false, standingsMul 0, restedXpMult base
  await pledge(page, nonLeader);
  const gated = await page.evaluate((T) => {
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, restedXpMult: s.restedXpMult, heroOrder: s.heroOrder };
  }, T_LATE);
  ok("7 LEADER passive gateado a LIDERAR: jurar orden NO-líder ⇒ mineLeading false AND standingsMul 0 AND restedXpMult 1.5 (no basta jurar)",
     gated.mineLeading === false && gated.mul === 0 && near(gated.restedXpMult, 1.5) && gated.heroOrder === nonLeader, `nonLeader=${nonLeader} ${JSON.stringify(gated)}`);

  // 8 rotación semanal: barre 60 semanas y cuenta líderes distintos
  const rot = await page.evaluate((PM) => {
    const seen = new Set();
    for (let w = 5000; w < 5060; w++) { const s = window.__dev.standings({ enabled: true, nowMs: w * PM + Math.floor(PM * 0.9) }); if (s.leader) seen.add(s.leader); }
    return { distinct: seen.size, leaders: Array.from(seen).sort() };
  }, PERIOD_MS);
  ok("8 ROTACIÓN semanal: los 3 líderes rotan a lo largo de las semanas (rivalidad/identidad social cambiante, 0 RNG)",
     rot.distinct === 3, JSON.stringify(rot));

  // 10 render nameplate ♛ (Date.now pinned ⇒ tick deriva SIEMPRE la misma semana ⇒ mismo líder; hero en la orden LÍDER ⇒ sólo ♛ difiere)
  await pledge(page, leader);
  const crown = await page.evaluate(async (T) => {
    window.dispatchEvent(new Event("focus"));                // despausa el loop por si `page` quedó blureado
    await new Promise(r => setTimeout(r, 80));
    const realNow = Date.now; Date.now = () => T;
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.34), y0 = Math.floor(cv.height * 0.20), bw = Math.floor(cv.width * 0.32), bh = Math.floor(cv.height * 0.34);
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.setHeroHp) window.__dev.setHeroHp(9999);   // el héroe DEBE estar vivo: drawHeroNameplate (tag+♛) gateado a !h.dead
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    window.__dev.ledger({ enabled: true });                    // Libro live (★ igual en ambos ⇒ no interfiere)
    window.__dev.standings({ enabled: false });                // sin ♛
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off0 = grab();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off1 = grab();                                       // control de churn (bob del héroe)
    window.__dev.standings({ enabled: true });                 // ♛ aparece (orden del héroe == líder, persiste: Date.now pinned)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    const mineLeading = window.__dev.standings().mineLeading;
    let signal = 0, churn = 0; for (let i = 0; i < on.length; i += 4) {
      const dOn = Math.abs(on[i] - off0[i]) + Math.abs(on[i + 1] - off0[i + 1]) + Math.abs(on[i + 2] - off0[i + 2]);
      const dBg = Math.abs(off1[i] - off0[i]) + Math.abs(off1[i + 1] - off0[i + 1]) + Math.abs(off1[i + 2] - off0[i + 2]);
      if (dBg > 25) churn++;
      if (dOn > 40 && dBg <= 25) signal++;
    }
    if (window.__dev.daynight) window.__dev.daynight(null);
    Date.now = realNow;
    const hh = window.__dev.standings().hero;
    return { signal, churn, mineLeading, dead: hh && hh.dead };
  }, T_LATE);
  ok("10 render nameplate ♛: NAV REAL, orden del héroe LIDERANDO ⇒ se dibuja el ♛ junto al tag (Δ px STANDINGS on vs off)",
     crown.mineLeading === true && crown.dead === false && crown.signal > 3, `signal=${crown.signal} churn=${crown.churn} mineLeading=${crown.mineLeading} dead=${crown.dead}`);

  // 11 render standings-row via REAL nav to the bounty board
  const row = await page.evaluate(async () => {
    for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
    const press = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", key: "e", bubbles: true }));
    window.__dev.standings({ enabled: false });
    window.__dev.bountyTP();
    await new Promise(r => setTimeout(r, 60));
    let scene = "";
    for (let i = 0; i < 6 && (scene = window.__dev.scene()) !== "bounty"; i++) { press(); await new Promise(r => setTimeout(r, 90)); }
    scene = window.__dev.scene();
    if (scene !== "bounty") return { scene, signal: -1 };
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.18), y0 = Math.floor(cv.height * 0.10), bw = Math.floor(cv.width * 0.64), bh = Math.floor(cv.height * 0.80);
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off = grab();
    window.__dev.standings({ enabled: true });                 // panel crece +58 + fila de Clasificación
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    let signal = 0; for (let i = 0; i < on.length; i += 4) {
      if (Math.abs(on[i] - off[i]) + Math.abs(on[i + 1] - off[i + 1]) + Math.abs(on[i + 2] - off[i + 2]) > 45) signal++;
    }
    press();
    for (let i = 0; i < 4 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
    await new Promise(r => setTimeout(r, 60));
    return { scene, signal, back: window.__dev.scene() };
  });
  ok("11 render standings-row (NAV REAL bountyTP+KeyE→bounty): la fila de Clasificación crece el panel con ON vs OFF (panel estático)",
     row.signal > 200, `scene=${row.scene} signal=${row.signal} back=${row.back}`);

  // 12 arc regression full-stack
  await page.evaluate(async () => { for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); } });
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 }).catch(() => {});
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.standings({ enabled: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const st = window.__dev.standings(), l = window.__dev.ledger(), o = window.__dev.oath(), b = window.__dev.bounty({ act: true }), s = window.__dev.sanctuary(), q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(), em = window.__dev.emissary(), rc = window.__dev.recall();
    return { standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("12 arco regr full-stack: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con STANDINGS ON",
     arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 13 fps no-regression (mediana-de-3 para evitar el single-sample false-FAIL)
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 700) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    const offs = [], ons = [];
    for (let i = 0; i < 3; i++) { window.__dev.standings({ enabled: false }); offs.push(await measure()); window.__dev.standings({ enabled: true }); ons.push(await measure()); }
    return { offs, ons };
  });
  const fpsOff = median(fps.offs), fpsOn = median(fps.ons);
  ok("13 fps NO-REGRESIÓN (mediana-de-3): STANDINGS ON no degrada el frame budget vs OFF (headless ⇒ relativo, ON ≥ OFF*0.9)",
     fpsOn >= fpsOff * 0.9, `on≈${Math.round(fpsOn)} off≈${Math.round(fpsOff)}`);

  await page.screenshot({ path: join(OUT, "observable.png") });

  // 9 *** CONVERGENCIA 2-CLIENTE REAL *** (AL FINAL: abrir un 2º page blurea `page`, pero ya no quedan render-probes) — DOS páginas
  // independientes (2 clientes reales del shard), MISMO nowMs inyectado ⇒ el `order` (totales+rangos+leader) es IDÉNTICO byte-a-byte;
  // cada héroe está jurado a una Orden DISTINTA (heroOrder diverge) pero el ranking compartido NO cambia (usa el baseline colectivo,
  // NUNCA la contribución per-hero) ⇒ 0 desync bajo N jugadores. Cliente A mata 500 ⇒ su contribución sube pero el `order` de B NO se altera.
  const pageB = await freshPage(browser, base, errors);
  await toHub(pageB);
  const readStandings = async (pg, order) => pg.evaluate((T, o) => {
    window.__dev.standings({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: o });
    const s = window.__dev.standings({ nowMs: T });
    return { order: s.order.map(x => [x.id, x.rank, x.total]), leader: s.leader, heroOrder: s.heroOrder, mineLeading: s.mineLeading };
  }, T_MP, order);
  const cA = await readStandings(page, "dawn");
  const cB = await readStandings(pageB, "wander");
  // A mata 500 (sube SU contribución al Libro) ⇒ el `order` compartido de B, re-leído con el MISMO nowMs, NO cambia (server-authoritative).
  await page.evaluate((T) => { window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 500 } }); }, T_MP);
  const cBAfter = await pageB.evaluate((T) => window.__dev.standings({ nowMs: T }).order.map(x => [x.id, x.rank, x.total]), T_MP);
  await pageB.close();
  const orderMatch = JSON.stringify(cA.order) === JSON.stringify(cB.order);
  const leaderMatch = cA.leader === cB.leader && cA.leader !== null;
  const heroDiverges = cA.heroOrder === "dawn" && cB.heroOrder === "wander";
  const noContention = JSON.stringify(cBAfter) === JSON.stringify(cB.order);
  ok("9 CONVERGENCIA 2-CLIENTE REAL: 2 páginas, mismo nowMs ⇒ `order`/leader IDÉNTICO (0 desync) AND heroOrder diverge AND sin contención",
     orderMatch && leaderMatch && heroDiverges && noContention && cA.order.every(([, , v]) => v > 0),
     `orderMatch=${orderMatch} leaderMatch=${leaderMatch} heroDiverges=${heroDiverges} noContention=${noContention} | A=${JSON.stringify(cA.order)} leaderA=${cA.leader} | B=${JSON.stringify(cB.order)} leaderB=${cB.leader}`);

  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
