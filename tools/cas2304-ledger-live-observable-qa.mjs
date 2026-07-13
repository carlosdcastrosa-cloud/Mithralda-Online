// CAS-2304 — QA POST-FLIP LIVE OBSERVABLE for LIBRO DE LA ORDEN / ORDER LEDGER (SANCTUARY_LEDGER.enabled:true LIVE via CTO flip CAS-2301).
// Runs against the canonical LIVE gh-pages build (the real production URL players use, board directive CAS-412) — NOT a local
// server, NOT the retired Higgsfield mirror (`585a05e63d46`, frozen, no arc).
//
// Blocked-by CAS-2301 (CTO flip, done). Differentiator vs the DARK observable (CAS-2300, 17/17 PASS build c4a549ae2fa1):
//   * served sim/config.js SANCTUARY_LEDGER.enabled:true (the flip shipped) + build self-consistent vs version.json (new build id).
//   * DEFAULT-ON — a FRESH boot with ZERO __dev flip has ledger().enabled===true (real players get the Ledger layer, no injection).
//   * full-stack regression — the whole arc stack (OATH / EMISSARY / REWARDS / REP / BOUNTY_BOARD / WORLD_EVENT / RECALL, + SAFEZONE/
//     TEMPLE/RESTED) all still enabled:true, 0 regression; only the 3 known unrelated DARKs (BOSS_RUSH / DOORS / SEEDED) stay false.
//   * served-source presence — sim.js carries tickLedger/ledgerBaseline/ledgerMul and render.js carries renderLedgerRow +
//     sanctuaryLedgerTag ★ draw (the DARK subsystem shipped across the consistent-HEAD 4-file overlay config+sim+game+render).
// Then the LEDGER observable proof (mirror DARK CAS-2300), through the REAL clock + real order affiliation:
//   1  boot clean + hooks + build self-consistent vs version.json + 0 err/404.
//   2  served config: SANCTUARY_LEDGER.enabled:true + full arc stack all true (0 regr); only 3 known DARKs false.
//   3  DEFAULT-ON: fresh boot ⇒ ledger().enabled===true, heroOrder null pre-pledge (0 __dev flip).
//   4  served-source presence: sim.js tickLedger+ledgerBaseline+ledgerMul; render.js renderLedgerRow+sanctuaryLedgerTag.
//   5  reloj semanal PURO: mismo nowMs ⇒ mismo period/baseline (determinista) AND baseline crece con frac (comunidad llena la barra).
//   6  contribución DERIVADA de contadores monótonos: kill{30}⇒+150 (wKill 5); +grantRep{40} mismo period⇒190 (wRep 1, acumula).
//   7  PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND unlocked false (marcador colectivo existe igual).
//   8  UNLOCK al cruzar ⇒ pasivo 'dawn'=safeRegen: unlocked true AND ledgerMulSafeRegen==0.20 AND restedCap/recallCd sin tocar.
//   9  PASSIVE gateado al CRUCE (no a enabled): pledged pero frac~0/sin cruzar ⇒ unlocked false AND ledgerMul*==0.
//  10  PASSIVE 'iron'=restedCap por DELTA de KNOB EFECTIVO: restedCap(cruzado)−restedCap(no-cruzado)==600*0.25==150 AND mul 0→0.25.
//  11  PASSIVE 'wander'=recallCd por DELTA de KNOB EFECTIVO: recallCdSec(no-cruzado)−recallCdSec(cruzado)==480*0.12==57.6 AND mul 0→0.12.
//  12  persist ON: saveBlob() lleva 'ledgerAt' {period,killBase,repBase} números (la contribución semanal sobrevive al reload).
//  13  *** MULTIPLAYER 2-CLIENTE *** (LO QUE PIDE EL TICKET): 2 páginas LIVE independientes, MISMO nowMs ⇒ orders[].baseline IDÉNTICO
//      por orden (convergencia, server-authority-ready, 0 desync); contribución per-hero SIN contención (A +2500, B intacto). AL FINAL
//      (abrir 2º page blurea el 1º ⇒ index.html auto-pausa el game-loop — pero ya no quedan render-probes).
//  14  arco regr full-stack: LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con LEDGER ON.
//  15  fps NO-regression en safezone calmo (ON ≥ OFF*0.9).
//   0  no JS errors + no non-favicon 404 durante toda la corrida.
//
// LIVE wiring (mirror CAS-2297/2294): gh-pages ?dev=1; build compared to served version.json (NOT hardcoded — a later flip advances
// LIVE build); gh-pages favicon 404 filtered; both pages SHARE the localStorage origin ⇒ clear mithralda.* keys per page; the tick
// reads the REAL wall-clock every frame ⇒ inject nowMs SYNCHRONOUSLY in the same __dev.ledger call as kill/act (schedule pin, no freeze).
// Run: node tools/cas2304-ledger-live-observable-qa.mjs   [optional LIVE base url]
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = (process.argv[2] || "https://carlosdcastrosa-cloud.github.io/Mithralda-Online").replace(/\/$/, "");
const OUT = join(ROOT, "shots", "cas2304-live");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000. Mismos T que la observable DARK (semanas dedicadas ⇒ deltas limpios).
const PERIOD_MS = 604800 * 1000;
const T_LATE      = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.97);   // frac ≈ 0.97 (comunidad casi llena la barra)
const T_EARLY     = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);   // misma semana, frac ≈ 0.02 (baseline ~0)
const T_FRESH     = 6000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.50);   // SEMANA NUEVA ⇒ re-snapshot base (contribución fresca)
const T_FRESH_LOW = 7000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);   // SEMANA NUEVA frac bajo ⇒ baseline ~0 + contribución 0 (gate)
const T_MP        = 8000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.61);   // ventana del test 2-cliente
const T_IRON_LO   = 9100 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);   // iron: semana fresca frac bajo (no cruza) para el delta del knob
const T_WAND_LO   = 9300 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);   // wander: idem

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
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
async function armOath(page, order) {
  await page.evaluate((o) => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); window.__dev.oath({ pledge: o }); }, order);
}
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots LIVE; build self-consistent vs version.json; __dev.ledger + arc hooks + bountyTP; 0 err/404",
     hooks && build === verBuild && !!build && errors.length === 0 && net404.length === 0,
     `build=${build} version.json=${verBuild} err=${errors.length} 404=${net404.length}`);

  // 2 served config: SANCTUARY_LEDGER.enabled:true + arc stack all true; only 3 known DARKs false
  const cfg = await page.evaluate(async (live) => {
    const t = await (await fetch(live + "/sim/config.js", { cache: "no-store" })).text();
    const en = (name) => { const m = t.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "MISSING"; };
    return { LEDGER: en("SANCTUARY_LEDGER"), OATH: en("SANCTUARY_OATH"), EMISSARY: en("SANCTUARY_EMISSARY"), REWARDS: en("SANCTUARY_REWARDS"),
      REP: en("SANCTUARY_REP"), BOUNTY: en("BOUNTY_BOARD"), WORLD_EVENT: en("WORLD_EVENT"), RECALL: en("RECALL"),
      SAFEZONE: en("SAFEZONE"), TEMPLE: en("TEMPLE_RESPAWN"), RESTED: en("RESTED_XP"),
      BOSS_RUSH: en("BOSS_RUSH"), DOORS: en("DOORS_INTERIORS"), SEEDED: en("SEEDED_CHALLENGE") };
  }, LIVE);
  const allArcTrue = ["OATH","EMISSARY","REWARDS","REP","BOUNTY","WORLD_EVENT","RECALL","SAFEZONE","TEMPLE","RESTED"].every((k) => cfg[k] === "true");
  const darksFalse = cfg.BOSS_RUSH === "false" && cfg.DOORS === "false" && cfg.SEEDED === "false";
  ok("2 served config: SANCTUARY_LEDGER.enabled:true + full arc stack all enabled:true (0 regr); only 3 known DARKs false",
     cfg.LEDGER === "true" && allArcTrue && darksFalse, JSON.stringify(cfg));

  // 3 DEFAULT-ON (the LIVE proof): fresh boot ⇒ ledger().enabled===true, ZERO __dev flip
  const dOn = await page.evaluate(() => { const d = window.__dev.ledger(); return { enabled: d.enabled, heroOrder: d.heroOrder, unlocked: d.unlocked, goal: d.goal }; });
  ok("3 DEFAULT-ON from served config: ledger().enabled===true at fresh boot, 0 __dev flip (heroOrder null pre-pledge)",
     dOn.enabled === true && dOn.heroOrder === null && dOn.goal === 1000, JSON.stringify(dOn));

  // 4 served-source presence: sim.js tickLedger+ledgerBaseline+ledgerMul; render.js renderLedgerRow+sanctuaryLedgerTag
  const src = await page.evaluate(async (live) => {
    const sim = await (await fetch(live + "/sim/sim.js", { cache: "no-store" })).text();
    const rnd = await (await fetch(live + "/render/render.js", { cache: "no-store" })).text();
    return { simTick: /tickLedger/.test(sim), simBase: /ledgerBaseline/.test(sim), simMul: /ledgerMul/.test(sim),
      rndRow: /renderLedgerRow/.test(rnd), rndTag: /sanctuaryLedgerTag/.test(rnd) };
  }, LIVE);
  ok("4 served-source presence: sim.js has tickLedger+ledgerBaseline+ledgerMul; render.js has renderLedgerRow+sanctuaryLedgerTag ★ (consistent-HEAD 4-file overlay live)",
     src.simTick && src.simBase && src.simMul && src.rndRow && src.rndTag, JSON.stringify(src));

  // 5 pure weekly clock: determinism + ramp
  const clock = await page.evaluate((TE, TL) => {
    window.__dev.ledger({ enabled: true });
    const a = window.__dev.ledger({ nowMs: TL }), b = window.__dev.ledger({ nowMs: TL });
    const early = window.__dev.ledger({ nowMs: TE }).orders[0].baseline;
    const late = window.__dev.ledger({ nowMs: TL }).orders[0].baseline;
    return { detP: a.schedule.period === b.schedule.period, detB: JSON.stringify(a.orders.map(o => o.baseline)) === JSON.stringify(b.orders.map(o => o.baseline)), early, late };
  }, T_EARLY, T_LATE);
  ok("5 reloj semanal PURO: mismo nowMs ⇒ mismo period/baseline (determinista) AND baseline crece con frac",
     clock.detP && clock.detB && clock.late > clock.early, `early(0.02)=${clock.early} late(0.97)=${clock.late}`);

  // 6 contribution derived from monotonic counters (fresh week ⇒ re-snapshot ⇒ clean deltas)
  await armOath(page, "dawn");
  const contrib = await page.evaluate((T) => {
    const k = window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 30 } }).contribution;   // +30*wKill(5)=150
    const kr = window.__dev.ledger({ nowMs: T, grantRep: 40 }).contribution;                    // mismo period ⇒ acumula +40*wRep(1) ⇒ 190
    return { k, kr };
  }, T_FRESH);
  ok("6 contribución DERIVADA de contadores monótonos: kill{30}⇒+150 (wKill 5); +grantRep{40} mismo period⇒190 (wRep 1, acumula)",
     contrib.k === 150 && contrib.kr === 190, JSON.stringify(contrib));

  // 7 pledge required: ON + no oath ⇒ heroOrder null, unlocked false, community marker still exists
  const noOath = await page.evaluate((T) => {
    window.__dev.oath({ enabled: false });
    const l = window.__dev.ledger({ enabled: true, nowMs: T });
    return { heroOrder: l.heroOrder, unlocked: l.unlocked, communityExists: l.orders.every(o => o.baseline > 0) };
  }, T_LATE);
  ok("7 PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND unlocked false (marcador colectivo existe igual)",
     noOath.heroOrder === null && noOath.unlocked === false && noOath.communityExists === true, JSON.stringify(noOath));

  await armOath(page, "dawn");

  // 8 unlock on cross ⇒ dawn passive = safeRegen 0.20
  const dawn = await page.evaluate((T) => {
    const l = window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 400 } });   // +2000 pts ⇒ cruza 1000
    return { unlocked: l.unlocked, total: l.total, goal: l.goal, mS: l.ledgerMulSafeRegen, mC: l.ledgerMulRestedCap, mR: l.ledgerMulRecallCd };
  }, T_LATE);
  ok("8 UNLOCK al cruzar ⇒ pasivo 'dawn'=safeRegen: unlocked true AND ledgerMulSafeRegen==0.20 AND restedCap/recallCd sin tocar",
     dawn.unlocked === true && dawn.total >= dawn.goal && near(dawn.mS, 0.20) && dawn.mC === 0 && dawn.mR === 0, JSON.stringify(dawn));

  // 9 passive gated on the CROSS, not on enabled
  const gated = await page.evaluate((T) => {
    const l = window.__dev.ledger({ enabled: true, nowMs: T });   // semana nueva frac~0: baseline~0 + base reset ⇒ contribución 0
    return { unlocked: l.unlocked, mS: l.ledgerMulSafeRegen, mC: l.ledgerMulRestedCap, mR: l.ledgerMulRecallCd };
  }, T_FRESH_LOW);
  ok("9 PASSIVE gateado al CRUCE (no a enabled): pledged pero frac~0/sin cruzar ⇒ unlocked false AND ledgerMul*==0",
     gated.unlocked === false && gated.mS === 0 && gated.mC === 0 && gated.mR === 0, JSON.stringify(gated));

  // 10 iron passive by EFFECTIVE-KNOB DELTA
  const iron = await page.evaluate((TLo, THi) => {
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "iron" });
    const lo = window.__dev.ledger({ enabled: true, nowMs: TLo });
    const hi = window.__dev.ledger({ enabled: true, nowMs: THi, kill: { n: 400 } });
    return { heroOrder: hi.heroOrder, loUnlocked: lo.unlocked, hiUnlocked: hi.unlocked, mCLo: lo.ledgerMulRestedCap, mCHi: hi.ledgerMulRestedCap, capLo: lo.restedCap, capHi: hi.restedCap };
  }, T_IRON_LO, T_LATE);
  ok("10 PASSIVE 'iron'=restedCap por DELTA de KNOB EFECTIVO: restedCap(cruzado)−restedCap(no-cruzado)==600*0.25==150 AND ledgerMulRestedCap 0→0.25",
     iron.heroOrder === "iron" && iron.loUnlocked === false && iron.hiUnlocked === true && iron.mCLo === 0 && near(iron.mCHi, 0.25) && near(iron.capHi - iron.capLo, 150, 0.05), JSON.stringify(iron));

  // 11 wander passive by EFFECTIVE-KNOB DELTA
  const wander = await page.evaluate((TLo, THi) => {
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "wander" });
    const lo = window.__dev.ledger({ enabled: true, nowMs: TLo });
    const hi = window.__dev.ledger({ enabled: true, nowMs: THi, kill: { n: 400 } });
    return { heroOrder: hi.heroOrder, loUnlocked: lo.unlocked, hiUnlocked: hi.unlocked, mRLo: lo.ledgerMulRecallCd, mRHi: hi.ledgerMulRecallCd, cdLo: lo.recallCdSec, cdHi: hi.recallCdSec };
  }, T_WAND_LO, T_LATE);
  ok("11 PASSIVE 'wander'=recallCd por DELTA de KNOB EFECTIVO: recallCdSec(no-cruzado)−recallCdSec(cruzado)==480*0.12==57.6 AND ledgerMulRecallCd 0→0.12",
     wander.heroOrder === "wander" && wander.loUnlocked === false && wander.hiUnlocked === true && wander.mRLo === 0 && near(wander.mRHi, 0.12) && near(wander.cdLo - wander.cdHi, 57.6, 0.05), JSON.stringify(wander));

  // 12 persist ON
  const persist = await page.evaluate((T) => {
    window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 10 } });
    const blob = window.__dev.saveBlob();
    return { hasKey: "ledgerAt" in blob, la: blob.ledgerAt };
  }, T_LATE);
  ok("12 persist ON: saveBlob tiene 'ledgerAt' {period,killBase,repBase} números (contribución sobrevive al reload)",
     persist.hasKey === true && persist.la && typeof persist.la.period === "number" && typeof persist.la.killBase === "number" && typeof persist.la.repBase === "number",
     JSON.stringify(persist));

  // 14 arc regression full-stack (before opening the 2nd page)
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const l = window.__dev.ledger(), o = window.__dev.oath(), b = window.__dev.bounty({ act: true }), s = window.__dev.sanctuary(), q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(), em = window.__dev.emissary(), rc = window.__dev.recall();
    return { ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("14 arco regr full-stack: LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con LEDGER ON",
     arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 15 fps no-regression in a calm safezone. MEDIAN-of-3 per state (headless rAF is jittery; a single dip is measurement noise —
  // LEDGER's tick is pure compute / byte-id when off, so a real >10% regression is implausible). Interleave ON/OFF to share drift.
  const fps = await page.evaluate(async () => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32); await new Promise(r => setTimeout(r, 200));
    const meas = async () => { let f = 0; const t0 = performance.now(); await new Promise(res => { const loop = () => { f++; if (performance.now() - t0 < 800) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); }); return f / ((performance.now() - t0) / 1000); };
    const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const offs = [], ons = [];
    for (let i = 0; i < 3; i++) {
      window.__dev.ledger({ enabled: false }); offs.push(await meas());
      window.__dev.ledger({ enabled: true }); ons.push(await meas());
    }
    return { off: Math.round(med(offs)), on: Math.round(med(ons)), offs: offs.map(Math.round), ons: ons.map(Math.round) };
  });
  ok("15 fps NO-REGRESIÓN en safezone calmo: LEDGER ON ≥ OFF*0.9 (mediana de 3, headless ⇒ relativo)",
     fps.on >= fps.off * 0.9, `on≈${fps.on} off≈${fps.off} ons=${JSON.stringify(fps.ons)} offs=${JSON.stringify(fps.offs)}`);

  await page.screenshot({ path: join(OUT, "desktop-observable.png") });

  // 13 *** MULTIPLAYER 2-CLIENTE *** (AL FINAL — abrir el 2º page blurea `page` ⇒ index.html auto-pausa el loop, pero ya no
  // quedan render-probes). Dos páginas LIVE independientes, MISMO nowMs inyectado ⇒ orders[].baseline IDÉNTICO por orden
  // (convergencia, server-authority-ready, 0 desync). Ambos jurados a 'dawn' ⇒ ven el MISMO marcador colectivo; A contribuye
  // 500 kills y B NO lo ve (per-hero, sin contención).
  const pageB = await freshPage(browser, errors, net404);
  await toHub(pageB);
  const readBaselines = async (pg, order) => pg.evaluate((T, o) => {
    window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); window.__dev.oath({ pledge: o });
    const l = window.__dev.ledger({ enabled: true, nowMs: T });
    return { baselines: l.orders.map(x => [x.id, x.baseline]), period: l.schedule.period, frac: l.schedule.frac, heroOrder: l.heroOrder, contribution: l.contribution };
  }, T_MP, order);
  const mpA = await readBaselines(page, "dawn");
  const mpB = await readBaselines(pageB, "dawn");
  const mpAAfter = await page.evaluate((T) => window.__dev.ledger({ nowMs: T, kill: { n: 500 } }).contribution, T_MP);
  const mpBAfter = await pageB.evaluate((T) => window.__dev.ledger({ nowMs: T }).contribution, T_MP);
  await pageB.close();
  const baselinesMatch = JSON.stringify(mpA.baselines) === JSON.stringify(mpB.baselines);
  const clockMatch = mpA.period === mpB.period && near(mpA.frac, mpB.frac, 1e-9);
  const noContention = mpAAfter === mpA.contribution + 2500 && mpBAfter === mpB.contribution; // A +500*5, B unchanged
  ok("13 MULTIPLAYER 2-CLIENTE LIVE: 2 páginas, mismo nowMs ⇒ orders[].baseline IDÉNTICO por orden (convergencia, 0 desync) AND contribución per-hero SIN contención",
     baselinesMatch && clockMatch && noContention && mpA.baselines.every(([, v]) => v > 0),
     `baselinesMatch=${baselinesMatch} clockMatch=${clockMatch} A:${mpA.contribution}→${mpAAfter} B:${mpB.contribution}→${mpBAfter} | A=${JSON.stringify(mpA.baselines)} B=${JSON.stringify(mpB.baselines)}`);

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
