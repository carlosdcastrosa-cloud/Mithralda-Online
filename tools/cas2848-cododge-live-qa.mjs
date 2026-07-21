// CAS-2848 — POST-FLIP LIVE QA for QUIEBRO (CO_DODGE_SURGE.enabled:TRUE LIVE, EVO#147, 89º flag). Base master 97ca62e (4fbdbe6/e42f600 DARK → 2e60116 flip false→true → 97ca62e version stamp 90e5b2600ac2/815), served LIVE carlosdcastrosa-cloud.github.io/Mithralda-Online.
// Derivado del DARK self-verify cas2844 con: ck2 INVERTIDO LIVE-ON (enabled TRUE, solo boot ⇒ D≤1 ⇒ score/tier/charge colapsan LIMPIO), ck14 CENSUS INVERTIDO (75/75 enabled:true off=[]), + ck18 SERVED-LIVE-BUILD (root200 + version.json 90e5b2600ac2/815 + served config CO_DODGE_SURGE enabled:true + census 75/75). Gameplay/determinismo corre contra checkout local NO-DRIFT (HEAD==origin==97ca62e, byte-idéntico a lo servido); ck18 verifica los BYTES SERVIDOS. ck16 North Star asserta charge>0 (co-dodge bounty grants en el build ON).
// (A) EJE = QUIEBRO/CO-DODGE = D = nº de jugadores VIVOS DISTINTOS con un flag de esquiva/rodada/i-frame (`dodge`) ACTIVO este frame (co-dodge/evade-sync). Tally BOOLEANO ENTERO (CERO float; conteo CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midDodge2,hiDodge3}. D≥3 ⇒ sync-pleno ⇒ 2; D≥2 ⇒ sync-parcial ⇒ 1; <2 ⇒ 0. ⊥ #146 CONJURO (DODGE-STATE ⊥ ANY-CAST), ⊥ #141 REPLIEGUE (evento-dodge ⊥ velocidad-away), ⊥ #140 MURALLA (esquivar/i-frame EVITA ⊥ tank ABSORBE), ⊥ #138 CUADRILLA (esquivar ⊥ rematar). 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 dodger ⇒ D colapsa ⇒ 0.
// (B) CANAL = coDodgeFind (fichas de quiebro por rematar con la sincronía ACREDITADA). Moneda FRESCA (h.coDodgeBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2848-cododge-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2848");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// dodgeProbe LUT esperada: (dodgers=nº de jugadores en esquiva, players=P gate)→D=clamp(dodgers,0,players)→banda(D vs {midDodge2,hiDodge3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiDodge 3 / midDodge 2 + colapso single-player (D<minPlayers2 ⇒ 0).
const EXPECT_DODGE = [
  { name: "solo-P1",       dodgers: 1, players: 1, D: 1, w: 0 },
  { name: "duo-P2",        dodgers: 2, players: 2, D: 2, w: 1 },
  { name: "duo-of-4",      dodgers: 2, players: 4, D: 2, w: 1 },
  { name: "trio-P3",       dodgers: 3, players: 3, D: 3, w: 2 },
  { name: "quad-4",        dodgers: 4, players: 4, D: 4, w: 2 },
  { name: "none",          dodgers: 0, players: 3, D: 0, w: 0 },
  { name: "one-of-4",      dodgers: 1, players: 4, D: 1, w: 0 },
  { name: "clamp-players", dodgers: 9, players: 3, D: 3, w: 2 },
];
// driveDodge REAL: roster sintético (P jugadores con {dodge,dead}) ⇒ D server-auth = # jugadores VIVOS con el flag `dodge`. filas: [dodge, dead].
const EXPECT_DRIVE = [
  { name: "duo-dodge",          players: [[true, false], [true, false]],                         D: 2, w: 1 },
  { name: "one-dodge",          players: [[true, false], [false, false]],                        D: 1, w: 0 },
  { name: "solo",               players: [[true, false]],                                        D: 1, w: 0 },
  { name: "trio-dodge",         players: [[true, false], [true, false], [true, false]],          D: 3, w: 2 },
  { name: "nondodge-excluded",  players: [[true, false], [true, false], [false, false]],         D: 2, w: 1 },
  { name: "dead-excluded",      players: [[true, false], [true, false], [true, true]],           D: 2, w: 1 },
  { name: "quad-dodge",         players: [[true, false], [true, false], [true, false], [true, false]], D: 4, w: 2 },
  { name: "all-still",          players: [[false, false], [false, false], [false, false]],       D: 0, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coDodge && window.__dev.coCast && window.__dev.coFlank && window.__dev.coFocus && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coDodge + peer hooks (coCast/coFlank/coFocus/coAdvance/coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_DODGE_SURGE.enabled TRUE; solo hero fresh boot, SIN party sintética ⇒ D≤1 < midDodge2 ⇒ SCORE/DECISIÓN colapsan LIMPIO. Multijugador-nativo: IMPOSIBLE co-esquivar en solitario. 🔑 NO asertamos gExists/partyExists false (con enabled:true PUEDEN materializarse) — aserta el COLAPSO DE DECISIÓN.
  const dark = await page.evaluate(() => window.__dev.coDodge());
  ok("2 LIVE-ON (fresh solo boot): CO_DODGE_SURGE.enabled TRUE AND sin sincronía (D≤1) ⇒ score/tier/charge/preview colapsan LIMPIO a 0 AND channel coDodgeFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.dodge <= 1 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coDodgeFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} dodge=${dark.dodge} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiDodge=${dark.hiDodge} midDodge=${dark.midDodge} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save has no coDodgeFind/coDodgeBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coDodgeFind|coDodgeBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coDodgeBounty"\s*:/.test(saveOff);
  ok("3 byte-id save: sin clave 'coDodgeFind'/'coDodgeBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coDodge({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coDodge({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ dodgeProbe LUT
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coDodge({ dodgeProbe: { dodgers: c.dodgers, players: c.players } }).dodgeProbe), EXPECT_DODGE);
  const tabOK = EXPECT_DODGE.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].dodge === c.D);
  ok("5 ★ dodgeProbe LUT (QUIEBRO D=# dodgers distintos): solo-P1(D1)⇒0, duo(D2)⇒1, duo-of-4(D2)⇒1, trio(D3)⇒2, quad(D4)⇒2, none(D0)⇒0, one-of-4(D1)⇒0, clamp-players⇒D3. UMBRAL hiDodge 3/midDodge 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_DODGE[i].name, p: x.players, D: x.dodge, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH QUIEBRO
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dodge: !!r[0], dead: !!r[1] }));
    window.__dev.coDodge({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coDodge({ driveDodge: { players: mkParty(c.players), wipe: true } }).driveDodge;
      const live = window.__dev.coDodge({ dodgeProbeLive: true }).dodgeProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvDodge: dv.dodge, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveDodge: live.dodge, livePlayers: live.players });
    }
    window.__dev.coDodge({ clearDodge: true });
    window.__dev.coDodge({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvDodge === c.D && comp[i].liveDodge === c.D);
  ok("5c ★ REAL SERVER-AUTH QUIEBRO (tally de banderas dodge entre VIVOS): duo-dodge(D2)=w1, one-dodge(D1)=w0, solo(D1)=w0, trio-dodge(D3)=w2, nondodge-excl(D2)=w1, dead-excl(D2)=w1, quad-dodge(D4)=w2, all-still(D0)=w0 (filtra muertos + no-dodgers)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#146 CONJURO (DODGE-STATE ⊥ ANY-CAST)
  const cruxCast = await page.evaluate(() => {
    const ddg = (dodgers, P) => window.__dev.coDodge({ dodgeProbe: { dodgers, players: P } }).dodgeProbe;
    const cst = (casters, P) => window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe;
    const roll = { ddg: ddg(3, 3), cst: cst(0, 3) };
    const cast = { ddg: ddg(0, 3), cst: cst(3, 3) };
    return { roll, cast };
  });
  const cc = cruxCast;
  const cruxCastOK =
    cc.roll.ddg.dodge === 3 && cc.roll.ddg.weight === 2 && cc.roll.cst.cast === 0 && cc.roll.cst.weight === 0
    && cc.cast.ddg.dodge === 0 && cc.cast.ddg.weight === 0 && cc.cast.cst.cast === 3 && cc.cast.cst.weight === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#146 CONJURO (DODGE-STATE ⊥ ANY-CAST): {3 rodando un AoE, 0 casteando} ⇒ QUIEBRO D3/w2 pero CONJURO U0/w0; {0 rodando, 3 casteando} ⇒ QUIEBRO D0/w0 pero CONJURO U3/w2 ⇒ estado-de-esquiva ⊥ activar-cualquier-habilidad (conteos divergen en AMBOS sentidos)",
     cruxCastOK, JSON.stringify(cruxCast));

  // 6b ★ CRUX ⊥#141 REPLIEGUE (evento-discreto-dodge ⊥ velocidad-away)
  const cruxFlee = await page.evaluate(() => {
    const ddg = (dodgers, P) => window.__dev.coDodge({ dodgeProbe: { dodgers, players: P } }).dodgeProbe;
    const flee = (breaking, P) => window.__dev.coFlee({ fleeProbe: { breaking, players: P } }).fleeProbe;
    const A = { ddg: ddg(3, 3), flee: flee(0, 3) };
    const B = { ddg: ddg(0, 3), flee: flee(3, 3) };
    return { A, B };
  });
  const cf = cruxFlee;
  const cruxFleeOK = cf.A.ddg.dodge === 3 && cf.A.ddg.weight === 2 && cf.A.flee && cf.A.flee.weight === 0
    && cf.B.ddg.dodge === 0 && cf.B.ddg.weight === 0 && cf.B.flee && cf.B.flee.weight === 2;
  ok("6b ★ CRUX ⊥#141 REPLIEGUE (evento-dodge ⊥ velocidad-away): {3 esquivando-en-el-sitio, 0 velocidad-away} ⇒ QUIEBRO D3/w2 pero REPLIEGUE F0/w0; {0 dodge, 3 back-pedal} ⇒ QUIEBRO D0/w0 pero REPLIEGUE w2 ⇒ i-frame-discreto ⊥ velocidad-alejándose",
     cruxFleeOK, JSON.stringify(cruxFlee));

  // 6c ★ CRUX ⊥#140 MURALLA (esquivar/i-frame EVITA ⊥ tank ABSORBE — OPUESTO)
  const cruxTank = await page.evaluate(() => {
    const ddg = (dodgers, P) => window.__dev.coDodge({ dodgeProbe: { dodgers, players: P } }).dodgeProbe;
    const tank = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const A = { ddg: ddg(3, 3), tank: tank(0, 3) };
    const B = { ddg: ddg(0, 3), tank: tank(3, 3) };
    return { A, B };
  });
  const ctk = cruxTank;
  const cruxTankOK = ctk.A.ddg.dodge === 3 && ctk.A.ddg.weight === 2 && ctk.A.tank && ctk.A.tank.weight === 0
    && ctk.B.ddg.dodge === 0 && ctk.B.ddg.weight === 0 && ctk.B.tank && ctk.B.tank.weight === 2;
  ok("6c ★ CRUX ⊥#140 MURALLA (esquivar/i-frame EVITA ⊥ tank ABSORBE — OPUESTO): {3 esquivando, 0 absorbiendo} ⇒ QUIEBRO D3/w2 pero MURALLA T0/w0; {0 dodge, 3 tankeando} ⇒ QUIEBRO D0/w0 pero MURALLA w2 ⇒ evitar-daño ⊥ absorber-daño",
     cruxTankOK, JSON.stringify(cruxTank));

  // 6f ★ CRUX CANAL DISTINTO: coDodgeFind ⊥ coCastFind/coFleeFind/coTankFind/coFlankFind.
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const grab = (n) => (cfgSrc.match(new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([^\"]+)\"")) || [])[1];
  const coDodgeCh = grab("CO_DODGE_SURGE"), coCastCh = grab("CO_CAST_SURGE"), coFleeCh = grab("CO_FLEE_SURGE"), coTankCh = grab("CO_TANK_SURGE"), coFlankCh = grab("CO_FLANK_SURGE");
  const vmCh = await page.evaluate(() => window.__dev.coDodge().channel);
  const chOK = coDodgeCh === "coDodgeFind" && vmCh === "coDodgeFind" && coCastCh === "coCastFind" && coFleeCh === "coFleeFind" && coTankCh === "coTankFind" && coFlankCh === "coFlankFind"
    && [coCastCh, coFleeCh, coTankCh, coFlankCh].every(c => c !== coDodgeCh);
  ok("6f ★ CRUX CANAL FRESCO coDodgeFind ⊥ coCastFind #146 / coFleeFind #141 / coTankFind #140 / coFlankFind #145 (canal DISTINTO por construcción; VM idem)",
     chOK, `coDodge=${coDodgeCh} vm=${vmCh} coCast=${coCastCh} coFlee=${coFleeCh} coTank=${coTankCh} coFlank=${coFlankCh}`);

  // 7 ★ D-SENSITIVITY
  const dSens = await page.evaluate(() => {
    const t = (dodgers, P) => { const m = window.__dev.coDodge({ dodgeProbe: { dodgers, players: P } }).dodgeProbe; return { D: m.dodge, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), quad: t(4, 4) };
  });
  const dSensOK = dSens.duo.D === 2 && dSens.trio.D === 3 && dSens.quad.D === 4 && dSens.duo.w === 1 && dSens.trio.w === 2 && dSens.quad.w === 2;
  ok("7 ★ D-SENSITIVITY (D sube con más esquivas): 2⇒D2/w1, 3⇒D3/w2, 4⇒D4/w2 (QUIEBRO mide CUÁNTOS esquivan simultáneamente)",
     dSensOK, JSON.stringify(dSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coDodge({ enabled: true });
    const drive = (rows) => { window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coDodge({ driveDodge: { players: rows.map(r => ({ dodge: !!r[0], dead: !!r[1] })), wipe: true } }).driveDodge;
      const live = window.__dev.coDodge({ dodgeProbeLive: true }).dodgeProbeLive;
      return { idx: dv.idx, dodge: dv.dodge, score: dv.score, players: live.players }; };
    const sp = drive([[true, false]]);
    const mp = drive([[true, false], [true, false], [true, false]]);
    window.__dev.coDodge({ clearDodge: true });
    window.__dev.coDodge({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.dodge === 1 && degen.sp.score === 0 && degen.mp.dodge === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 dodger ⇒ D1/score0; 3 esquivando ⇒ D3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE co-esquivar en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM
  const det = await page.evaluate(() => {
    const a = window.__dev.coDodge({ dodgeProbe: { dodgers: 3, players: 4 } }).dodgeProbe;
    const b = window.__dev.coDodge({ dodgeProbe: { dodgers: 3, players: 4 } }).dodgeProbe;
    return { a: { D: a.dodge, w: a.weight }, b: { D: b.dodge, w: b.weight } };
  });
  const detOK = det.a.D === det.b.D && det.a.w === det.b.w && det.a.D === 3;
  ok("9 ★ INTEGER-DETERMINISM: dodgeProbe repetido ⇒ D/weight byte-idénticos (conteo ENTERO de banderas + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del conteo
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coDodge({ enabled: true });
    const g = (rows) => { window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coDodge({ driveDodge: { players: rows.map(r => ({ dodge: !!r[0], dead: !!r[1] })), wipe: true } }).driveDodge.dodge; };
    const a = g([[true, false], [false, false], [true, false]]);
    const b = g([[false, false], [true, false], [true, false]]);
    window.__dev.coDodge({ clearDodge: true }); window.__dev.coDodge({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del conteo: MISMO roster (2 dodgers) en 2 órdenes distintos ⇒ MISMO D2 (el conteo es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 2 && orderInv.b === 2 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coDodgeFind
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coDodge({ enabled: true });
    window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coDodge({ driveDodge: { players: [{ dodge: true }, { dodge: true }, { dodge: true }], wipe: true } });
    const actVm = window.__dev.coDodge();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coDodge({ driveDodge: { players: [{ dodge: true }, { dodge: false }], wipe: true } });
    const goVm = window.__dev.coDodge();
    window.__dev.coDodge({ clearDodge: true });
    window.__dev.coDodge({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coDodgeFind: forageChargePreview sync pleno (D≥3) ⇒ charge>0 (==coDodgeBonus); con solitario (D1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 8; s++) vals.push(window.__dev.coDodge({ dodgeProbe: { dodgers: s, players: s } }).dodgeProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.coDodge().cap };
  });
  ok("11 ★ SUB-CAP: ningún sync pleno produce charge>coDodgeBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF (aún con enabled TRUE en config, el dev-toggle OFF colapsa a byte-id)
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coDodge({ enabled: true });
    window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coDodge({ driveDodge: { players: [{ dodge: true }, { dodge: true }, { dodge: true }], wipe: true } });
    window.__dev.coDodge({ enabled: false });
    const off = window.__dev.coDodge();
    window.__dev.coDodge({ enabled: true }); window.__dev.coDodge({ clearDodge: true }); window.__dev.coDodge({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, dodge: off.dodge };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.dodge === 0;
  ok("12 ★ BYTE-NEUTRAL OFF (dev-toggle): con OFF, coDodgeBonus(sync pleno disponible)==0 + forageChargePreview==0 + idx==0 + dodge==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coDodge({ enabled: true });
    window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coDodge({ driveDodge: { players: [{ dodge: true }, { dodge: true }, { dodge: true }], wipe: true } }).driveDodge;
    const snap = () => JSON.stringify({ coCast: window.__dev.coCast(), coFlank: window.__dev.coFlank(), coFocus: window.__dev.coFocus(), coAdvance: window.__dev.coAdvance(), coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const prev = { cc: window.__dev.coCast().enabled, fl: window.__dev.coFlank().enabled, fo: window.__dev.coFocus().enabled, ca: window.__dev.coAdvance().enabled, co: window.__dev.coCohesion().enabled, ct: window.__dev.coTank().enabled, cs: window.__dev.coSupport().enabled, ck: window.__dev.coKill().enabled, cp: window.__dev.coPresence().enabled, cf: window.__dev.coFlee().enabled, pv: window.__dev.partyVital().enabled };
    window.__dev.coCast({ enabled: !prev.cc }); window.__dev.coFlank({ enabled: !prev.fl }); window.__dev.coFocus({ enabled: !prev.fo }); window.__dev.coAdvance({ enabled: !prev.ca }); window.__dev.coCohesion({ enabled: !prev.co }); window.__dev.coTank({ enabled: !prev.ct }); window.__dev.coSupport({ enabled: !prev.cs }); window.__dev.coKill({ enabled: !prev.ck }); window.__dev.coPresence({ enabled: !prev.cp }); window.__dev.coFlee({ enabled: !prev.cf }); window.__dev.partyVital({ enabled: !prev.pv });
    const after = window.__dev.coDodge({ dodgeProbeLive: true }).dodgeProbeLive;
    window.__dev.coCast({ enabled: prev.cc }); window.__dev.coFlank({ enabled: prev.fl }); window.__dev.coFocus({ enabled: prev.fo }); window.__dev.coAdvance({ enabled: prev.ca }); window.__dev.coCohesion({ enabled: prev.co }); window.__dev.coTank({ enabled: prev.ct }); window.__dev.coSupport({ enabled: prev.cs }); window.__dev.coKill({ enabled: prev.ck }); window.__dev.coPresence({ enabled: prev.cp }); window.__dev.coFlee({ enabled: prev.cf }); window.__dev.partyVital({ enabled: prev.pv });
    const peersRestored = snap();
    window.__dev.coDodge({ clearDodge: true });
    window.__dev.coDodge({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.dodge === after.dodge;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeDodge: before.dodge, afterDodge: after.dodge };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coDodgeFind ⊥ peers: la señal de co-dodge (score/dodge) NO cambia al togglear CO-CAST #146/CO-FLANK #145/CO-FOCUS #144/CO-ADVANCE #143/CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS (INVERTED LIVE-ON): served config — 75 `_SURGE` totales, 75 enabled:true, off=[] (CO_DODGE #147 LIVE + CO_CAST #146 LIVE + los 73 priores).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coDodgeLive = census.find(([n]) => n === "CO_DODGE_SURGE");
  const coCastLive = census.find(([n]) => n === "CO_CAST_SURGE");
  const censusOK = total === 75 && trues === 75 && falses.length === 0 && coDodgeLive && coDodgeLive[1] === "true" && coCastLive && coCastLive[1] === "true";
  ok("14 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 75 `_SURGE` totales, 75 enabled:true, off=[] (CO_DODGE_SURGE #147 LIVE + CO_CAST_SURGE #146 LIVE + los 73 priores)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coDodge=${coDodgeLive ? coDodgeLive[1] : "?"} coCast=${coCastLive ? coCastLive[1] : "?"}`);

  // 15 render badge "Quiebro:" drawn ON+evade / not OFF + fps
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coDodge({ driveDodge: { players: [{ dodge: true }, { dodge: true }, { dodge: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Quiebro:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coDodge({ enabled: true });
    window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coDodge({ clearDodge: true });
    window.__dev.coDodge({ enabled: false });
    const enAtOff = window.__dev.coDodge().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Quiebro:\" se DIBUJA ON+evade (D>0, re-driven cada frame) y NO OFF (D 0) + fps sano (label ÚNICO ⊥ #146 'Conjuro:'/#145 'Tenaza:'/#144 'Diana:'/#139 'Socorro:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coDodge({ enabled: true }); window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coDodge({ driveDodge: { players: [{ dodge: true }, { dodge: true }, { dodge: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coDodge({ clearDodge: true }); window.__dev.coDodge({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence (MANDATORY sev-1). LIVE-ON: D=3 ⇒ score2/dodge3/players3/tier2/charge>0 (co-dodge bounty grants).
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
    window.__dev.coDodge({ enabled: true });
    window.__dev.coDodge({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coDodge({ driveDodge: { players: [{ dodge: true }, { dodge: true }, { dodge: true }], wipe: true } }).driveDodge;
    const vm = window.__dev.coDodge();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([dodgers, P]) => { const m = window.__dev.coDodge({ dodgeProbe: { dodgers, players: P } }).dodgeProbe; return { p: m.players, D: m.dodge, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coDodge({ dodgeProbeLive: true }).dodgeProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coDodge({ clearDodge: true });
    window.__dev.coDodge({ enabled: false });
    return { score: dv.score, idx: dv.idx, dodge: dv.dodge, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveDodge: live.dodge, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.dodge === B.dodge && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveDodge === B.liveDodge && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  const onPathOK = A.score === 2 && A.dodge === 3 && A.players === 3 && A.tier === 2 && A.charge > 0;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): LIVE-ON evade D=3 ⇒ score2/dodge3/players3/tier2/charge>0 (QUIEBRO activo, co-dodge bounty grants) AND score/idx/dodge/players/tier/charge + dodgeProbeLive(field,dodge,players,score) + dodgeProbe LUT (D enteros) + worldFingerprint IDÉNTICOS byte-a-byte A==B (0 desync)",
     conv && onPathOK, `A={score:${A.score},idx:${A.idx},dodge:${A.dodge},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveDodge:${A.liveDodge},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},dodge:${B.dodge},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveDodge:${B.liveDodge},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp} onPathOK=${onPathOK}`);
  await page.evaluate(() => window.__dev.coDodge({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coDodge({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == 90e5b2600ac2/815 (NEW ≠ old b8c147402d1f) + served sim/config.js CO_DODGE_SURGE enabled:true + census 75/75 off=[].
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
    const lCoDodge = lcensus.find(([n]) => n === "CO_DODGE_SURGE");
    const lCoCast = lcensus.find(([n]) => n === "CO_CAST_SURGE");
    const servedOK = rootRes.status === 200 && ver.build === "90e5b2600ac2" && ver.files === 815 && lTotal === 75 && lTrues === 75 && lFalses.length === 0 && lCoDodge && lCoDodge[1] === "true" && lCoCast && lCoCast[1] === "true";
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 90e5b2600ac2/815 (NEW ≠ old b8c147402d1f) + served sim/config.js CO_DODGE_SURGE enabled:true + census 75/75 off=[]",
       servedOK, `rootStatus=${rootRes.status} build=${ver.build} files=${ver.files} census total=${lTotal} true=${lTrues} false=${JSON.stringify(lFalses)} coDodge=${lCoDodge ? lCoDodge[1] : "?"} coCast=${lCoCast ? lCoCast[1] : "?"}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 90e5b2600ac2/815 + config CO_DODGE_SURGE enabled:true", false, `FETCH ERROR ${String(e)}`);
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
