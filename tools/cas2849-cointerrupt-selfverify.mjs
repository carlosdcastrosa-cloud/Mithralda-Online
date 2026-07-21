// CAS-2849 — self-verify for YUGO (DARK, CO_INTERRUPT_SURGE.enabled:false). EVO mecánica #148 (base master df6dd56 tras #147 QUIEBRO CO_DODGE LIVE&served 90e5b2600ac2/815, census 75) — EJE FRESCO + CANAL FRESCO, ⊥ a los 89 LIVE #59-#147. El 30º eje de COMPOSICIÓN-DE-INTENCIÓN y la TRECEAVA faceta de la sub-familia PLAYER-COORDINATION (#136 CÓNCLAVE=ENGANCHADOS, #137 COHORTE=PRESENTES, #138 CUADRILLA=REMATAN, #139 SOCORRO=SOSTIENEN/heal, #140 MURALLA=ABSORBEN, #141 REPLIEGUE=SE ALEJAN/velocidad, #142 PIÑA=APIÑADOS, #143 ENVITE=EMPUJAN, #144 DIANA=CONVERGEN/CONTEO, #145 TENAZA=GEOMETRÍA, #146 CONJURO=ACTIVAN-habilidad/cast, #147 QUIEBRO=ESQUIVAN/dodge); es la sub-faceta OFFENSIVE CONTROL-EFFECT REACTION-EVENT (el ESPEJO OFENSIVO de #147 QUIEBRO).
// (A) EJE FRESCO = YUGO/CO-INTERRUPT = I = nº de jugadores VIVOS DISTINTOS con un flag de interrupt/stagger/poise-break (`interrupt`) LANDEADO sobre un enemigo este frame (co-interrupt/lockdown-sync), ⊥ #146 CONJURO (ANY-CAST — LANDED-CONTROL-EFFECT ⊥ cast), ⊥ #147 QUIEBRO (interrupt-EVENTO-OFENSIVO ⊥ dodge-STATE-DEFENSIVO), ⊥ #143 ENVITE (control ⊥ push/velocidad), ⊥ #138 CUADRILLA (staggerear ⊥ rematar), ⊥ INTERRUPT_SURGE #89 (mob-side ⊥ player-side). Tally BOOLEANO ENTERO. 🔑 DETERMINISMO (sev-1): I = conteo ENTERO de banderas (CERO float/atan2 en el score/decisión; el conteo es CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midInterrupt2,hiInterrupt3} ⇒ 0-float en el score/decisión. Bandas: I≥hiInterrupt(3) ⇒ lockdown-pleno ⇒ 2; I≥midInterrupt(2) ⇒ lockdown-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 interrupter ⇒ I colapsa ⇒ 0 (colapso LIMPIO).
// (B) CANAL FRESCO = coInterruptFind (fichas de yugo por rematar con el lockdown ACREDITADO — NINGUNO de los 89 flags lo usa). Moneda FRESCA (h.coInterruptBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — YUGO = SIMULTANEIDAD-DE-CONTROL-LANDEADO (evento interrupt/stagger/poise-break sobre ENEMIGO) ⊥ TODOS los priores. PRIMARIO ⊥#146 CONJURO (LANDED-CONTROL-EFFECT ⊥ ANY-CAST): 3 poise-breakeando ⇒ YUGO I3/w2 pero CONJURO U0/w0 (castear ≠ romper postura); 3 mid-cast ⇒ CONJURO U3/w2 pero YUGO I0/w0 — los conteos se mueven INDEPENDIENTEMENTE. ⊥#147 QUIEBRO (interrupt-EVENTO ⊥ dodge-STATE): esquivar sin interrumpir vs poise-breakear sin esquivar. ⊥#143 ENVITE (control ⊥ push). ⊥#138 CUADRILLA (staggerear ⊥ rematar).
//
// Run: node tools/cas2849-cointerrupt-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2849");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// interruptProbe LUT esperada: (interrupters=nº de jugadores landeando control, players=P gate)→I=clamp(interrupters,0,players)→banda(I vs {midInterrupt2,hiInterrupt3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiInterrupt 3 / midInterrupt 2 + colapso single-player (I<minPlayers2 ⇒ 0).
const EXPECT_INT = [
  { name: "solo-P1",       interrupters: 1, players: 1, I: 1, w: 0 },   // single-player: I1<midInterrupt ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",        interrupters: 2, players: 2, I: 2, w: 1 },   // 2 interrumpiendo ⇒ I2 ⇒ 1 (lockdown parcial)
  { name: "duo-of-4",      interrupters: 2, players: 4, I: 2, w: 1 },   // 2 interrumpiendo DE un roster de 4 ⇒ I2 ⇒ 1
  { name: "trio-P3",       interrupters: 3, players: 3, I: 3, w: 2 },   // 3 interrumpiendo ⇒ I3 ⇒ 2 (lockdown pleno)
  { name: "quad-4",        interrupters: 4, players: 4, I: 4, w: 2 },   // 4 interrumpiendo ⇒ I4 ⇒ 2
  { name: "none",          interrupters: 0, players: 3, I: 0, w: 0 },   // 🔑 0 interrupts (nadie staggerea) ⇒ I0 ⇒ 0
  { name: "one-of-4",      interrupters: 1, players: 4, I: 1, w: 0 },   // 🔑 1 solo interrupter de 4 ⇒ I1 ⇒ 0 (uno staggerea, los demás no)
  { name: "clamp-players", interrupters: 9, players: 3, I: 3, w: 2 },   // interrupters>P se clampa a P=3 ⇒ I3 ⇒ 2
];
// driveInterrupt REAL: inyecta roster sintético (P jugadores con {interrupt,dead}) ⇒ I server-auth = # jugadores VIVOS con el flag `interrupt`.
// filas: [interrupt, dead].
const EXPECT_DRIVE = [
  { name: "duo-int",           players: [[true, false], [true, false]],                         I: 2, w: 1 },   // 2 interrumpiendo ⇒ I2 (lockdown parcial)
  { name: "one-int",           players: [[true, false], [false, false]],                        I: 1, w: 0 },   // 🔑 1 interrumpe, 1 no ⇒ I1 ⇒ 0
  { name: "solo",              players: [[true, false]],                                        I: 1, w: 0 },   // 1 ⇒ I1 ⇒ 0
  { name: "trio-int",          players: [[true, false], [true, false], [true, false]],          I: 3, w: 2 },   // 3 interrumpiendo ⇒ I3 (lockdown pleno)
  { name: "nonint-excluded",   players: [[true, false], [true, false], [false, false]],         I: 2, w: 1 },   // 🔑 3º NO interrumpe ⇒ EXCLUIDO ⇒ I2
  { name: "dead-excluded",     players: [[true, false], [true, false], [true, true]],           I: 2, w: 1 },   // 🔑 3º MUERTO ⇒ EXCLUIDO ⇒ I2 (ANTI-cadáveres)
  { name: "quad-int",          players: [[true, false], [true, false], [true, false], [true, false]], I: 4, w: 2 },   // 4 interrumpiendo ⇒ I4
  { name: "all-idle",          players: [[false, false], [false, false], [false, false]],       I: 0, w: 0 },   // 🔑 nadie interrumpe ⇒ I0 ⇒ 0
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

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coInterrupt());
  ok("2 byte-id OFF (fresh boot): CO_INTERRUPT_SURGE.enabled false AND G.coInterruptBounty NUNCA se crea (gExists false) AND G._coInterruptParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.interrupt === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coInterruptFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} interrupt=${dark.interrupt} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiInterrupt=${dark.hiInterrupt} midInterrupt=${dark.midInterrupt} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coInterruptFind/coInterruptBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coInterruptFind|coInterruptBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coInterruptBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coInterruptFind'/'coInterruptBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coInterrupt({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coInterrupt({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ interruptProbe LUT: (interrupters,players)→I=clamp→banda(I vs {2,3} ENTEROS)→tier→charge.
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coInterrupt({ interruptProbe: { interrupters: c.interrupters, players: c.players } }).interruptProbe), EXPECT_INT);
  const tabOK = EXPECT_INT.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].interrupt === c.I);
  ok("5 ★ interruptProbe LUT (YUGO I=# interrupters distintos): solo-P1(I1)⇒0, duo(I2)⇒1, duo-of-4(I2)⇒1, trio(I3)⇒2, quad(I4)⇒2, none(I0)⇒0, one-of-4(I1)⇒0, clamp-players⇒I3. UMBRAL hiInterrupt 3/midInterrupt 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_INT[i].name, p: x.players, I: x.interrupt, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH YUGO: driveInterrupt inyecta roster sintético ({interrupt,dead}) ⇒ I REAL server-auth = # jugadores VIVOS con el flag `interrupt` (filtra muertos + no-interrupters).
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

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#146 CONJURO (LANDED-CONTROL-EFFECT ⊥ ANY-CAST) — LUT: los conteos I (control landeado) y U (cualquier cast) se mueven INDEPENDIENTEMENTE.
  const cruxCast = await page.evaluate(() => {
    const itr = (interrupters, P) => window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe;
    const cst = (casters, P) => window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe;
    // poise-break: 3 landeando un stagger (I3) pero NINGUNO casteando (U0)
    const brk = { itr: itr(3, 3), cst: cst(0, 3) };
    // salva de cast: 3 casteando (U3) pero NINGUNO landeando control (I0) — conteos independientes
    const cast = { itr: itr(0, 3), cst: cst(3, 3) };
    return { brk, cast };
  });
  const cc = cruxCast;
  const cruxCastOK =
    cc.brk.itr.interrupt === 3 && cc.brk.itr.weight === 2 && cc.brk.cst.cast === 0 && cc.brk.cst.weight === 0
    && cc.cast.itr.interrupt === 0 && cc.cast.itr.weight === 0 && cc.cast.cst.cast === 3 && cc.cast.cst.weight === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#146 CONJURO (LANDED-CONTROL-EFFECT ⊥ ANY-CAST): {3 poise-breakeando, 0 casteando} ⇒ YUGO I3/w2 pero CONJURO U0/w0; {0 interrumpiendo, 3 casteando} ⇒ YUGO I0/w0 pero CONJURO U3/w2 ⇒ control-landeado ⊥ activar-cualquier-habilidad (conteos divergen en AMBOS sentidos)",
     cruxCastOK, JSON.stringify(cruxCast));

  // 6b ★ CRUX ⊥#147 QUIEBRO (interrupt-EVENTO-OFENSIVO ⊥ dodge-STATE-DEFENSIVO): YUGO lee el flag OFENSIVO de control landeado; QUIEBRO lee el flag DEFENSIVO de esquiva/i-frame. OPUESTOS, conteos independientes.
  const cruxDodge = await page.evaluate(() => {
    const itr = (interrupters, P) => window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe;
    const ddg = (dodgers, P) => window.__dev.coDodge({ dodgeProbe: { dodgers, players: P } }).dodgeProbe;
    // 3 interrumpiendo/landeando control OFENSIVO (I3) pero 0 esquivando (D0)
    const A = { itr: itr(3, 3), ddg: ddg(0, 3) };
    // 3 esquivando/i-frame DEFENSIVO (D3) pero 0 landeando control (I0)
    const B = { itr: itr(0, 3), ddg: ddg(3, 3) };
    return { A, B };
  });
  const cd = cruxDodge;
  const cruxDodgeOK = cd.A.itr.interrupt === 3 && cd.A.itr.weight === 2 && cd.A.ddg && cd.A.ddg.weight === 0
    && cd.B.itr.interrupt === 0 && cd.B.itr.weight === 0 && cd.B.ddg && cd.B.ddg.weight === 2;
  ok("6b ★ CRUX ⊥#147 QUIEBRO (interrupt-EVENTO-OFENSIVO ⊥ dodge-STATE-DEFENSIVO): {3 interrumpiendo, 0 esquivando} ⇒ YUGO I3/w2 pero QUIEBRO D0/w0; {0 interrumpiendo, 3 esquivando} ⇒ YUGO I0/w0 pero QUIEBRO D3/w2 ⇒ lockear-al-enemigo ⊥ evitar-daño (OPUESTOS)",
     cruxDodgeOK, JSON.stringify(cruxDodge));

  // 6c ★ CRUX ⊥#143 ENVITE (evento-de-control ⊥ desplazamiento/push por velocidad-toward). Conteos independientes (si el stagger fuera knockback, YUGO lee el CONTROL, no la velocidad).
  const cruxAdv = await page.evaluate(() => {
    const itr = (interrupters, P) => window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe;
    const adv = (pushing, P) => window.__dev.coAdvance({ advanceProbe: { pushing, players: P } }).advanceProbe;
    // 3 landeando control SIN empujar (I3) pero 0 con velocidad-toward (A0)
    const A = { itr: itr(3, 3), adv: adv(0, 3) };
    // 3 empujando/velocidad-toward (A3) pero 0 landeando control (I0)
    const B = { itr: itr(0, 3), adv: adv(3, 3) };
    return { A, B };
  });
  const ca = cruxAdv;
  const cruxAdvOK = ca.A.itr.interrupt === 3 && ca.A.itr.weight === 2 && ca.A.adv && ca.A.adv.weight === 0
    && ca.B.itr.interrupt === 0 && ca.B.itr.weight === 0 && ca.B.adv && ca.B.adv.weight === 2;
  ok("6c ★ CRUX ⊥#143 ENVITE (evento-de-control ⊥ push/velocidad-toward): {3 interrumpiendo, 0 empujando} ⇒ YUGO I3/w2 pero ENVITE A0/w0; {0 interrumpiendo, 3 empujando} ⇒ YUGO I0/w0 pero ENVITE w2 ⇒ control-landeado ⊥ desplazamiento",
     cruxAdvOK, JSON.stringify(cruxAdv));

  // 6f ★ CRUX ⊥#147/#146/#143 CANAL DISTINTO: coInterruptFind ⊥ coDodgeFind/coCastFind/coAdvanceFind. Y ⊥ INTERRUPT_SURGE #89 (mob-side interruptFind).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const grab = (n) => (cfgSrc.match(new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([^\"]+)\"")) || [])[1];
  const coIntCh = grab("CO_INTERRUPT_SURGE"), coDodgeCh = grab("CO_DODGE_SURGE"), coCastCh = grab("CO_CAST_SURGE"), coAdvCh = grab("CO_ADVANCE_SURGE"), mobIntCh = grab("INTERRUPT_SURGE");
  const vmCh = await page.evaluate(() => window.__dev.coInterrupt().channel);
  const chOK = coIntCh === "coInterruptFind" && vmCh === "coInterruptFind" && coDodgeCh === "coDodgeFind" && coCastCh === "coCastFind" && coAdvCh === "coAdvanceFind" && mobIntCh === "interruptFind"
    && [coDodgeCh, coCastCh, coAdvCh, mobIntCh].every(c => c !== coIntCh);
  ok("6f ★ CRUX CANAL FRESCO coInterruptFind ⊥ coDodgeFind #147 / coCastFind #146 / coAdvanceFind #143 / interruptFind #89 (mob-side) (canal DISTINTO por construcción; VM idem)",
     chOK, `coInt=${coIntCh} vm=${vmCh} coDodge=${coDodgeCh} coCast=${coCastCh} coAdv=${coAdvCh} mobInt=${mobIntCh}`);

  // 7 ★ I-SENSITIVITY: más interrupts simultáneos ⇒ I sube.
  const iSens = await page.evaluate(() => {
    const t = (interrupters, P) => { const m = window.__dev.coInterrupt({ interruptProbe: { interrupters, players: P } }).interruptProbe; return { I: m.interrupt, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), quad: t(4, 4) };
  });
  const iSensOK = iSens.duo.I === 2 && iSens.trio.I === 3 && iSens.quad.I === 4 && iSens.duo.w === 1 && iSens.trio.w === 2 && iSens.quad.w === 2;
  ok("7 ★ I-SENSITIVITY (I sube con más interrupts): 2⇒I2/w1, 3⇒I3/w2, 4⇒I4/w2 (YUGO mide CUÁNTOS interrumpen simultáneamente)",
     iSensOK, JSON.stringify(iSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR (driveInterrupt REAL): 1 interrupter ⇒ 0; ≥2 ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    const drive = (rows) => { window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coInterrupt({ driveInterrupt: { players: rows.map(r => ({ interrupt: !!r[0], dead: !!r[1] })), wipe: true } }).driveInterrupt;
      const live = window.__dev.coInterrupt({ interruptProbeLive: true }).interruptProbeLive;
      return { idx: dv.idx, interrupt: dv.interrupt, score: dv.score, players: live.players }; };
    const sp = drive([[true, false]]);                                    // 1 interrupter: I=1 ⇒ 0 (colapso)
    const mp = drive([[true, false], [true, false], [true, false]]);      // 3 interrupters: I3 ⇒ score2 (bien-definido)
    window.__dev.coInterrupt({ clearInterrupt: true });
    window.__dev.coInterrupt({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.interrupt === 1 && degen.sp.score === 0 && degen.mp.interrupt === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 interrupter ⇒ I1/score0; 3 interrumpiendo ⇒ I3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE co-interrumpir en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos interruptProbe idénticos ⇒ I/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coInterrupt({ interruptProbe: { interrupters: 3, players: 4 } }).interruptProbe;
    const b = window.__dev.coInterrupt({ interruptProbe: { interrupters: 3, players: 4 } }).interruptProbe;
    return { a: { I: a.interrupt, w: a.weight }, b: { I: b.interrupt, w: b.weight } };
  });
  const detOK = det.a.I === det.b.I && det.a.w === det.b.w && det.a.I === 3;
  ok("9 ★ INTEGER-DETERMINISM: interruptProbe repetido ⇒ I/weight byte-idénticos (conteo ENTERO de banderas + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del conteo (determinismo): permutar el orden del roster ⇒ MISMO I (el conteo es CONMUTATIVO).
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    const g = (rows) => { window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coInterrupt({ driveInterrupt: { players: rows.map(r => ({ interrupt: !!r[0], dead: !!r[1] })), wipe: true } }).driveInterrupt.interrupt; };
    const a = g([[true, false], [false, false], [true, false]]);   // 2 interrumpiendo ⇒ I2
    const b = g([[false, false], [true, false], [true, false]]);   // MISMOS jugadores, orden permutado ⇒ MISMO I2
    window.__dev.coInterrupt({ clearInterrupt: true }); window.__dev.coInterrupt({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del conteo: MISMO roster (2 interrupters) en 2 órdenes distintos ⇒ MISMO I2 (el conteo es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 2 && orderInv.b === 2 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coInterruptFind: forageChargePreview con lockdown acreditado >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } });   // lockdown-pleno ⇒ score2
    const actVm = window.__dev.coInterrupt();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: false }], wipe: true } });   // solitario (I1) ⇒ score0
    const goVm = window.__dev.coInterrupt();
    window.__dev.coInterrupt({ clearInterrupt: true });
    window.__dev.coInterrupt({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coInterruptFind: forageChargePreview lockdown pleno (I≥3) ⇒ charge>0 (==coInterruptBonus); con solitario (I1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coInterruptBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 8; s++) vals.push(window.__dev.coInterrupt({ interruptProbe: { interrupters: s, players: s } }).interruptProbe.charge);  // I=s ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coInterrupt().cap };
  });
  ok("11 ★ SUB-CAP: ningún lockdown pleno produce charge>coInterruptBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full lockdown available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coInterrupt({ enabled: true });
    window.__dev.coInterrupt({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } });   // lockdown-pleno disponible
    window.__dev.coInterrupt({ enabled: false });                          // now OFF
    const off = window.__dev.coInterrupt();
    window.__dev.coInterrupt({ enabled: true }); window.__dev.coInterrupt({ clearInterrupt: true }); window.__dev.coInterrupt({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, interrupt: off.interrupt };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.interrupt === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coInterruptBonus(lockdown pleno disponible)==0 + forageChargePreview==0 + idx==0 + interrupt==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling peers no cambia la señal de coInterrupt.
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

  // 14 ★ 0-REGRESSION CENSUS: served config — 76 `_SURGE` totales, sole-false = CO_INTERRUPT (75 true, incl. CO_DODGE #147 LIVE).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coDodgeLive = census.find(([n]) => n === "CO_DODGE_SURGE");
  const censusOK = total === 76 && trues === 75 && falses.length === 1 && falses[0] === "CO_INTERRUPT_SURGE" && coDodgeLive && coDodgeLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: served config 76 `_SURGE` totales, 75 enabled:true (incl. CO_DODGE_SURGE #147 LIVE), sole-false = CO_INTERRUPT_SURGE (DARK #148)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coDodge=${coDodgeLive ? coDodgeLive[1] : "?"}`);

  // 15 render badge "Yugo:" drawn ON+lockdown / not OFF + fps. 🔑 label ÚNICO "Yugo:" (⊥ #147 'Quiebro:'/#146 'Conjuro:'/#145 'Tenaza:'/#144 'Diana:').
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

  // 16 ★ NORTH STAR — 2-client convergence (MANDATORY sev-1).
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
    const dv = window.__dev.coInterrupt({ driveInterrupt: { players: [{ interrupt: true }, { interrupt: true }, { interrupt: true }], wipe: true } }).driveInterrupt;   // I=3 ⇒ score2
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
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO lockdown I=3 ⇒ score/idx/interrupt/players/tier/charge + interruptProbeLive(field,interrupt,players,score) + interruptProbe LUT (I enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},interrupt:${A.interrupt},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveInt:${A.liveInt},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},interrupt:${B.interrupt},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveInt:${B.liveInt},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coInterrupt({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coInterrupt({ enabled: false }));

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
