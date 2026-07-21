// CAS-2852 — POST-FLIP LIVE QA for YUGO (CO_INTERRUPT_SURGE.enabled:TRUE LIVE, EVO#148, 90º flag). Base master 45fecc6 (95d9992/31d4535 DARK → 12d8663 flip false→true → 45fecc6 version stamp 4a0403b7e832/815), served LIVE carlosdcastrosa-cloud.github.io/Mithralda-Online.
// Derivado del DARK self-verify cas2849 con: ck2 INVERTIDO LIVE-ON (enabled TRUE, solo boot ⇒ I≤1 ⇒ score/tier/charge colapsan LIMPIO), ck14 CENSUS INVERTIDO (76/76 enabled:true off=[]), + ck18 SERVED-LIVE-BUILD (root200 + version.json 4a0403b7e832/815 + served config CO_INTERRUPT_SURGE enabled:true + census 76/76). Gameplay/determinismo corre contra checkout local NO-DRIFT (HEAD==origin==45fecc6, byte-idéntico a lo servido); ck18 verifica los BYTES SERVIDOS. ck16 North Star asserta charge>0 (co-interrupt bounty grants en el build ON — la aserción INVERTIDA vs DARK QA).
// (A) EJE = YUGO/CO-INTERRUPT = I = nº de jugadores VIVOS DISTINTOS con un flag de interrupt/stagger/poise-break (`interrupt`) LANDEADO sobre un enemigo este frame (co-interrupt/lockdown-sync). Tally BOOLEANO ENTERO (CERO float; conteo CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midInterrupt2,hiInterrupt3}. I≥3 ⇒ lockdown-pleno ⇒ 2; I≥2 ⇒ lockdown-parcial ⇒ 1; <2 ⇒ 0. ⊥ #146 CONJURO (LANDED-CONTROL ⊥ ANY-CAST), ⊥ #147 QUIEBRO (interrupt-EVENTO-OFENSIVO ⊥ dodge-STATE-DEFENSIVO, OPUESTOS), ⊥ #143 ENVITE (control ⊥ push/velocidad), ⊥ #138 CUADRILLA (staggerear ⊥ rematar), ⊥ INTERRUPT_SURGE #89 (mob-side ⊥ player-side). 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 interrupter ⇒ I colapsa ⇒ 0.
// (B) CANAL = coInterruptFind (fichas de yugo por rematar con el lockdown ACREDITADO). Moneda FRESCA (h.coInterruptBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2852-cointerrupt-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2852");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// interruptProbe LUT esperada: (interrupters=nº de jugadores landeando control, players=P gate)→I=clamp(interrupters,0,players)→banda(I vs {midInterrupt2,hiInterrupt3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiInterrupt 3 / midInterrupt 2 + colapso single-player (I<minPlayers2 ⇒ 0).
const EXPECT_INT = [
  { name: "solo-P1",       interrupters: 1, players: 1, I: 1, w: 0 },
  { name: "duo-P2",        interrupters: 2, players: 2, I: 2, w: 1 },
  { name: "duo-of-4",      interrupters: 2, players: 4, I: 2, w: 1 },
  { name: "trio-P3",       interrupters: 3, players: 3, I: 3, w: 2 },
  { name: "quad-4",        interrupters: 4, players: 4, I: 4, w: 2 },
  { name: "none",          interrupters: 0, players: 3, I: 0, w: 0 },
  { name: "one-of-4",      interrupters: 1, players: 4, I: 1, w: 0 },
  { name: "clamp-players", interrupters: 9, players: 3, I: 3, w: 2 },
];
// driveInterrupt REAL: roster sintético (P jugadores con {interrupt,dead}) ⇒ I server-auth = # jugadores VIVOS con el flag `interrupt`. filas: [interrupt, dead].
const EXPECT_DRIVE = [
  { name: "duo-int",           players: [[true, false], [true, false]],                         I: 2, w: 1 },
  { name: "one-int",           players: [[true, false], [false, false]],                        I: 1, w: 0 },
  { name: "solo",              players: [[true, false]],                                        I: 1, w: 0 },
  { name: "trio-int",          players: [[true, false], [true, false], [true, false]],          I: 3, w: 2 },
  { name: "nonint-excluded",   players: [[true, false], [true, false], [false, false]],         I: 2, w: 1 },
  { name: "dead-excluded",     players: [[true, false], [true, false], [true, true]],           I: 2, w: 1 },
  { name: "quad-int",          players: [[true, false], [true, false], [true, false], [true, false]], I: 4, w: 2 },
  { name: "all-idle",          players: [[false, false], [false, false], [false, false]],       I: 0, w: 0 },
];

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

const server = await startServer();
const base = server.url;
const browser = await puppeteer.launch({ executablePath: exe, args: LAUNCH_ARGS, headless: "new" });
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !isEnvErr(m.text())) errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coInterrupt && window.__dev.coDodge && window.__dev.coCast && window.__dev.coFlank && window.__dev.coFocus && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coInterrupt + peer hooks (coDodge/coCast/coFlank/coFocus/coAdvance/coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_INTERRUPT_SURGE.enabled TRUE; solo hero fresh boot, SIN party sintética ⇒ I≤1 < midInterrupt2 ⇒ SCORE/DECISIÓN colapsan LIMPIO. Multijugador-nativo: IMPOSIBLE co-interrumpir en solitario. 🔑 NO asertamos gExists/partyExists false (con enabled:true PUEDEN materializarse) — aserta el COLAPSO DE DECISIÓN.
  const dark = await page.evaluate(() => window.__dev.coInterrupt());
  ok("2 LIVE-ON (fresh solo boot): CO_INTERRUPT_SURGE.enabled TRUE AND sin sincronía (I≤1) ⇒ score/tier/charge/preview colapsan LIMPIO a 0 AND channel coInterruptFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.interrupt <= 1 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coInterruptFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} interrupt=${dark.interrupt} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiInterrupt=${dark.hiInterrupt} midInterrupt=${dark.midInterrupt} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save has no coInterruptFind/coInterruptBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coInterruptFind|coInterruptBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coInterruptBounty"\s*:/.test(saveOff);
  ok("3 byte-id save: sin clave 'coInterruptFind'/'coInterruptBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coInterrupt({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coInterrupt({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ interruptProbe LUT
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coInterrupt({ interruptProbe: { interrupters: c.interrupters, players: c.players } }).interruptProbe), EXPECT_INT);
  const tabOK = EXPECT_INT.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].interrupt === c.I);
  ok("5 ★ interruptProbe LUT (YUGO I=# interrupters distintos): solo-P1(I1)⇒0, duo(I2)⇒1, duo-of-4(I2)⇒1, trio(I3)⇒2, quad(I4)⇒2, none(I0)⇒0, one-of-4(I1)⇒0, clamp-players⇒I3. UMBRAL hiInterrupt 3/midInterrupt 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_INT[i].name, p: x.players, I: x.interrupt, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH YUGO
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ interrupt: !!r[0], dead: !!r[1] }));
    window.__dev.coInterrupt({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coInterrupt({ driveInterrupt: { players: mkParty(c.players), wipe: true } }).driveInterrupt;
      const live = window.__dev.coInterrupt({ interruptProbeLive: true }).interruptProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvInt: dv.interrupt, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveInt: live.interrupt, livePlayers: live.players });
    }
    window.__dev.coInterrupt({ clearInterrupt: true });
    window.__dev.coInterrupt({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvInt === c.I && comp[i].liveInt === c.I);
  ok("5c ★ REAL SERVER-AUTH YUGO (tally de banderas interrupt entre VIVOS): duo-int(I2)=w1, one-int(I1)=w0, solo(I1)=w0, trio-int(I3)=w2, nonint-excl(I2)=w1, dead-excl(I2)=w1, quad-int(I4)=w2, all-idle(I0)=w0 (filtra muertos + no-interrupters)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#146 CONJURO (LANDED-CONTROL-EFFECT ⊥ ANY-CAST)
  const cruxCast = await page.evaluate(() => {
    const itr = (interrupters, P) => window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe;
    const cst = (casters, P) => window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe;
    const brk = { itr: itr(3, 3), cst: cst(0, 3) };
    const cast = { itr: itr(0, 3), cst: cst(3, 3) };
    return { brk, cast };
  });
  const cc = cruxCast;
  const cruxCastOK =
    cc.brk.itr.interrupt === 3 && cc.brk.itr.weight === 2 && cc.brk.cst.cast === 0 && cc.brk.cst.weight === 0
    && cc.cast.itr.interrupt === 0 && cc.cast.itr.weight === 0 && cc.cast.cst.cast === 3 && cc.cast.cst.weight === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#146 CONJURO (LANDED-CONTROL-EFFECT ⊥ ANY-CAST): {3 poise-breakeando, 0 casteando} ⇒ YUGO I3/w2 pero CONJURO U0/w0; {0 interrumpiendo, 3 casteando} ⇒ YUGO I0/w0 pero CONJURO U3/w2 ⇒ control-landeado ⊥ activar-cualquier-habilidad (conteos divergen en AMBOS sentidos)",
     cruxCastOK, JSON.stringify(cruxCast));

  // 6b ★ CRUX ⊥#147 QUIEBRO (interrupt-EVENTO-OFENSIVO ⊥ dodge-STATE-DEFENSIVO, OPUESTOS)
  const cruxDodge = await page.evaluate(() => {
    const itr = (interrupters, P) => window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe;
    const ddg = (dodgers, P) => window.__dev.coDodge({ dodgeProbe: { dodgers, players: P } }).dodgeProbe;
    const A = { itr: itr(3, 3), ddg: ddg(0, 3) };
    const B = { itr: itr(0, 3), ddg: ddg(3, 3) };
    return { A, B };
  });
  const cd = cruxDodge;
  const cruxDodgeOK = cd.A.itr.interrupt === 3 && cd.A.itr.weight === 2 && cd.A.ddg && cd.A.ddg.weight === 0
    && cd.B.itr.interrupt === 0 && cd.B.itr.weight === 0 && cd.B.ddg && cd.B.ddg.weight === 2;
  ok("6b ★ CRUX ⊥#147 QUIEBRO (interrupt-EVENTO-OFENSIVO ⊥ dodge-STATE-DEFENSIVO): {3 interrumpiendo, 0 esquivando} ⇒ YUGO I3/w2 pero QUIEBRO D0/w0; {0 interrumpiendo, 3 esquivando} ⇒ YUGO I0/w0 pero QUIEBRO D3/w2 ⇒ lockear-al-enemigo ⊥ evitar-daño (OPUESTOS)",
     cruxDodgeOK, JSON.stringify(cruxDodge));

  // 6c ★ CRUX ⊥#143 ENVITE (evento-de-control ⊥ push/velocidad-toward)
  const cruxAdv = await page.evaluate(() => {
    const itr = (interrupters, P) => window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe;
    const adv = (pushing, P) => window.__dev.coAdvance({ advanceProbe: { pushing, players: P } }).advanceProbe;
    const A = { itr: itr(3, 3), adv: adv(0, 3) };
    const B = { itr: itr(0, 3), adv: adv(3, 3) };
    return { A, B };
  });
  const ca = cruxAdv;
  const cruxAdvOK = ca.A.itr.interrupt === 3 && ca.A.itr.weight === 2 && ca.A.adv && ca.A.adv.weight === 0
    && ca.B.itr.interrupt === 0 && ca.B.itr.weight === 0 && ca.B.adv && ca.B.adv.weight === 2;
  ok("6c ★ CRUX ⊥#143 ENVITE (evento-de-control ⊥ push/velocidad-toward): {3 interrumpiendo, 0 empujando} ⇒ YUGO I3/w2 pero ENVITE A0/w0; {0 interrumpiendo, 3 empujando} ⇒ YUGO I0/w0 pero ENVITE w2 ⇒ control-landeado ⊥ desplazamiento",
     cruxAdvOK, JSON.stringify(cruxAdv));

  // 6f ★ CRUX CANAL DISTINTO: coInterruptFind ⊥ coDodgeFind/coCastFind/coAdvanceFind/interruptFind(#89 mob-side)
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const grab = (n) => (cfgSrc.match(new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([^\"]+)\"")) || [])[1];
  const coIntCh = grab("CO_INTERRUPT_SURGE"), coDodgeCh = grab("CO_DODGE_SURGE"), coCastCh = grab("CO_CAST_SURGE"), coAdvCh = grab("CO_ADVANCE_SURGE"), mobIntCh = grab("INTERRUPT_SURGE");
  const vmCh = await page.evaluate(() => window.__dev.coInterrupt().channel);
  const chOK = coIntCh === "coInterruptFind" && vmCh === "coInterruptFind" && coDodgeCh === "coDodgeFind" && coCastCh === "coCastFind" && coAdvCh === "coAdvanceFind" && mobIntCh === "interruptFind"
    && [coDodgeCh, coCastCh, coAdvCh, mobIntCh].every(c => c !== coIntCh);
  ok("6f ★ CRUX CANAL FRESCO coInterruptFind ⊥ coDodgeFind #147 / coCastFind #146 / coAdvanceFind #143 / interruptFind #89 (mob-side) (canal DISTINTO por construcción; VM idem)",
     chOK, `coInt=${coIntCh} vm=${vmCh} coDodge=${coDodgeCh} coCast=${coCastCh} coAdv=${coAdvCh} mobInt=${mobIntCh}`);

  // 7 ★ I-SENSITIVITY
  const iSens = await page.evaluate(() => {
    const t = (interrupters, P) => { const m = window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe; return { I: m.interrupt, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), quad: t(4, 4) };
  });
  const iSensOK = iSens.duo.I === 2 && iSens.trio.I === 3 && iSens.quad.I === 4 && iSens.duo.w === 1 && iSens.trio.w === 2 && iSens.quad.w === 2;
  ok("7 ★ I-SENSITIVITY (I sube con más interrupts): 2⇒I2/w1, 3⇒I3/w2, 4⇒I4/w2 (YUGO mide CUÁNTOS interrumpen simultáneamente)",
     iSensOK, JSON.stringify(iSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    const drive = (rows) => { window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coInterrupt({ driveInterrupt: { players: rows.map(r => ({ interrupt: !!r[0], dead: !!r[1] })), wipe: true } }).driveInterrupt;
      const live = window.__dev.coInterrupt({ interruptProbeLive: true }).interruptProbeLive;
      return { idx: dv.idx, interrupt: dv.interrupt, score: dv.score, players: live.players }; };
    const sp = drive([[true, false]]);
    const mp = drive([[true, false], [true, false], [true, false]]);
    window.__dev.coInterrupt({ clearInterrupt: true });
    window.__dev.coInterrupt({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.interrupt === 1 && degen.sp.score === 0 && degen.mp.interrupt === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 interrupter ⇒ I1/score0; 3 interrumpiendo ⇒ I3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE co-interrumpir en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM
  const det = await page.evaluate(() => {
    const a = window.__dev.coInterrupt({ interruptProbe: { interrupters: 3, players: 4 } }).interruptProbe;
    const b = window.__dev.coInterrupt({ interruptProbe: { interrupters: 3, players: 4 } }).interruptProbe;
    return { a: { I: a.interrupt, w: a.weight }, b: { I: b.interrupt, w: b.weight } };
  });
  const detOK = det.a.I === det.b.I && det.a.w === det.b.w && det.a.I === 3;
  ok("9 ★ INTEGER-DETERMINISM: interruptProbe repetido ⇒ I/weight byte-idénticos (conteo ENTERO de banderas + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del conteo
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    const g = (rows) => { window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coInterrupt({ driveInterrupt: { players: rows.map(r => ({ interrupt: !!r[0], dead: !!r[1] })), wipe: true } }).driveInterrupt.interrupt; };
    const a = g([[true, false], [false, false], [true, false]]);
    const b = g([[false, false], [true, false], [true, false]]);
    window.__dev.coInterrupt({ clearInterrupt: true }); window.__dev.coInterrupt({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del conteo: MISMO roster (2 interrupters) en 2 órdenes distintos ⇒ MISMO I2 (el conteo es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 2 && orderInv.b === 2 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coInterruptFind
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } });
    const actVm = window.__dev.coInterrupt();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: false }], wipe: true } });
    const goVm = window.__dev.coInterrupt();
    window.__dev.coInterrupt({ clearInterrupt: true });
    window.__dev.coInterrupt({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coInterruptFind: forageChargePreview lockdown pleno (I≥3) ⇒ charge>0 (==coInterruptBonus); con solitario (I1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 8; s++) vals.push(window.__dev.coInterrupt({ interruptProbe: { interrupters: s, players: s } }).interruptProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.coInterrupt().cap };
  });
  ok("11 ★ SUB-CAP: ningún lockdown pleno produce charge>coInterruptBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF (aún con enabled TRUE en config, el dev-toggle OFF colapsa a byte-id)
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } });
    window.__dev.coInterrupt({ enabled: false });
    const off = window.__dev.coInterrupt();
    window.__dev.coInterrupt({ enabled: true }); window.__dev.coInterrupt({ clearInterrupt: true }); window.__dev.coInterrupt({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, interrupt: off.interrupt };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.interrupt === 0;
  ok("12 ★ BYTE-NEUTRAL OFF (dev-toggle): con OFF, coInterruptBonus(lockdown pleno disponible)==0 + forageChargePreview==0 + idx==0 + interrupt==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } }).driveInterrupt;
    const snap = () => JSON.stringify({ coDodge: window.__dev.coDodge(), coCast: window.__dev.coCast(), coFlank: window.__dev.coFlank(), coFocus: window.__dev.coFocus(), coAdvance: window.__dev.coAdvance(), coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const prev = { cdg: window.__dev.coDodge().enabled, cc: window.__dev.coCast().enabled, fl: window.__dev.coFlank().enabled, fo: window.__dev.coFocus().enabled, ca: window.__dev.coAdvance().enabled, co: window.__dev.coCohesion().enabled, ct: window.__dev.coTank().enabled, cs: window.__dev.coSupport().enabled, ck: window.__dev.coKill().enabled, cp: window.__dev.coPresence().enabled, cf: window.__dev.coFlee().enabled, pv: window.__dev.partyVital().enabled };
    window.__dev.coDodge({ enabled: !prev.cdg }); window.__dev.coCast({ enabled: !prev.cc }); window.__dev.coFlank({ enabled: !prev.fl }); window.__dev.coFocus({ enabled: !prev.fo }); window.__dev.coAdvance({ enabled: !prev.ca }); window.__dev.coCohesion({ enabled: !prev.co }); window.__dev.coTank({ enabled: !prev.ct }); window.__dev.coSupport({ enabled: !prev.cs }); window.__dev.coKill({ enabled: !prev.ck }); window.__dev.coPresence({ enabled: !prev.cp }); window.__dev.coFlee({ enabled: !prev.cf }); window.__dev.partyVital({ enabled: !prev.pv });
    const after = window.__dev.coInterrupt({ interruptProbeLive: true }).interruptProbeLive;
    window.__dev.coDodge({ enabled: prev.cdg }); window.__dev.coCast({ enabled: prev.cc }); window.__dev.coFlank({ enabled: prev.fl }); window.__dev.coFocus({ enabled: prev.fo }); window.__dev.coAdvance({ enabled: prev.ca }); window.__dev.coCohesion({ enabled: prev.co }); window.__dev.coTank({ enabled: prev.ct }); window.__dev.coSupport({ enabled: prev.cs }); window.__dev.coKill({ enabled: prev.ck }); window.__dev.coPresence({ enabled: prev.cp }); window.__dev.coFlee({ enabled: prev.cf }); window.__dev.partyVital({ enabled: prev.pv });
    const peersRestored = snap();
    window.__dev.coInterrupt({ clearInterrupt: true });
    window.__dev.coInterrupt({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.interrupt === after.interrupt;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeInt: before.interrupt, afterInt: after.interrupt };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coInterruptFind ⊥ peers: la señal de co-interrupt (score/interrupt) NO cambia al togglear CO-DODGE #147/CO-CAST #146/CO-FLANK #145/CO-FOCUS #144/CO-ADVANCE #143/CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS (INVERTED LIVE-ON): served config — 76 `_SURGE` totales, 76 enabled:true, off=[] (CO_INTERRUPT #148 LIVE + CO_DODGE #147 LIVE + los 74 priores).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coIntLive = census.find(([n]) => n === "CO_INTERRUPT_SURGE");
  const coDodgeLive = census.find(([n]) => n === "CO_DODGE_SURGE");
  const censusOK = total === 76 && trues === 76 && falses.length === 0 && coIntLive && coIntLive[1] === "true" && coDodgeLive && coDodgeLive[1] === "true";
  ok("14 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 76 `_SURGE` totales, 76 enabled:true, off=[] (CO_INTERRUPT_SURGE #148 LIVE + CO_DODGE_SURGE #147 LIVE + los 74 priores)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coInt=${coIntLive ? coIntLive[1] : "?"} coDodge=${coDodgeLive ? coDodgeLive[1] : "?"}`);

  // 15 render badge "Yugo:" drawn ON+lockdown / not OFF + fps
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Yugo:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coInterrupt({ enabled: true });
    window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coInterrupt({ clearInterrupt: true });
    window.__dev.coInterrupt({ enabled: false });
    const enAtOff = window.__dev.coInterrupt().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Yugo:\" se DIBUJA ON+lockdown (I>0, re-driven cada frame) y NO OFF (I 0) + fps sano (label ÚNICO ⊥ #147 'Quiebro:'/#146 'Conjuro:'/#145 'Tenaza:'/#144 'Diana:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coInterrupt({ enabled: true }); window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coInterrupt({ clearInterrupt: true }); window.__dev.coInterrupt({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence (MANDATORY sev-1). LIVE-ON: I=3 ⇒ score2/interrupt3/players3/tier2/charge>0 (co-interrupt bounty grants).
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error" && !isEnvErr(m.text())) errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((args) => {
    const { Z, FPARG } = args;
    window.__dev.coInterrupt({ enabled: true });
    window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } }).driveInterrupt;
    const vm = window.__dev.coInterrupt();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([interrupters, P]) => { const m = window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe; return { p: m.players, I: m.interrupt, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coInterrupt({ interruptProbeLive: true }).interruptProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coInterrupt({ clearInterrupt: true });
    window.__dev.coInterrupt({ enabled: false });
    return { score: dv.score, idx: dv.idx, interrupt: dv.interrupt, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveInt: live.interrupt, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.interrupt === B.interrupt && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveInt === B.liveInt && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  const onPathOK = A.score === 2 && A.interrupt === 3 && A.players === 3 && A.tier === 2 && A.charge > 0;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): LIVE-ON lockdown I=3 ⇒ score2/interrupt3/players3/tier2/charge>0 (YUGO activo, co-interrupt bounty grants) AND score/idx/interrupt/players/tier/charge + interruptProbeLive(field,interrupt,players,score) + interruptProbe LUT (I enteros) + worldFingerprint IDÉNTICOS byte-a-byte A==B (0 desync)",
     conv && onPathOK, `A={score:${A.score},idx:${A.idx},interrupt:${A.interrupt},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveInt:${A.liveInt},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},interrupt:${B.interrupt},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveInt:${B.liveInt},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp} onPathOK=${onPathOK}`);
  await page.evaluate(() => window.__dev.coInterrupt({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coInterrupt({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == 4a0403b7e832/815 (NEW ≠ old 90e5b2600ac2) + served sim/config.js CO_INTERRUPT_SURGE enabled:true + census 76/76 off=[].
  try {
    const rootRes = await fetch(LIVE_BASE + "/");
    const verRes = await fetch(LIVE_BASE + "/version.json");
    const ver = await verRes.json();
    const cfgRes = await fetch(LIVE_BASE + "/sim/config.js");
    const cfgTxt = await cfgRes.text();
    const lcensus = [...cfgTxt.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
    const lTotal = lcensus.length;
    const lFalses = lcensus.filter(([, v]) => v !== "true").map(([n]) => n);
    const lTrues = lcensus.filter(([, v]) => v === "true").length;
    const lCoInt = lcensus.find(([n]) => n === "CO_INTERRUPT_SURGE");
    const lCoDodge = lcensus.find(([n]) => n === "CO_DODGE_SURGE");
    const servedOK = rootRes.status === 200 && ver.build === "4a0403b7e832" && ver.files === 815 && lTotal === 76 && lTrues === 76 && lFalses.length === 0 && lCoInt && lCoInt[1] === "true" && lCoDodge && lCoDodge[1] === "true";
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 4a0403b7e832/815 (NEW ≠ old 90e5b2600ac2) + served sim/config.js CO_INTERRUPT_SURGE enabled:true + census 76/76 off=[]",
       servedOK, `rootStatus=${rootRes.status} build=${ver.build} files=${ver.files} census total=${lTotal} true=${lTrues} false=${JSON.stringify(lFalses)} coInt=${lCoInt ? lCoInt[1] : "?"} coDodge=${lCoDodge ? lCoDodge[1] : "?"}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 4a0403b7e832/815 + config CO_INTERRUPT_SURGE enabled:true", false, `FETCH ERROR ${String(e)}`);
  }

  // 0 no JS errors
  ok("0 no JS errors during run", errors.length === 0 && errB.length === 0, `A=${errors.length} B=${errB.length} ${errors.concat(errB).slice(0, 3).join(" | ")}`);

} catch (e) {
  console.error("HARNESS ERROR", e);
  FAIL++;
} finally {
  await browser.close();
  await server.close();
}
console.log(`\n${FAIL === 0 ? "ALL PASS" : "SOME FAIL"}  ${PASS}/${PASS + FAIL}`);
