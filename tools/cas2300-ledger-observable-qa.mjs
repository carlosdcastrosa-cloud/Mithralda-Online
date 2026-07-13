// CAS-2300 — QA OBSERVABLE for LIBRO DE LA ORDEN / ORDER LEDGER (DARK, SANCTUARY_LEDGER.enabled:false).
// Progresión COLECTIVA semanal de la orden: un MARCADOR compartido por todos los miembros de una misma orden (las 3 del Juramento),
// derivado deterministamente del reloj de pared (baseline = agregado de la comunidad, rampado por la fracción de semana) + la
// contribución del jugador (contadores monótonos h.kills/h.sanctuaryRep). Cruzar el `goal` esa semana ⇒ PASIVO temporal de orden que
// REUTILIZA un knob ya vivo (safeRegen/restedCap/recallCd, mismo seam que oathMul/reward). Visible como ★ sobre el TAG de orden +
// una fila SOLO-lectura en el Tablón. 0 hotkey, 0 RNG, 0 nueva moneda, server-authority-ready.
//
// QA differentiators vs GE self-verify (que ya cubre el estado interno vía el hook):
//   · CHECK 6 = MULTIPLAYER 2-CLIENTE REAL (lo que pide el ticket): DOS páginas independientes, MISMO nowMs inyectado ⇒ orders[].baseline
//     IDÉNTICO por orden (convergencia, server-authority-ready, 0 desync). Ambos jurados a 'dawn' ⇒ ven el MISMO marcador colectivo;
//     cada uno contribuye per-hero SIN contención (la contribución de A no muta la de B, pero ambas cuentan a la misma orden).
//   · Los PASIVOS se prueban por el KNOB EFECTIVO que se mueve en el chokepoint REAL (recallCdSec/restedCap), no sólo por ledgerMul*.
//   · Render por NAVEGACIÓN REAL (KeyE al Tablón, Date.now pin para la ★).
//
// Checks:
//   1  boots to play, __dev.ledger + arc hooks + __BUILD, 0 JS err.
//   2  DARK default served: enabled false AND heroOrder null AND hasField false AND unlocked false ⇒ byte-id OFF (marcador dormido).
//   3  byte-id OFF: saveBlob() sin clave 'ledgerAt' AND worldFingerprint byte-stable al togglear enabled (0 RNG drift).
//   4  reloj semanal PURO: mismo nowMs ⇒ mismo period/frac/baseline (determinista); baseline crece con frac (comunidad llena la barra).
//   5  contribución DERIVADA de contadores monótonos: semana nueva ⇒ kill{n} ⇒ +n*wKill; grantRep{n} ⇒ +n*wRep.
//   6  ★ MULTIPLAYER 2-CLIENTE: 2 páginas, mismo nowMs ⇒ orders[].baseline idéntico por orden; contribución per-hero independiente.
//   7  PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND unlocked false (marcador colectivo existe igual; el héroe no recibe pasivo).
//   8  UNLOCK al cruzar ⇒ pasivo 'dawn' safeRegen: ledgerMulSafeRegen==0.20 (y no toca restedCap/recallCd).
//   9  PASSIVE gateado al CRUCE, no a enabled: pledged pero frac~0/sin cruzar ⇒ unlocked false AND todos ledgerMul*==0.
//  10  PASSIVE 'iron'=restedCap por KNOB EFECTIVO: cruzar con 'iron' ⇒ restedCap == base*1.25 (600→750) AND ledgerMulRestedCap==0.25.
//  11  PASSIVE 'wander'=recallCd por KNOB EFECTIVO: cruzar con 'wander' ⇒ recallCdSec == base*0.88 (480→422.4) AND ledgerMulRecallCd==0.12.
//  12  render nameplate ★: con la orden EN RACHA se dibuja la ★ junto al tag (Δ px vs pledged-no-unlocked; Date.now pin, tag ⟦⟧ en ambos).
//  13  render ledger-row: NAV REAL al Tablón (bountyTP+KeyE→bounty) ⇒ la fila del Libro cambia el panel con ON vs OFF (panel estático).
//  14  persist ON: saveBlob() lleva 'ledgerAt' {period,killBase,repBase} (la contribución semanal sobrevive al reload).
//  15  arco regr full-stack: LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con LEDGER ON.
//  16  fps NO-REGRESIÓN con la feature ON vs OFF (relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2300-ledger-observable-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2300-qa");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000.
const PERIOD_MS = 604800 * 1000;
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.97);      // frac ≈ 0.97 (comunidad casi llena la barra)
const T_EARLY = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);     // misma semana 5000, frac ≈ 0.02 (baseline ~0)
const T_FRESH = 6000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.50);     // SEMANA NUEVA ⇒ re-snapshot base (contribución fresca)
const T_FRESH_LOW = 7000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02); // SEMANA NUEVA frac bajo ⇒ baseline ~0 + contribución 0 (gate)
const T_MP = 8000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.61);        // ventana del test 2-cliente
const T_IRON_LO = 9100 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);   // iron: semana fresca frac bajo (no cruza) para el delta del knob
const T_WAND_LO = 9300 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);   // wander: idem
const T_STAR = 9500 * PERIOD_MS + Math.floor(PERIOD_MS * 0.90);      // semana dedicada al probe de la ★ (off0 genuinamente NO-unlocked)

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

// clear any shared-origin save so each page boots to a FRESH hero (2 clientes ⇒ 2 héroes) — mirror del footgun warhorn/emissary.
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
// arm the oath (order affiliation): enable oath+rep, grant rank, pledge <order>.
async function armOath(page, order) {
  await page.evaluate((o) => { window.__dev.oath({ enabled: true }); window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 }); window.__dev.oath({ pledge: o }); }, order);
}

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await freshPage(browser, base, errors);
  await toHub(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots to play, __dev.ledger + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default served
  const dark = await page.evaluate(() => window.__dev.ledger());
  ok("2 DARK default served: enabled false AND heroOrder null AND hasField false AND unlocked false (marcador dormido, byte-id)",
     dark.enabled === false && dark.heroOrder === null && dark.hasField === false && dark.unlocked === false,
     `enabled=${dark.enabled} heroOrder=${dark.heroOrder} hasField=${dark.hasField} unlocked=${dark.unlocked} goal=${dark.goal}`);

  // 3 byte-id OFF: save has no key + worldFingerprint stable across toggle
  const byteId = await page.evaluate(() => {
    const saveOff = JSON.stringify(window.__dev.saveBlob());
    const fpBefore = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.ledger({ enabled: true });
    const fpAfter = JSON.stringify(window.__dev.worldFingerprint(123));
    window.__dev.ledger({ enabled: false });
    return { noKey: !/"ledgerAt"/.test(saveOff), fpStable: fpBefore === fpAfter, len: saveOff.length };
  });
  ok("3 byte-id OFF: saveBlob() sin clave 'ledgerAt' AND worldFingerprint byte-stable al togglear enabled (0 RNG drift)",
     byteId.noKey && byteId.fpStable, JSON.stringify(byteId));

  // 4 pure weekly clock: determinism + ramp
  const clock = await page.evaluate((TE, TL) => {
    window.__dev.ledger({ enabled: true });
    const a = window.__dev.ledger({ nowMs: TL }), b = window.__dev.ledger({ nowMs: TL });
    const early = window.__dev.ledger({ nowMs: TE }).orders[0].baseline;
    const late = window.__dev.ledger({ nowMs: TL }).orders[0].baseline;
    return { detP: a.schedule.period === b.schedule.period, detB: JSON.stringify(a.orders.map(o => o.baseline)) === JSON.stringify(b.orders.map(o => o.baseline)), early, late };
  }, T_EARLY, T_LATE);
  ok("4 reloj semanal PURO: mismo nowMs ⇒ mismo period/baseline (determinista) AND baseline crece con frac (comunidad llena la barra)",
     clock.detP && clock.detB && clock.late > clock.early, `early(0.02)=${clock.early} late(0.97)=${clock.late}`);

  // 5 contribution derived from monotonic counters (fresh week ⇒ re-snapshot ⇒ clean deltas)
  await armOath(page, "dawn");
  const contrib = await page.evaluate((T) => {
    const k = window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 30 } }).contribution;         // +30*wKill(5)=150
    const kr = window.__dev.ledger({ nowMs: T, grantRep: 40 }).contribution;                          // mismo period ⇒ acumula +40*wRep(1)=40 ⇒ 190
    return { k, kr };
  }, T_FRESH);
  ok("5 contribución DERIVADA de contadores monótonos: kill{30} ⇒ +150 (wKill 5); +grantRep{40} mismo period ⇒ 190 (wRep 1, acumula)",
     contrib.k === 150 && contrib.kr === 190, JSON.stringify(contrib));

  // 6 *** MULTIPLAYER 2-CLIENTE *** — se ejecuta AL FINAL (abrir un 2º page blurea `page` ⇒ el game-loop se auto-pausa,
  // index.html:113 ⇒ congelaría los render-probes 12/13). Correrlo tras todos los probes deja `page` sin blurear. Ver más abajo.

  // 7 pledge required: ON + no oath ⇒ heroOrder null, unlocked false, community marker still exists
  const noOath = await page.evaluate((T) => {
    window.__dev.oath({ enabled: false });
    const l = window.__dev.ledger({ enabled: true, nowMs: T });
    return { heroOrder: l.heroOrder, unlocked: l.unlocked, communityExists: l.orders.every(o => o.baseline > 0) };
  }, T_LATE);
  ok("7 PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND unlocked false (marcador colectivo existe igual)",
     noOath.heroOrder === null && noOath.unlocked === false && noOath.communityExists === true, JSON.stringify(noOath));

  // re-arm dawn for the passive checks
  await armOath(page, "dawn");

  // 8 unlock on cross ⇒ dawn passive = safeRegen 0.20
  const dawn = await page.evaluate((T) => {
    const l = window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 400 } });                    // +2000 pts ⇒ cruza 1000 con holgura
    return { unlocked: l.unlocked, total: l.total, goal: l.goal, mS: l.ledgerMulSafeRegen, mC: l.ledgerMulRestedCap, mR: l.ledgerMulRecallCd };
  }, T_LATE);
  ok("8 UNLOCK al cruzar ⇒ pasivo 'dawn'=safeRegen: unlocked true AND ledgerMulSafeRegen==0.20 AND restedCap/recallCd sin tocar",
     dawn.unlocked === true && dawn.total >= dawn.goal && near(dawn.mS, 0.20) && dawn.mC === 0 && dawn.mR === 0, JSON.stringify(dawn));

  // 9 passive gated on the CROSS, not on enabled: fresh low-frac week ⇒ not unlocked ⇒ all ledgerMul 0
  const gated = await page.evaluate((T) => {
    const l = window.__dev.ledger({ enabled: true, nowMs: T });                                       // semana nueva frac~0: baseline~0 + base reset ⇒ contribución 0
    return { unlocked: l.unlocked, mS: l.ledgerMulSafeRegen, mC: l.ledgerMulRestedCap, mR: l.ledgerMulRecallCd };
  }, T_FRESH_LOW);
  ok("9 PASSIVE gateado al CRUCE (no a enabled): pledged pero frac~0/sin cruzar ⇒ unlocked false AND ledgerMul*==0",
     gated.unlocked === false && gated.mS === 0 && gated.mC === 0 && gated.mR === 0, JSON.stringify(gated));

  // 10 iron passive by EFFECTIVE-KNOB DELTA (isola el aporte del Libro del pasivo del Juramento, que también toca restedCap):
  //    restedCap(cruzado) − restedCap(NO-cruzado, misma orden) == base*0.25 == 150; ledgerMulRestedCap flip 0→0.25.
  const iron = await page.evaluate((TLo, THi) => {
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "iron" });                    // avanza ≥ switchCooldownKills + cambia orden
    const lo = window.__dev.ledger({ enabled: true, nowMs: TLo });                                     // semana fresca frac~0 ⇒ no cruza (sólo el pasivo del Juramento)
    const hi = window.__dev.ledger({ enabled: true, nowMs: THi, kill: { n: 400 } });                   // semana alta + kills ⇒ cruza (Juramento + Libro)
    return { heroOrder: hi.heroOrder, loUnlocked: lo.unlocked, hiUnlocked: hi.unlocked, mCLo: lo.ledgerMulRestedCap, mCHi: hi.ledgerMulRestedCap, capLo: lo.restedCap, capHi: hi.restedCap };
  }, T_IRON_LO, T_LATE);
  ok("10 PASSIVE 'iron'=restedCap por DELTA de KNOB EFECTIVO: restedCap(cruzado)−restedCap(no-cruzado)==600*0.25==150 AND ledgerMulRestedCap 0→0.25",
     iron.heroOrder === "iron" && iron.loUnlocked === false && iron.hiUnlocked === true && iron.mCLo === 0 && near(iron.mCHi, 0.25) && near(iron.capHi - iron.capLo, 150, 0.05), JSON.stringify(iron));

  // 11 wander passive by EFFECTIVE-KNOB DELTA: recallCdSec(no-cruzado) − recallCdSec(cruzado) == base*0.12 == 57.6; ledgerMulRecallCd flip 0→0.12.
  const wander = await page.evaluate((TLo, THi) => {
    window.__dev.oath({ kill: { n: 30 } }); window.__dev.oath({ pledge: "wander" });
    const lo = window.__dev.ledger({ enabled: true, nowMs: TLo });
    const hi = window.__dev.ledger({ enabled: true, nowMs: THi, kill: { n: 400 } });
    return { heroOrder: hi.heroOrder, loUnlocked: lo.unlocked, hiUnlocked: hi.unlocked, mRLo: lo.ledgerMulRecallCd, mRHi: hi.ledgerMulRecallCd, cdLo: lo.recallCdSec, cdHi: hi.recallCdSec };
  }, T_WAND_LO, T_LATE);
  ok("11 PASSIVE 'wander'=recallCd por DELTA de KNOB EFECTIVO: recallCdSec(no-cruzado)−recallCdSec(cruzado)==480*0.12==57.6 AND ledgerMulRecallCd 0→0.12",
     wander.heroOrder === "wander" && wander.loUnlocked === false && wander.hiUnlocked === true && wander.mRLo === 0 && near(wander.mRHi, 0.12) && near(wander.cdLo - wander.cdHi, 57.6, 0.05), JSON.stringify(wander));

  // 12 render nameplate ★ (Date.now pinned so the unlocked state persists across rAF grabs; tag ⟦⟧ present both frames ⇒ only ★ differs).
  // FULL-CANVAS diff (la ★ es minúscula ~9px y su posición depende de h.x/tw ⇒ un crop fijo puede perderla); churn-gated por un frame
  // de control (bob del héroe). El estado se pinnea a una SEMANA DEDICADA (off0 genuinamente NO-unlocked) y se cruza con kill{500}.
  const star = await page.evaluate(async (T) => {
    window.dispatchEvent(new Event("focus"));                // despausa el game-loop por si `page` quedó blureado (index.html:113)
    await new Promise(r => setTimeout(r, 100));
    const realNow = Date.now; Date.now = () => T;
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const grab = () => Array.from(g.getImageData(0, 0, cv.width, cv.height).data);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.setHeroHp) window.__dev.setHeroHp(9999);   // el héroe DEBE estar vivo: drawHeroNameplate (tag+★) está gateado a !h.dead
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    // nowMs:T ⇒ G.ledger + killBase snapshot SÍNCRONOS a la semana dedicada (contribución 0) ⇒ off0 genuinamente NO-unlocked (Date.now
    // pinned ⇒ el tick por-frame no re-snapshotea: mismo period ⇒ la contribución del kill{500} acumula y cruza).
    window.__dev.ledger({ enabled: true, nowMs: T }); window.__dev.oath({ pledge: "dawn" });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off0Unlocked = window.__dev.ledger().unlocked, heroOrder = window.__dev.ledger().heroOrder;
    const off0 = grab();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off1 = grab();                                     // control de churn (bob del héroe)
    window.__dev.ledger({ kill: { n: 500 } });               // cruza ⇒ unlocked ⇒ ★ aparece (persiste: Date.now pinned)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    const unlocked = window.__dev.ledger().unlocked;
    let signal = 0, churn = 0, maxDOn = 0; for (let i = 0; i < on.length; i += 4) {
      const dOn = Math.abs(on[i] - off0[i]) + Math.abs(on[i + 1] - off0[i + 1]) + Math.abs(on[i + 2] - off0[i + 2]);
      const dBg = Math.abs(off1[i] - off0[i]) + Math.abs(off1[i + 1] - off0[i + 1]) + Math.abs(off1[i + 2] - off0[i + 2]);
      if (dBg > 25) churn++;
      if (dOn > maxDOn) maxDOn = dOn;
      if (dOn > 40 && dBg <= 25) signal++;
    }
    if (window.__dev.daynight) window.__dev.daynight(null);
    Date.now = realNow;
    const hh = window.__dev.ledger().hero;
    return { signal, churn, maxDOn, unlocked, off0Unlocked, heroOrder, dead: hh && hh.dead };
  }, T_STAR);
  ok("12 render nameplate ★: con la orden EN RACHA se dibuja la ★ junto al tag (Δ px full-canvas vs pledged-no-unlocked)",
     star.unlocked === true && star.off0Unlocked === false && star.heroOrder === "dawn" && star.dead === false && star.signal > 3,
     `signal=${star.signal} churn=${star.churn} maxDOn=${star.maxDOn} off0Unlocked=${star.off0Unlocked} heroOrder=${star.heroOrder} unlocked=${star.unlocked} dead=${star.dead}`);

  // 13 render ledger-row via REAL nav to the bounty board
  const row = await page.evaluate(async () => {
    // asegura escena 'play' antes de navegar (checks previos pudieron dejar pause/otra escena)
    for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
    const press = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyE", key: "e", bubbles: true }));
    window.__dev.ledger({ enabled: false });
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
    window.__dev.ledger({ enabled: true });                 // panel crece + fila del Libro
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
  ok("13 render ledger-row (NAV REAL bountyTP+KeyE→bounty): la fila del Libro cambia el panel con ON vs OFF (panel estático)",
     row.signal > 200, `scene=${row.scene} signal=${row.signal} back=${row.back}`);

  // 14 persist ON: save blob carries snapshot
  const persist = await page.evaluate((T) => {
    window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 10 } });
    const blob = window.__dev.saveBlob();
    return { hasKey: "ledgerAt" in blob, la: blob.ledgerAt };
  }, T_LATE);
  ok("14 persist ON: saveBlob tiene 'ledgerAt' {period,killBase,repBase} números (contribución sobrevive al reload)",
     persist.hasKey === true && persist.la && typeof persist.la.period === "number" && typeof persist.la.killBase === "number" && typeof persist.la.repBase === "number",
     JSON.stringify(persist));

  // 15 arc regression full-stack
  await page.evaluate(async () => { for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); } });
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 }).catch(() => {});
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const l = window.__dev.ledger(), o = window.__dev.oath(), b = window.__dev.bounty({ act: true }), s = window.__dev.sanctuary(), q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(), em = window.__dev.emissary(), rc = window.__dev.recall();
    return { ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("15 arco regr full-stack: LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con LEDGER ON",
     arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 16 fps no-regression
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 800) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    window.__dev.ledger({ enabled: false }); const off = await measure();
    window.__dev.ledger({ enabled: true }); const on = await measure();
    return { off, on };
  });
  ok("16 fps NO-REGRESIÓN: LEDGER ON no degrada el frame budget vs OFF (headless ⇒ relativo, ON ≥ OFF*0.9)",
     fps.on >= fps.off * 0.9, `on≈${Math.round(fps.on)} off≈${Math.round(fps.off)}`);

  await page.screenshot({ path: join(OUT, "observable.png") });

  // 6 *** MULTIPLAYER 2-CLIENTE *** (AL FINAL: abre un 2º page → blurea `page`, pero ya no quedan render-probes) — dos páginas
  // independientes, MISMO nowMs inyectado ⇒ orders[].baseline IDÉNTICO por orden (convergencia, server-authority-ready, 0 desync).
  // Ambos jurados a 'dawn' ⇒ ven el MISMO marcador colectivo; A contribuye 500 kills y B NO lo ve (per-hero, sin contención).
  const pageB = await freshPage(browser, base, errors);
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
  ok("6 MULTIPLAYER 2-CLIENTE: 2 páginas, mismo nowMs ⇒ orders[].baseline IDÉNTICO por orden (convergencia) AND contribución per-hero SIN contención",
     baselinesMatch && clockMatch && noContention && mpA.baselines.every(([, v]) => v > 0),
     `baselinesMatch=${baselinesMatch} clockMatch=${clockMatch} A:${mpA.contribution}→${mpAAfter} B:${mpB.contribution}→${mpBAfter} | A=${JSON.stringify(mpA.baselines)} B=${JSON.stringify(mpB.baselines)}`);

  ok("0 no JS errors during run", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (e) {
  console.error("HARNESS ERROR", e); FAIL++;
} finally {
  await browser.close(); await server.close();
}
console.log(`\n${PASS}/${PASS + FAIL} PASS  (${FAIL} fail)`);
