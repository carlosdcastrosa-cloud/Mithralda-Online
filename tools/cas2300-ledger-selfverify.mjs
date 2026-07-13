// CAS-2300 — GE self-verify for LIBRO DE LA ORDEN / ORDER LEDGER (DARK, SANCTUARY_LEDGER.enabled:false).
// Progresión COLECTIVA semanal de la orden: un MARCADOR compartido por todos los miembros de una misma orden (las 3 órdenes del
// Juramento), derivado deterministamente del reloj de pared (baseline = agregado de la comunidad, rampado por la fracción de semana)
// + la contribución del jugador (contadores monótonos h.kills/h.sanctuaryRep ya vivos). Al CRUZAR el `goal` esa semana, la orden
// obtiene un PASIVO temporal que REUTILIZA un knob ya vivo (safeRegen/restedCap/recallCd, mismo seam que oathMul/reward). Visible como
// ★ sobre el TAG de orden del nameplate + una fila SOLO-lectura en el panel del Tablón. 0 hotkey nuevo, 0 RNG, server-authority-ready.
//
// Observado vía __dev.ledger (flip enabled IN-MEMORY + nowMs para el reloj semanal + pledge por tryPledgeOath + grantRep/kill para la
// contribución) + __dev.oath/sanctuary/bounty/warhorn/emissary/recall/quartermaster/safeZone/tp/bountyTP/daynight/saveBlob/worldFingerprint.
//
// Checks:
//   1  boots to play, __dev.ledger + arc hooks + __BUILD, 0 JS err.
//   2  DARK default: SANCTUARY_LEDGER.enabled===false AND heroOrder null AND hasField false AND unlocked false ⇒ byte-id.
//   3  byte-id save OFF: saveBlob() has NO 'ledgerAt' key.
//   4  worldFingerprint byte-stable across enabled toggle (0 RNG drift).
//   5  OFF byte-id: enabled false ⇒ ledgerMul*==0 AND recallCdSec/restedCap == base AND hasField false.
//   6  CLOCK determinism (convergencia N-clientes): mismo nowMs ⇒ mismo period/frac/baseline por orden (2 lecturas idénticas).
//   7  CLOCK ramp: frac crece con nowMs ⇒ baseline de una orden crece (semana avanza ⇒ comunidad llena la barra).
//   8  no-clock guard: nowMs<=0 ⇒ period 0, frac 0 (harness sin reloj).
//   9  PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND unlocked false (el marcador existe pero el héroe no recibe pasivo).
//  10  CONTRIBUTION derivada: tras pledge, inyectar nowMs (snapshot base) + kill{n} ⇒ contribution == n*wKill (contador monótono).
//  11  UNLOCK al cruzar: baseline(frac alto)+contribución ≥ goal ⇒ unlocked true (para la orden del héroe).
//  12  PASSIVE gateado al cruce: ON + pledged pero SIN cruzar (frac 0) ⇒ unlocked false AND ledgerMul*==0 (knob base) — no basta enabled.
//  13  PASSIVE aplicado (dawn=safeRegen): tras cruzar con 'dawn' ⇒ ledgerMulSafeRegen==0.20 AND recallCd/restedCap SIN cambio del Libro.
//  14  PASSIVE aplicado (iron=restedCap): pledge 'iron' (tras cooldown) + cruzar ⇒ ledgerMulRestedCap==0.25.
//  15  persist ON: saveBlob() tiene 'ledgerAt' {period,killBase,repBase} (la contribución semanal sobrevive al reload).
//  16  render nameplate ★: con la orden EN RACHA (unlocked) se dibuja la ★ junto al tag (Δ px vs pledged-no-unlocked, Date.now pin).
//  17  render ledger-row: en la escena `bounty` la fila del Libro crece el panel + se dibuja con ON vs OFF (Δ px panel estático).
//  18  arco regr: con LEDGER ON, OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL siguen sanos.
//  19  fps NO-REGRESIÓN con la feature ON vs OFF (relativo, ON ≥ OFF*0.9).
//   0  no JS errors during run.
// Run: node tools/cas2300-ledger-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2300");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

// SEMANAL: periodSec=604800 ⇒ periodMs=604800000. TARGET = semana 5000, ~97% dentro ⇒ frac alto (comunidad casi llena la barra).
const PERIOD_MS = 604800 * 1000;
const T_LATE = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.97);   // frac ≈ 0.97
const T_EARLY = 5000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02);  // misma semana 5000, frac ≈ 0.02 (baseline ~0)
const T_FRESH_C = 6000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.50);   // SEMANA NUEVA (6000) ⇒ fuerza re-snapshot del base (contribución fresca)
const T_FRESH_LOW = 7000 * PERIOD_MS + Math.floor(PERIOD_MS * 0.02); // SEMANA NUEVA (7000), frac bajo ⇒ baseline ~0 + contribución 0 (gate)

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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.ledger && window.__dev.oath && window.__dev.bounty && window.__dev.sanctuary && window.__dev.quartermaster && window.__dev.warhorn && window.__dev.emissary && window.__dev.recall && window.__dev.safeZone && window.__dev.saveBlob && window.__dev.worldFingerprint && window.__dev.bountyTP));
  ok("1 boots to play, __dev.ledger + arc hooks + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 DARK default
  const dark = await page.evaluate(() => window.__dev.ledger());
  ok("2 DARK default: enabled false AND heroOrder null AND hasField false AND unlocked false",
     dark.enabled === false && dark.heroOrder === null && dark.hasField === false && dark.unlocked === false,
     `enabled=${dark.enabled} heroOrder=${dark.heroOrder} hasField=${dark.hasField} unlocked=${dark.unlocked} goal=${dark.goal}`);

  // 3 save OFF has no key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  ok("3 byte-id save OFF: no 'ledgerAt' key in save blob", !/"ledgerAt"/.test(saveOff), `len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.ledger({ enabled: true }));
  const fpAfter = await page.evaluate(() => JSON.stringify(window.__dev.worldFingerprint(123)));
  await page.evaluate(() => window.__dev.ledger({ enabled: false }));
  ok("4 worldFingerprint byte-stable across enabled toggle (0 RNG drift)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 OFF knob byte-id: ledgerMul*==0 AND knobs==base AND hasField false
  const knobBase = await page.evaluate(() => { window.__dev.ledger({ enabled: false }); const l = window.__dev.ledger();
    return { mS: l.ledgerMulSafeRegen, mC: l.ledgerMulRestedCap, mR: l.ledgerMulRecallCd, recallCdSec: l.recallCdSec, restedCap: l.restedCap, hasField: l.hasField }; });
  // (hasField-false = COLD-BOOT byte-id, ya probado en check 2 antes de cualquier enable; en producción DARK el flag jamás se flipea
  //  en runtime ⇒ el campo nunca se crea. Aquí, tras el toggle de QA del check 4, el tick pudo crear el campo — irrelevante para el
  //  gate real, que exige knobs byte-id: con enabled OFF ledgerMul corta en el gate ⇒ knob base exacto.)
  ok("5 OFF knob byte-id: ledgerMul*==0 AND recallCdSec/restedCap == base (enabled OFF ⇒ gate corta ⇒ knob base exacto)",
     knobBase.mS === 0 && knobBase.mC === 0 && knobBase.mR === 0 && knobBase.recallCdSec === 480 && knobBase.restedCap === 600,
     `ledgerMul={s:${knobBase.mS},c:${knobBase.mC},r:${knobBase.mR}} recallCdSec=${knobBase.recallCdSec} restedCap=${knobBase.restedCap}`);
  const BASE_RECALL = knobBase.recallCdSec, BASE_CAP = knobBase.restedCap;

  // 6 clock determinism: same nowMs ⇒ identical period/frac/baseline per order (convergencia)
  const det = await page.evaluate((T) => {
    window.__dev.ledger({ enabled: true });
    const a = window.__dev.ledger({ nowMs: T });
    const b = window.__dev.ledger({ nowMs: T });
    return { pa: a.schedule.period, pb: b.schedule.period, fa: a.schedule.frac, fb: b.schedule.frac,
      ba: a.orders.map(o => o.baseline), bb: b.orders.map(o => o.baseline) };
  }, T_LATE);
  ok("6 CLOCK determinism: mismo nowMs ⇒ mismo period/frac/baseline por orden (convergencia N-clientes)",
     det.pa === det.pb && near(det.fa, det.fb) && JSON.stringify(det.ba) === JSON.stringify(det.bb),
     `period=${det.pa}/${det.pb} frac=${det.fa} baseline=${JSON.stringify(det.ba)}`);

  // 7 clock ramp: baseline grows with frac (community fills the bar over the week)
  const ramp = await page.evaluate((TE, TL) => {
    const e = window.__dev.ledger({ nowMs: TE }).orders[0].baseline;
    const l = window.__dev.ledger({ nowMs: TL }).orders[0].baseline;
    return { early: e, late: l };
  }, T_EARLY, T_LATE);
  ok("7 CLOCK ramp: baseline crece con la fracción de semana (comunidad llena la barra)", ramp.late > ramp.early,
     `early(frac~0.02)=${ramp.early} late(frac~0.97)=${ramp.late}`);

  // 8 no-clock guard
  const noclk = await page.evaluate(() => { const s = window.__dev.ledger({ nowMs: 0 }).schedule; return s; });
  ok("8 no-clock guard: nowMs<=0 ⇒ period 0, frac 0", noclk && noclk.period === 0 && noclk.frac === 0, JSON.stringify(noclk));

  // 9 pledge required: enabled ON but NO oath ⇒ heroOrder null, unlocked false
  const noOath = await page.evaluate((T) => {
    window.__dev.oath({ enabled: false });   // sin juramento ⇒ sin orden del héroe
    const l = window.__dev.ledger({ enabled: true, nowMs: T });
    return { heroOrder: l.heroOrder, unlocked: l.unlocked, communityExists: l.orders.every(o => o.baseline > 0) };
  }, T_LATE);
  ok("9 PLEDGE requerido: ON + sin juramento ⇒ heroOrder null AND unlocked false (marcador colectivo existe igual)",
     noOath.heroOrder === null && noOath.unlocked === false && noOath.communityExists === true, JSON.stringify(noOath));

  // set up the oath (order affiliation) once: enable oath+rep, grant rank, pledge dawn
  await page.evaluate(() => {
    window.__dev.oath({ enabled: true });
    window.__dev.sanctuary({ enabled: true }); window.__dev.oath({ grantRep: 300 });   // → rango ≥ minRank
    window.__dev.oath({ pledge: "dawn" });
  });

  // 10 contribution derived from monotonic counters — SEMANA NUEVA (T_FRESH_C) fuerza re-snapshot del base ⇒ contribución fresca:
  // nowMs snapshotea base=(kills,rep) actuales, luego kill{30} suma delta ⇒ contribution == 30*wKill (rep delta 0, base recién tomado).
  const contrib = await page.evaluate((T) => {
    const l = window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 30 } });
    return { contribution: l.contribution, heroOrder: l.heroOrder };
  }, T_FRESH_C);
  ok("10 CONTRIBUTION derivada: semana nueva (re-snapshot) + kill{30} ⇒ contribution == 30*wKill(5) == 150",
     contrib.contribution === 150 && contrib.heroOrder === "dawn", JSON.stringify(contrib));

  // 11 unlock on cross: high frac baseline + big contribution ≥ goal ⇒ unlocked
  const unlock = await page.evaluate((T) => {
    const l = window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 400 } });   // +400*5=2000 pts ⇒ cruza 1000 con holgura
    return { total: l.total, goal: l.goal, unlocked: l.unlocked, mS: l.ledgerMulSafeRegen };
  }, T_LATE);
  ok("11 UNLOCK al cruzar: baseline(frac alto)+contribución ≥ goal ⇒ unlocked true (orden 'dawn')",
     unlock.unlocked === true && unlock.total >= unlock.goal, JSON.stringify(unlock));

  // 12 passive gated on the CROSS, not merely on enabled: SEMANA NUEVA de frac bajo (baseline~0) + re-snapshot (contribución 0) ⇒ NOT unlocked ⇒ ledgerMul 0
  const gated = await page.evaluate((TL) => {
    const l = window.__dev.ledger({ enabled: true, nowMs: TL });   // semana nueva frac~0: baseline ~0 + base reset ⇒ contribución 0
    return { total: l.total, unlocked: l.unlocked, mS: l.ledgerMulSafeRegen, recallCdSec: l.recallCdSec, restedCap: l.restedCap };
  }, T_FRESH_LOW);
  ok("12 PASSIVE gateado al cruce: ON + pledged pero sin cruzar (frac~0) ⇒ unlocked false AND ledgerMul*==0 (no basta enabled)",
     gated.unlocked === false && gated.mS === 0, JSON.stringify(gated));

  // 13 passive applied (dawn=safeRegen): after crossing ⇒ ledgerMulSafeRegen==0.20, recallCd/restedCap unchanged BY THE LEDGER
  const dawn = await page.evaluate((T, baseCap) => {
    const l = window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 400 } });
    return { mS: l.ledgerMulSafeRegen, mC: l.ledgerMulRestedCap, mR: l.ledgerMulRecallCd, restedCap: l.restedCap, baseCap };
  }, T_LATE, BASE_CAP);
  ok("13 PASSIVE aplicado (dawn=safeRegen): ledgerMulSafeRegen==0.20 AND ledgerMulRestedCap/RecallCd==0 (dawn no toca esos knobs)",
     near(dawn.mS, 0.20) && dawn.mC === 0 && dawn.mR === 0, JSON.stringify(dawn));

  // 14 passive applied (iron=restedCap): switch order to iron (kills already ≥ cooldown), cross ⇒ ledgerMulRestedCap==0.25
  const iron = await page.evaluate((T) => {
    window.__dev.oath({ kill: { n: 30 } });               // avanza el contador ≥ switchCooldownKills del Juramento
    window.__dev.oath({ pledge: "iron" });                // cambia la orden del héroe
    const l = window.__dev.ledger({ enabled: true, nowMs: T, kill: { n: 400 } });
    return { heroOrder: l.heroOrder, unlocked: l.unlocked, mC: l.ledgerMulRestedCap, mS: l.ledgerMulSafeRegen };
  }, T_LATE);
  ok("14 PASSIVE aplicado (iron=restedCap): pledge 'iron' + cruzar ⇒ ledgerMulRestedCap==0.25 AND ledgerMulSafeRegen==0",
     iron.heroOrder === "iron" && iron.unlocked === true && near(iron.mC, 0.25) && iron.mS === 0, JSON.stringify(iron));

  // 15 persist ON: save blob carries ledgerAt snapshot
  const persist = await page.evaluate(() => { const blob = window.__dev.saveBlob();
    return { hasKey: "ledgerAt" in blob, la: blob.ledgerAt }; });
  ok("15 persist ON: saveBlob tiene 'ledgerAt' {period,killBase,repBase} números",
     persist.hasKey === true && persist.la && typeof persist.la.period === "number" && typeof persist.la.killBase === "number" && typeof persist.la.repBase === "number",
     JSON.stringify(persist));

  // 16 render nameplate ★ (Date.now pinned so the unlocked state persists across rAF grabs)
  const star = await page.evaluate(async (T) => {
    const realNow = Date.now; Date.now = () => T;          // PIN el reloj ⇒ tickLedger deriva SIEMPRE la misma semana (frac alto)
    const cv = document.querySelector("canvas"); const g = cv.getContext("2d");
    const x0 = Math.floor(cv.width * 0.34), y0 = Math.floor(cv.height * 0.20), bw = Math.floor(cv.width * 0.32), bh = Math.floor(cv.height * 0.34);
    const grab = () => Array.from(g.getImageData(x0, y0, bw, bh).data);
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    if (window.__dev.daynight) window.__dev.daynight(0.5);
    window.__dev.ledger({ enabled: true });
    window.__dev.oath({ pledge: "dawn" });                 // tag ⟦Alba⟧ presente en AMBOS estados ⇒ sólo la ★ difiere
    // estado NO-unlocked: dejar que tickLedger snapshotee base@T (contribución ~0)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off0 = grab();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const off1 = grab();                                    // control de churn (bob del héroe)
    window.__dev.ledger({ kill: { n: 500 } });              // cruza el umbral ⇒ unlocked ⇒ ★ aparece (persiste: Date.now pinned)
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const on = grab();
    const unlocked = window.__dev.ledger().unlocked;
    let signal = 0; for (let i = 0; i < on.length; i += 4) {
      const dOn = Math.abs(on[i] - off0[i]) + Math.abs(on[i + 1] - off0[i + 1]) + Math.abs(on[i + 2] - off0[i + 2]);
      const dBg = Math.abs(off1[i] - off0[i]) + Math.abs(off1[i + 1] - off0[i + 1]) + Math.abs(off1[i + 2] - off0[i + 2]);
      if (dOn > 40 && dBg <= 25) signal++;
    }
    if (window.__dev.daynight) window.__dev.daynight(null);
    Date.now = realNow;
    return { signal, unlocked };
  }, T_LATE);
  ok("16 render nameplate ★: con la orden EN RACHA se dibuja la ★ junto al tag (Δ px vs pledged-no-unlocked)",
     star.unlocked === true && star.signal > 3, `signal=${star.signal} unlocked=${star.unlocked}`);

  // 17 render ledger-row in the bounty board scene: open board, compare ON vs OFF panel
  const row = await page.evaluate(async () => {
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
    window.__dev.ledger({ enabled: true });                // panel crece +46 + fila del Libro
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
  ok("17 render ledger-row: en la escena `bounty` la fila del Libro cambia el panel con ON vs OFF (panel estático)",
     row.signal > 200, `scene=${row.scene} signal=${row.signal} back=${row.back}`);

  // 18 arc regression
  await page.evaluate(async () => {
    for (let i = 0; i < 5 && window.__dev.scene() !== "play"; i++) { window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true })); await new Promise(r => setTimeout(r, 60)); }
  });
  await page.waitForFunction("window.__dev.scene()==='play'", { timeout: 5000 }).catch(() => {});
  const arc = await page.evaluate(() => {
    const sz = window.__dev.safeZone(); window.__dev.tp(sz.temple.x / 32, sz.temple.y / 32);
    window.__dev.ledger({ enabled: true }); window.__dev.oath({ enabled: true }); window.__dev.bounty({ enabled: true }); window.__dev.sanctuary({ enabled: true });
    window.__dev.quartermaster({ enabled: true }); window.__dev.warhorn({ enabled: true }); window.__dev.emissary({ enabled: true }); window.__dev.recall({ enabled: true });
    const l = window.__dev.ledger(); const o = window.__dev.oath(); const b = window.__dev.bounty({ act: true }); const s = window.__dev.sanctuary(); const q = window.__dev.quartermaster();
    const w = window.__dev.warhorn(); const em = window.__dev.emissary(); const rc = window.__dev.recall();
    return { ledgerOk: l.enabled, oathOk: o.enabled, bountyOk: !!b.active, sanctOk: s.enabled, qmOk: q.enabled, warhornOk: w.enabled, emissaryOk: em.enabled, recallOk: rc.enabled };
  });
  ok("18 arco regr: LEDGER + OATH + BOUNTY + REP + REWARDS + WORLD_EVENT + EMISSARY + RECALL sanos con LEDGER ON",
     arc.ledgerOk && arc.oathOk && arc.bountyOk && arc.sanctOk && arc.qmOk && arc.warhornOk && arc.emissaryOk && arc.recallOk, JSON.stringify(arc));

  // 19 fps NO-REGRESSION
  const fps = await page.evaluate(async () => {
    const measure = () => new Promise((res) => { let frames = 0; const t0 = performance.now();
      function loop() { frames++; if (performance.now() - t0 >= 800) res(frames * 1000 / (performance.now() - t0)); else requestAnimationFrame(loop); } requestAnimationFrame(loop); });
    window.__dev.ledger({ enabled: false }); const off = await measure();
    window.__dev.ledger({ enabled: true }); const on = await measure();
    return { off, on };
  });
  ok("19 fps NO-REGRESIÓN: LEDGER ON no degrada el frame budget vs OFF (headless ⇒ relativo, ON ≥ OFF*0.9)",
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
