// CAS-2309 — QA POST-FLIP LIVE OBSERVABLE for CLASIFICACIÓN DE ÓRDENES / ORDER STANDINGS
// (ORDER_STANDINGS.enabled:true LIVE via CTO flip CAS-2306, master 0d6927f/ac1ab04, gh-pages build 45383a903df3).
//
// Runs against the canonical LIVE gh-pages build (the real production URL players use, board directive CAS-412) — NOT a local
// server, NOT the retired Higgsfield mirror (`585a05e63d46`, frozen, no arc).
//
// Blocked-by CAS-2306 (CTO flip, verified LIVE below). Differentiator vs the DARK observable (CAS-2305, 14/14 build c4a549ae2fa1):
//   * served sim/config.js ORDER_STANDINGS.enabled:true (the flip shipped) + build self-consistent vs version.json (new build id).
//   * DEFAULT-ON — a FRESH boot with ZERO __dev flip has standings().enabled===true AND a REAL-CLOCK leader!==null (real players
//     get the shared weekly Standings, no injection); heroOrder null pre-pledge.
//   * served-source presence — sim.js carries standingsRank/standingsMul/tickStandings and render.js carries renderStandingsRow +
//     sanctuaryStandingsTag ♛ draw (the DARK subsystem shipped across the consistent-HEAD 4-file overlay config+sim+game+render).
//   * full-stack regression — the whole 12-flag arc still enabled:true, 0 regression; only 3 known unrelated DARKs stay false.
// Then the STANDINGS observable proof (mirror DARK CAS-2305), through the REAL clock + real order affiliation.
//
// Checks:
//   1  boot clean LIVE + __dev.standings + arc hooks + build self-consistent vs version.json + 0 err/404.
//   2  served config: ORDER_STANDINGS.enabled:true + full 12-flag arc all true (0 regr); only 3 known DARKs false.
//   3  DEFAULT-ON: fresh boot ⇒ standings().enabled===true AND leader!==null (real-clock ranking) AND gExists true, 0 __dev flip, heroOrder null.
//   4  served-source presence: sim.js standingsRank+standingsMul+tickStandings; render.js renderStandingsRow+sanctuaryStandingsTag ♛.
//   5  byte-id when OFF: toggle enabled:false ⇒ saveBlob() sin clave 'standings' AND gExists false AND restedXpMult 1.5 AND fp byte-stable.
//   6  RANKING PURO+válido: mismo nowMs ⇒ mismo leader/order (determinista) AND rangos 1..3 desc AND leader==rango1 AND n==3.
//   7  PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND mineLeading false AND standingsMul 0 (clasificación existe igual).
//   8  LEADER passive por KNOB EFECTIVO: jurar la orden LÍDER ⇒ mineLeading true AND standingsMul 0.15 AND restedXpMult 1.5→1.65.
//   9  LEADER passive gateado a LIDERAR: jurar orden NO-líder ⇒ mineLeading false AND standingsMul 0 AND restedXpMult 1.5 (no basta jurar).
//  10  ROTACIÓN semanal: los 3 líderes rotan a lo largo de las semanas (rivalidad social, 0 RNG, determinista).
//  11  render nameplate ♛: NAV REAL, orden del héroe LIDERANDO ⇒ se dibuja el ♛ (Δ px STANDINGS on vs off; Date.now pin).
//  12  render standings-row: NAV REAL al Tablón (bountyTP+KeyE→bounty) ⇒ la fila de Clasificación crece el panel con ON vs OFF.
//  13  arco regr full-stack: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con STANDINGS ON.
//  14  fps NO-REGRESIÓN (mediana-de-3) con la feature ON vs OFF (relativo, ON ≥ OFF*0.9).
//  15  *** CONVERGENCIA 2-CLIENTE REAL *** (North Star del ticket): 2 páginas LIVE, mismo nowMs ⇒ `order`/leader IDÉNTICO byte-a-byte
//      (0 desync); heroOrder diverge por cliente; A contribuye 500 kills y el `order` de B NO cambia (sin contención). AL FINAL.
//   0  no JS errors + no non-favicon 404 durante toda la corrida.
//
// LIVE wiring (mirror CAS-2304): gh-pages ?dev=1; build compared to served version.json (NOT hardcoded); gh-pages favicon 404 filtered;
// both pages SHARE localStorage origin ⇒ clear mithralda.* keys per page; tickStandings reads the REAL wall-clock every frame ⇒ inject
// nowMs SYNCHRONOUSLY in the same __dev.standings call (schedule pin, no freeze) — and PIN Date.now for the ♛ render probe.
// Run: node tools/cas2309-standings-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2309-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000. Mismas ventanas que la DARK (semanas dedicadas ⇒ ranking limpio).
const PERIOD_MS = 604800 * 1000;
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.90);   // frac ≈ 0.90 (baselines separados ⇒ ranking claro; leader determinista)
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
async function toHub(page) { await page.evaluate(() => { const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); }); await sleep(120); }
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

  // 1 boot clean + hooks + build self-consistent vs version.json
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.standings && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.standings + arc hooks + bountyTP; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: ORDER_STANDINGS.enabled:true + arc stack all true; only 3 known DARKs false
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { STANDINGS: en("ORDER_STANDINGS"), LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"),
      REWARDS: en("SANCTUARY_REWARDS"), REP: en("SANCTUARY_REP"), BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"),
      SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const allArcTrue = ["LEDGER","OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("2 served config: ORDER_STANDINGS.enabled:true + full 12-flag arc all enabled:true (0 regr); only 3 known DARKs false",
     cfg.STANDINGS === "true" && allArcTrue && darksFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (the LIVE proof): fresh boot ⇒ standings().enabled===true AND real-clock leader!==null, ZERO __dev flip
  const dOn = await page.evaluate(() => { const d = window.__dev.standings(); return { enabled: d.enabled, leader: d.leader, gExists: d.gExists, heroOrder: d.heroOrder }; });
  ok("3 DEFAULT-ON from served config: standings().enabled===true AND real-clock leader!==null AND gExists true, 0 __dev flip (heroOrder null pre-pledge)",
     dOn.enabled === true && dOn.leader !== null && dOn.gExists === true && dOn.heroOrder === null, JSON.stringify(dOn));

  // 4 served-source presence: sim.js standingsRank+standingsMul+tickStandings; render.js renderStandingsRow+sanctuaryStandingsTag ♛
  const src = await page.evaluate(async (live) => {
    const sim = await (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text();
    const rnd = await (await fetch(live + "/render/render.js", { cache: "no-store" })).text();
    return { simRank: /standingsRank/.test(sim), simMul: /standingsMul/.test(sim), simTick: /tickStandings/.test(sim),
      rndRow: /renderStandingsRow/.test(rnd), rndTag: /sanctuaryStandingsTag/.test(rnd) };
  }, LIVE);
  ok("4 served-source presence: sim.js has standingsRank+standingsMul+tickStandings; render.js has renderStandingsRow+sanctuaryStandingsTag ♛ (consistent-HEAD 4-file overlay live)",
     src.simRank && src.simMul && src.simTick && src.rndRow && src.rndTag, JSON.stringify(src));

  // 5 byte-id when OFF: toggle enabled:false ⇒ save has no 'standings' key + gExists false + restedXpMult 1.5 + fp stable
  const byteId = await page.evaluate(() => {
    window.__dev.standings({ enabled: false });
    const off = window.__dev.standings();
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.standings({ enabled: true });
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.standings({ enabled: false });
    const fpAfter2 = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.standings({ enabled: true });                       // restore ON para el resto de checks
    return { noKey: !/"standings"/.test(saveOff), gExists: off.gExists, restedXpMult: off.restedXpMult, fpStable: fpBefore === fpAfter2 };
  });
  // NOTA LIVE (DEFAULT-ON footgun, mirror CAS-2302 hasField): gExists=true al togglear OFF es ESPERADO — el tick live ya creó el
  // objeto TRANSITORIO G.standings frame-1; togglear enabled:false NO lo destruye. La byte-identidad del SAVE se preserva igual
  // (0 clave 'standings') y el KNOB queda inerte (restedXpMult 1.5) + fp byte-stable. El assert DARK gExists===false NO porta a LIVE.
  ok("5 byte-id when OFF (DEFAULT-ON): saveBlob() sin clave 'standings' AND knob inerte (restedXpMult 1.5) AND worldFingerprint byte-stable; G.standings transitorio (no se persiste)",
     byteId.noKey && near(byteId.restedXpMult, 1.5) && byteId.fpStable, JSON.stringify(byteId));

  // 6 ranking puro + válido
  const valid = await page.evaluate((T) => {
    window.__dev.standings({ enabled: true });
    const a = window.__dev.standings({ nowMs: T }), b = window.__dev.standings({ nowMs: T });
    const byRank = a.order.slice().sort((x, y) => x.rank - y.rank);
    const ranks = a.order.map(o => o.rank).sort().join(",");
    let desc = true; for (let i = 1; i < byRank.length; i++) if (byRank[i].total > byRank[i - 1].total) desc = false;
    return { detLeader: a.leader === b.leader, detOrder: JSON.stringify(a.order.map(o => [o.id, o.rank, o.total])) === JSON.stringify(b.order.map(o => [o.id, o.rank, o.total])),
      ranks, desc, leader: a.leader, rank1: byRank[0].id, n: a.order.length, order: a.order.map(o => [o.id, o.rank, o.total]) };
  }, T_LATE);
  ok("6 RANKING PURO+válido: mismo nowMs ⇒ mismo leader/order (determinista) AND rangos 1..3 desc AND leader==rango1",
     valid.detLeader && valid.detOrder && valid.ranks === "1,2,3" && valid.desc && valid.leader === valid.rank1 && valid.n === 3,
     `leader=${valid.leader} order=${JSON.stringify(valid.order)}`);

  const leader = await page.evaluate((T) => window.__dev.standings({ enabled: true, nowMs: T }).leader, T_LATE);
  const nonLeader = ["dawn", "iron", "wander"].find(id => id !== leader);

  // 7 pledge required: ON + no oath ⇒ heroOrder null, mineLeading false, standingsMul 0 (community ranking still exists)
  const noOath = await page.evaluate((T) => {
    window.__dev.oath({ enabled: false });
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { heroOrder: s.heroOrder, mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, leaderExists: s.leader !== null };
  }, T_LATE);
  ok("7 PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND mineLeading false AND standingsMul 0 (clasificación existe igual)",
     noOath.heroOrder === null && noOath.mineLeading === false && noOath.mul === 0 && noOath.leaderExists === true, JSON.stringify(noOath));

  // 8 leader passive por KNOB EFECTIVO: jurar la orden LÍDER ⇒ mineLeading true AND restedXpMult 1.5→1.65
  await armOath(page);
  await pledge(page, leader);
  const lead = await page.evaluate((T) => {
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, restedXpMult: s.restedXpMult, heroOrder: s.heroOrder };
  }, T_LATE);
  ok("8 LEADER passive por KNOB EFECTIVO: jurar la orden LÍDER ⇒ mineLeading true AND standingsMul 0.15 AND restedXpMult 1.5→1.65 (seam real de Descanso)",
     lead.mineLeading === true && near(lead.mul, 0.15) && near(lead.restedXpMult, 1.65) && lead.heroOrder === leader, `leader=${leader} ${JSON.stringify(lead)}`);

  // 9 leader passive gateado a LIDERAR: jurar una orden NO-líder ⇒ mineLeading false, standingsMul 0, restedXpMult base
  await pledge(page, nonLeader);
  const gated = await page.evaluate((T) => {
    const s = window.__dev.standings({ enabled: true, nowMs: T });
    return { mineLeading: s.mineLeading, mul: s.standingsMulRestedMult, restedXpMult: s.restedXpMult, heroOrder: s.heroOrder };
  }, T_LATE);
  ok("9 LEADER passive gateado a LIDERAR: jurar orden NO-líder ⇒ mineLeading false AND standingsMul 0 AND restedXpMult 1.5 (no basta jurar)",
     gated.mineLeading === false && gated.mul === 0 && near(gated.restedXpMult, 1.5) && gated.heroOrder === nonLeader, `nonLeader=${nonLeader} ${JSON.stringify(gated)}`);

  // 10 rotación semanal: barre 60 semanas y cuenta líderes distintos
  const rot = await page.evaluate((PM) => {
    const seen = new Set();
    for (let w = 5000; w < 5060; w++) { const s = window.__dev.standings({ enabled: true, nowMs: w * PM + Math.floor(PM * 0.9) }); if (s.leader) seen.add(s.leader); }
    return { distinct: seen.size, leaders: Array.from(seen).sort() };
  }, PERIOD_MS);
  ok("10 ROTACIÓN semanal: los 3 líderes rotan a lo largo de las semanas (rivalidad/identidad social, 0 RNG)",
     rot.distinct === 3, JSON.stringify(rot));

  // 11 render nameplate ♛ (Date.now pinned ⇒ tick deriva SIEMPRE la misma semana ⇒ mismo líder; hero en la orden LÍDER ⇒ sólo ♛ difiere)
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
  ok("11 render nameplate ♛: NAV REAL, orden del héroe LIDERANDO ⇒ se dibuja el ♛ junto al tag (Δ px STANDINGS on vs off)",
     crown.mineLeading === true && crown.dead === false && crown.signal > 3, `signal=${crown.signal} churn=${crown.churn} mineLeading=${crown.mineLeading} dead=${crown.dead}`);

  // 12 render standings-row via REAL nav to the bounty board
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
    window.__dev.standings({ enabled: true });                 // panel crece + fila de Clasificación
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
  ok("12 render standings-row (NAV REAL bountyTP+KeyE→bounty): la fila de Clasificación crece el panel con ON vs OFF (panel estático)",
     row.signal > 200, `scene=${row.scene} signal=${row.signal} back=${row.back}`);

  // 13 arc regression full-stack
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
  ok("13 arco regr full-stack: STANDINGS + LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con STANDINGS ON",
     arc.standOk && arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 14 fps no-regression (mediana-de-5 + warmup descartado; headless rAF jitterea ⇒ single/median-de-3 da false-FAIL — el tick es
  // pure-compute / byte-id cuando OFF, así que una regresión real >10% es inverosímil). Interleave ON/OFF para compartir el drift.
  const fps = await page.evaluate(async () => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); await new Promise(r => setTimeout(r, 250));
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 800) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    await measure();  // warmup, descartado
    const offs = [], ons = [];
    for (let i = 0; i < 5; i++) { window.__dev.standings({ enabled: false }); offs.push(await measure()); window.__dev.standings({ enabled: true }); ons.push(await measure()); }
    return { offs, ons };
  });
  const fpsOff = median(fps.offs), fpsOn = median(fps.ons);
  ok("14 fps NO-REGRESIÓN (mediana-de-5 + warmup): STANDINGS ON no degrada el frame budget vs OFF (headless ⇒ relativo, ON ≥ OFF*0.9)",
     fpsOn >= fpsOff * 0.9, `on≈${Math.round(fpsOn)} off≈${Math.round(fpsOff)}`);

  await page.screenshot({ path: join(OUT, "desktop-observable.png") });

  // 15 *** CONVERGENCIA 2-CLIENTE REAL *** (AL FINAL: abrir un 2º page blurea `page`, pero ya no quedan render-probes) — DOS páginas
  // LIVE independientes (2 clientes reales del shard), MISMO nowMs inyectado ⇒ el `order` (totales+rangos+leader) es IDÉNTICO
  // byte-a-byte; cada héroe está jurado a una Orden DISTINTA (heroOrder diverge) pero el ranking compartido NO cambia (usa el
  // baseline colectivo, NUNCA la contribución per-hero) ⇒ 0 desync. Cliente A mata 500 ⇒ su contribución sube pero el `order` de B NO.
  const pageB = await freshPage(browser, errors, net404);
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
  ok("15 CONVERGENCIA 2-CLIENTE REAL: 2 páginas LIVE, mismo nowMs ⇒ `order`/leader IDÉNTICO (0 desync) AND heroOrder diverge AND sin contención",
     orderMatch && leaderMatch && heroDiverges && noContention && cA.order.every(([, , v]) => v > 0),
     `orderMatch=${orderMatch} leaderMatch=${leaderMatch} heroDiverges=${heroDiverges} noContention=${noContention} | A=${JSON.stringify(cA.order)} leaderA=${cA.leader} | B=${JSON.stringify(cB.order)} leaderB=${cB.leader}`);

  ok("0 no JS errors + no non-favicon 404 durante toda la corrida", errors.length === 0 && net404.length === 0,
     `err=[${errors.slice(0, 3).join(" | ")}] 404=[${net404.slice(0, 3).join(" | ")}]`);

  console.log(`\nLIVE build tested: ${build} (version.json=${verBuild})`);
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack || e); FAIL++;
} finally {
  await browser.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
process.exit(FAIL ? 1 : 0);
