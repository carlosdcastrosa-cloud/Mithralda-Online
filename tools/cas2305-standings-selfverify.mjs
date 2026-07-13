// CAS-2305 — GE self-verify for CLASIFICACIÓN DE ÓRDENES / ORDER STANDINGS (DARK, ORDER_STANDINGS.enabled:false).
// Capa SOCIAL COMPETITIVA sobre el arco del Santuario: un RANKING SEMANAL COMPARTIDO de las 3 Órdenes deterministas
// (dawn/iron/wander) por su BASELINE colectivo del Libro (SANCTUARY_LEDGER, LIVE). El ranking es una función PURA del reloj de
// pared (0 RNG) ⇒ TODO cliente con el mismo reloj converge a la MISMA clasificación (0 desync bajo N jugadores). La orden en el
// PUESTO 1 esa semana otorga a sus miembros (por Juramento) un PASIVO FIJO y ACOTADO: +leadValue al mult de Descanso (RESTED_XP.xpMult,
// mismo seam que sanctuaryRewardMul). SOLO lectura en el panel del Tablón + ♛ en el nameplate. 0 hotkey nuevo, 0 clave de save nueva.
//
// Observado vía __dev.standings (flip enabled IN-MEMORY + nowMs para el reloj semanal + pledge por tryPledgeOath) + __dev.ledger/oath/
// sanctuary/bounty/warhorn/emissary/recall/quartermaster/safeZone/tp/bountyTP/daynight/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.standings + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: ORDER_STANDINGS.enabled===false AND leader null AND gExists false AND standingsMul 0 ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() tiene NINGUNA clave 'standings' (la feature es 100% estado del mundo, 0 campo per-hero).
//   4  worldFingerprint byte-stable across enabled toggle (0 RNG drift).
//   5  OFF knob byte-id: enabled false ⇒ standingsMulRestedMult==0 AND restedXpMult == base (RESTED_XP.xpMult exacto).
//   6  CLOCK determinism (convergencia N-clientes): mismo nowMs ⇒ MISMO leader + mismos totales/rangos por orden (2 lecturas idénticas).
//   7  RANKING válido: rangos = permutación 1..3, totales ordenados desc, leader == la orden de rango 1 (pura, 0 RNG).
//   8  no-clock guard: nowMs<=0 ⇒ schedule period 0/frac 0, order length 3, leader determinista (tie-break estable por id ⇒ 'dawn').
//   9  PLEDGE requerido: ON + sin juramento ⇒ mineLeading false AND standingsMul 0 (la clasificación existe, el héroe no recibe pasivo).
//  10  LEADER passive aplicado: jurar la orden LÍDER ⇒ mineLeading true AND standingsMulRestedMult==leadValue(0.15) AND restedXpMult==base+0.15.
//  11  LEADER passive gateado: jurar una orden NO-líder ⇒ mineLeading false AND standingsMul 0 (no basta jurar — hay que LIDERAR).
//  12  ROTACIÓN semanal: barre semanas y encuentra ≥2 líderes distintos ⇒ identidad/rivalidad social cambiante (0 RNG, determinista).
//  13  render nameplate ♛: con la orden del héroe LIDERANDO se dibuja el ♛ junto al tag (Δ px STANDINGS on vs off, tag/★ idénticos, Date.now pin).
//  14  render standings-row: en la escena `bounty` la fila de Clasificación crece el panel + se dibuja con ON vs OFF (Δ px panel estático).
//  15  CONVERGENCIA 2-cliente: mismo nowMs, el `order` (totales+leader) es IDÉNTICO sin importar a qué orden esté jurado el héroe
//      (el ranking usa SÓLO el baseline colectivo, NUNCA la contribución per-hero ⇒ 0 desync entre jugadores del mismo shard).
//  16  arco regr: con STANDINGS ON, LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL siguen sanos.
//  17  fps NO-REGRESIÓN con la feature ON vs OFF (relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2305-standings-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2305");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000. Elegimos una semana con frac alto (comunidad casi llena la barra ⇒ baselines separados).
const PERIOD_MS = 604800 * 1000;
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.90);   // frac ≈ 0.90

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

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
// jura una orden pasando SIEMPRE el cooldown de cambio del Juramento (switchCooldownKills) antes.
async function pledge(page, id) { await page.evaluate((oid) => { window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: oid }); }, id); }

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots to play, __dev.standings + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default
  const dark = await page.evaluate(() => window.__dev.standings());
  ok("2 DARK default: enabled false AND leader null AND gExists false AND standingsMul 0",
     dark.enabled === false && dark.leader === null && dark.gExists === false && dark.standingsMulRestedMult === 0,
     `enabled=${dark.enabled} leader=${dark.leader} gExists=${dark.gExists} mul=${dark.standingsMulRestedMult}`);

  // 3 save OFF has no key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'standings' key in save blob (feature = estado del mundo, 0 campo per-hero)", !/"standings"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.standings({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.standings({ enabled: false }));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 OFF knob byte-id: standingsMul==0 AND restedXpMult==base
  const knobBase = await page.evaluate(() => { window.__dev.standings({ enabled: false }); const s = window.__dev.standings();
    return { mul: s.standingsMulRestedMult, restedXpMult: s.restedXpMult, gExists: s.gExists }; });
  ok("5 OFF knob byte-id: standingsMulRestedMult==0 AND restedXpMult == RESTED_XP.xpMult base (1.5)",
     knobBase.mul === 0 && knobBase.restedXpMult === 1.5, `mul=${knobBase.mul} restedXpMult=${knobBase.restedXpMult} gExists=${knobBase.gExists}`);
  const BASE_RESTED = knobBase.restedXpMult;

  // 6 clock determinism: same nowMs ⇒ identical leader + per-order totals + ranks (convergencia)
  const det = await page.evaluate((T) => {
    window.__dev.standings({ enabled: true });
    const a = window.__dev.standings({ nowMs: T });
    const b = window.__dev.standings({ nowMs: T });
    return { la: a.leader, lb: b.leader, oa: a.order.map(o => [o.id, o.rank, o.total]), ob: b.order.map(o => [o.id, o.rank, o.total]) };
  }, T_LATE);
  ok("6 CLOCK determinism: mismo nowMs ⇒ MISMO leader + totales/rangos por orden (convergencia N-clientes)",
     det.la === det.lb && det.la !== null && JSON.stringify(det.oa) === JSON.stringify(det.ob),
     `leader=${det.la}/${det.lb} order=${JSON.stringify(det.oa)}`);

  // 7 ranking válido: rangos = permutación 1..3, totales desc, leader == rango 1
  const valid = await page.evaluate((T) => {
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    const byRank = s.order.slice().sort((a, b) => a.rank - b.rank);
    const ranks = s.order.map(o => o.rank).sort().join(",");
    let desc = true; for (let i = 1; i < byRank.length; i++) if (byRank[i].total > byRank[i - 1].total) desc = false;
    return { ranks, desc, leader: s.leader, rank1: byRank[0].id, n: s.order.length };
  }, T_LATE);
  ok("7 RANKING válido: rangos permutación 1..3, totales desc, leader == orden de rango 1",
     valid.ranks === "1,2,3" && valid.desc === true && valid.leader === valid.rank1 && valid.n === 3, JSON.stringify(valid));

  // 8 no-clock guard
  const noclk = await page.evaluate(() => { const s = window.__dev.standings({ enabled: true, nowMs: 0 });
    return { period: s.schedule ? s.schedule.period : null, frac: s.schedule ? s.schedule.frac : null, n: s.order.length, leader: s.leader }; });
  ok("8 no-clock guard: nowMs<=0 ⇒ period 0/frac 0, order length 3, leader determinista ('dawn' por tie-break)",
     noclk.period === 0 && noclk.frac === 0 && noclk.n === 3 && noclk.leader === "dawn", JSON.stringify(noclk));

  // set up the oath (order affiliation): enable oath+rep, grant rank
  await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); });

  // 9 pledge required: ON but NO oath ⇒ mineLeading false, standingsMul 0
  const noOath = await page.evaluate((T) => {
    window.__dev.oath({ enabled: false });   // sin juramento ⇒ sin orden del héroe
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, heroOrder: s.heroOrder, leaderExists: s.leader !== null };
  }, T_LATE);
  ok("9 PLEDGE requerido: ON + sin juramento ⇒ mineLeading false AND standingsMul 0 (la clasificación existe igual)",
     noOath.mineLeading === false && noOath.mul === 0 && noOath.heroOrder === null && noOath.leaderExists === true, JSON.stringify(noOath));

  // re-enable oath for pledging
  await page.evaluate(() => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); });

  // determina el LÍDER de la semana T_LATE
  const leader = await page.evaluate((T) => window.__dev.standings({ enabled: true, nowMs: T }).leader, T_LATE);
  const nonLeader = ["dawn", "iron", "wander"].find(id => id !== leader);

  // 10 leader passive applied: pledge the LEADER ⇒ mineLeading true, standingsMul==leadValue, restedXpMult==base+leadValue
  await pledge(page, leader);
  const lead = await page.evaluate((T) => {
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, leadValue: s.leadValue, restedXpMult: s.restedXpMult, heroOrder: s.heroOrder };
  }, T_LATE);
  ok("10 LEADER passive aplicado: jurar la orden LÍDER ⇒ mineLeading true AND standingsMul==leadValue(0.15) AND restedXpMult==base+0.15",
     lead.mineLeading === true && near(lead.mul, 0.15) && near(lead.restedXpMult, BASE_RESTED + 0.15) && lead.heroOrder === leader, `leader=${leader} ${JSON.stringify(lead)}`);

  // 11 leader passive gated to LEADER: pledge a NON-leader ⇒ mineLeading false, standingsMul 0
  await pledge(page, nonLeader);
  const gated = await page.evaluate((T) => {
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, restedXpMult: s.restedXpMult, heroOrder: s.heroOrder };
  }, T_LATE);
  ok("11 LEADER passive gateado: jurar orden NO-líder ⇒ mineLeading false AND standingsMul 0 (hay que LIDERAR, no basta jurar)",
     gated.mineLeading === false && gated.mul === 0 && near(gated.restedXpMult, BASE_RESTED) && gated.heroOrder === nonLeader, `nonLeader=${nonLeader} ${JSON.stringify(gated)}`);

  // 12 rotación semanal: barre 40 semanas y cuenta líderes distintos
  const rot = await page.evaluate((PM) => {
    const seen = new Set();
    for (let w = 5000; w < 5040; w++) { const s = window.__dev.standings({ enabled: true, nowMs: w * PM + Math.floor(PM * 0.9) }); if (s.leader) seen.add(s.leader); }
    return { distinct: seen.size, leaders: Array.from(seen) };
  }, PERIOD_MS);
  ok("12 ROTACIÓN semanal: ≥2 líderes distintos a lo largo de las semanas (identidad/rivalidad social cambiante, 0 RNG)",
     rot.distinct >= 2, JSON.stringify(rot));

  // 13 render nameplate ♛ (Date.now pinned; toggle STANDINGS on/off with hero on the LEADER order ⇒ only ♛ differs; tag/★ identical)
  await pledge(page, leader);
  const crown = await page.evaluate(async (T) => {
    const realNow = Date.now; Date.now = () => T;             // PIN el reloj ⇒ tick deriva SIEMPRE la misma semana ⇒ mismo líder
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.34), y0 = Math.floor(cv.height * 0.20), bw = Math.floor(cv.width * 0.32), bh = Math.floor(cv.height * 0.34);
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
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
    let signal = 0; for (let i = 0; i < on.length; i += 4) {
      const dOn = Math.abs(on[i] - off0[i]) + Math.abs(on[i + 1] - off0[i + 1]) + Math.abs(on[i + 2] - off0[i + 2]);
      const dBg = Math.abs(off1[i] - off0[i]) + Math.abs(off1[i + 1] - off0[i + 1]) + Math.abs(off1[i + 2] - off0[i + 2]);
      if (dOn > 40 && dBg <= 25) signal++;
    }
    if (window.__dev.daynight) window.__dev.daynight(null);
    Date.now = realNow;
    return { signal, mineLeading };
  }, T_LATE);
  ok("13 render nameplate ♛: con la orden del héroe LIDERANDO se dibuja el ♛ junto al tag (Δ px STANDINGS on vs off)",
     crown.mineLeading === true && crown.signal > 3, `signal=${crown.signal} mineLeading=${crown.mineLeading}`);

  // 14 render standings-row in the bounty board scene: open board, compare ON vs OFF panel
  const row = await page.evaluate(async () => {
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
  ok("14 render standings-row: en la escena `bounty` la fila de Clasificación cambia el panel con ON vs OFF (panel estático)",
     row.signal > 200, `scene=${row.scene} signal=${row.signal} back=${row.back}`);

  // 15 convergencia 2-cliente: mismo nowMs ⇒ order (totales+leader) IDÉNTICO sin importar la orden del héroe (usa baseline, no contribución)
  await page.evaluate(async () => {
    for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
  });
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 }).catch(() => {});
  const conv = await page.evaluate(async (T) => {
    window.__dev.standings({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });
    // "cliente A" = héroe jurado a dawn; "cliente B" = jurado a wander. La clasificación COMPARTIDA debe ser idéntica.
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "dawn" });
    const a = window.__dev.standings({ nowMs: T });
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "wander" });
    const b = window.__dev.standings({ nowMs: T });
    return { orderA: a.order.map(o => [o.id, o.rank, o.total]), orderB: b.order.map(o => [o.id, o.rank, o.total]),
      leaderA: a.leader, leaderB: b.leader, mineA: a.heroOrder, mineB: b.heroOrder };
  }, T_LATE);
  ok("15 CONVERGENCIA 2-cliente: mismo nowMs ⇒ `order` (totales+leader) IDÉNTICO pese a distinta orden del héroe (0 desync)",
     JSON.stringify(conv.orderA) === JSON.stringify(conv.orderB) && conv.leaderA === conv.leaderB && conv.mineA === "dawn" && conv.mineB === "wander",
     JSON.stringify(conv));

  // 16 arc regression
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.standings({ enabled: true }); window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const st = window.__dev.standings(); const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { standOk: st.enabled, ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("16 arco regr: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con STANDINGS ON",
     arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 17 fps NO-REGRESSION
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 800) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    window.__dev.standings({ enabled: false }); const off = await measure();
    window.__dev.standings({ enabled: true }); const on = await measure();
    return { off, on };
  });
  ok("17 fps NO-REGRESIÓN: STANDINGS ON no degrada el frame budget vs OFF (headless ⇒ relativo, ON ≥ OFF*0.9)",
     fps.on >= fps.off * 0.9, `on≈${Math.round(fps.on)} off≈${Math.round(fps.off)}`);

  await page.screenshot({ path: join(OUT, "selfverify.png") });
  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
