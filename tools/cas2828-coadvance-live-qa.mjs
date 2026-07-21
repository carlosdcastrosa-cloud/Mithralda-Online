// CAS-2828 — POST-FLIP LIVE QA for ENVITE (CO_ADVANCE_SURGE.enabled:TRUE LIVE, EVO#143, 85º flag). Base master 2ec1cf8 (e3ca516 DARK → 6042fe3 flip false→true → 2ec1cf8 version stamp 10f8be94fd1f/815), served LIVE carlosdcastrosa-cloud.github.io/Mithralda-Online.
// Derivado del DARK self-verify cas2824 con: ck2 INVERTIDO LIVE-ON (enabled TRUE, solo boot ⇒ A≤1 ⇒ score/tier/charge colapsan LIMPIO), ck14 CENSUS INVERTIDO (71/71 enabled:true off=[]), + ck18 SERVED-LIVE-BUILD (root200 + version.json 10f8be94fd1f/815 + served config CO_ADVANCE_SURGE enabled:true + census 71/71). Gameplay/determinismo corre contra checkout local NO-DRIFT (HEAD==origin==2ec1cf8, byte-idéntico a lo servido); ck18 verifica los BYTES SERVIDOS.
// (A) EJE = ENVITE/CO-ADVANCE = A = nº de JUGADORES DISTINTOS VIVOS dentro del radio compartido (300px) cuyo VECTOR DE VELOCIDAD apunta HACIA la amenaza compartida (dot `(amenaza−pos)·vel>0`) = quién EMPUJA/avanza-a-comprometer, ⊥ #141 REPLIEGUE (velocidad-away, INVERSO exacto) y ⊥ #142 PIÑA (spatial-cohesion STATE) y ⊥ #140/#139/#138/#137/#136 y ⊥ #132 PARTY_VITAL (HP-STATE). CONTEO CRUDO de pushers, NO fracción (#123 cov/P), NO ángulo float. 🔑 DETERMINISMO (sev-1): A=cuenta ENTERA de avanzando-hacia (test de signo del dot `(tx−dx)*vx+(ty−dy)*vy>0` ENTERO, CERO division/normalización/ángulo float) vs umbrales ENTEROS {midAdvance2,hiAdvance3} ⇒ 0-float. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ SIN party sintética Y SIN amenaza ⇒ A colapsa ⇒ 0.
// (B) CANAL = coAdvanceFind (fichas de envite por rematar con el co-advance ACREDITADO). Moneda FRESCA (h.coAdvanceBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2828-coadvance-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2828");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
const THREAT = { tx: 200, ty: 0 };   // amenaza compartida al ESTE (offset relativo al héroe); avanzar-hacia ⇒ vx>0
// advanceProbe LUT esperada: (pushing=nº avanzando-hacia en radio, players=P gate)→A=clamp(pushing,0,P)→banda(A vs {midAdvance2,hiAdvance3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiAdvance 3 / midAdvance 2 + colapso single-player (A<minPlayers2 ⇒ 0).
const EXPECT_ADV = [
  { name: "solo-P1",            pushing: 1, players: 1, A: 1, w: 0 },
  { name: "duo-P2",             pushing: 2, players: 2, A: 2, w: 1 },
  { name: "duo-of-4",           pushing: 2, players: 4, A: 2, w: 1 },
  { name: "trio-P3",            pushing: 3, players: 3, A: 3, w: 2 },
  { name: "trio-of-4",          pushing: 3, players: 4, A: 3, w: 2 },
  { name: "full-P4",            pushing: 4, players: 4, A: 4, w: 2 },
  { name: "none-P3",            pushing: 0, players: 3, A: 0, w: 0 },
  { name: "one-pushing-P3",     pushing: 1, players: 3, A: 1, w: 0 },
  { name: "clamp-overflow",     pushing: 9, players: 3, A: 3, w: 2 },
];
// driveAdvance REAL: inyecta amenaza compartida + roster sintético (P jugadores con offset {dx,dy}+velocidad {vx,vy}, opcional dead) ⇒ A server-auth = # jugadores VIVOS DENTRO del radio (300px) con velocidad-HACIA la amenaza.
// filas: [dx, dy, vx, vy, dead]  — amenaza en THREAT (200,0)
const EXPECT_DRIVE = [
  { name: "trio-toward",        players: [[50, 0, 5, 0, false], [0, 40, 4, 2, false], [40, -40, 6, 3, false]],  A: 3, w: 2 },
  { name: "solo-toward",        players: [[50, 0, 5, 0, false]],                                                A: 1, w: 0 },
  { name: "duo-toward",         players: [[50, 0, 5, 0, false], [0, 40, 4, 2, false]],                          A: 2, w: 1 },
  { name: "retreat-excluded",   players: [[50, 0, 5, 0, false], [0, 40, 4, 2, false], [50, 0, -5, 0, false]],   A: 2, w: 1 },
  { name: "stationary-excluded",players: [[50, 0, 5, 0, false], [0, 40, 4, 2, false], [50, 0, 0, 0, false]],    A: 2, w: 1 },
  { name: "perp-excluded",      players: [[50, 0, 5, 0, false], [0, 40, 4, 2, false], [50, 0, 0, 7, false]],    A: 2, w: 1 },
  { name: "dead-excluded",      players: [[50, 0, 5, 0, false], [0, 40, 4, 2, false], [40, -40, 6, 3, true]],   A: 2, w: 1 },
  { name: "far-excluded",       players: [[50, 0, 5, 0, false], [0, 40, 4, 2, false], [400, 0, 5, 0, false]],  A: 2, w: 1 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coAdvance + peer hooks (coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_ADVANCE_SURGE.enabled TRUE; solo hero fresh boot, SIN party sintética Y SIN amenaza ⇒ A≤1 < midAdvance2 ⇒ SCORE/DECISIÓN colapsan LIMPIO (tier/score/charge/preview=0). Multijugador-nativo: IMPOSIBLE co-empujar en solitario. channel fresco coAdvanceFind + tag vacío. 🔑 NO asertamos gExists/partyExists/threatExists (con enabled:true las estructuras transitorias PUEDEN materializarse) — aserta el COLAPSO DE DECISIÓN.
  const dark = await page.evaluate(() => window.__dev.coAdvance());
  ok("2 LIVE-ON (fresh solo boot): CO_ADVANCE_SURGE.enabled TRUE AND sin empuje (A≤1) ⇒ score/tier/charge/preview colapsan LIMPIO a 0 AND channel coAdvanceFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.advance <= 1 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coAdvanceFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} threatExists=${dark.threatExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} advance=${dark.advance} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiAdvance=${dark.hiAdvance} midAdvance=${dark.midAdvance} minPlayers=${dark.minPlayers} radius=${dark.radius} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coAdvanceFind/coAdvanceBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coAdvanceFind|coAdvanceBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coAdvanceBounty"\s*:/.test(saveOff);
  ok("3 byte-id save: sin clave 'coAdvanceFind'/'coAdvanceBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coAdvance({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coAdvance({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ advanceProbe LUT
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coAdvance({ advanceProbe: { pushing: c.pushing, players: c.players } }).advanceProbe), EXPECT_ADV);
  const tabOK = EXPECT_ADV.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].advance === c.A);
  ok("5 ★ advanceProbe LUT (ENVITE A=#pushers avanzando-hacia): solo-P1(A1)⇒0, duo(A2)⇒1, duo-of-4(A2)⇒1, trio(A3)⇒2, trio-of-4(A3)⇒2, full(A4)⇒2, none-P3(A0)⇒0, one-pushing-P3(A1)⇒0, clamp-overflow⇒A3. UMBRAL hiAdvance 3/midAdvance 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_ADV[i].name, p: x.players, A: x.advance, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH ENVITE
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, THREAT } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], vx: r[2], vy: r[3], dead: !!r[4] }));
    window.__dev.coAdvance({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: mkParty(c.players), wipe: true } }).driveAdvance;
      const live = window.__dev.coAdvance({ advanceProbeLive: true }).advanceProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvAdvance: dv.advance, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveAdvance: live.advance, livePlayers: live.players });
    }
    window.__dev.coAdvance({ clearAdvance: true });
    window.__dev.coAdvance({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, THREAT });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvAdvance === c.A && comp[i].liveAdvance === c.A);
  ok("5c ★ REAL SERVER-AUTH ENVITE (dot-product toward-test, radio 300px): trio-toward(A3)=w2, solo(A1)=w0, duo(A2)=w1, retreat-excluded(vx<0⇒A2)=w1, stationary-excluded(v0⇒A2)=w1, perp-excluded(dot0⇒A2)=w1, dead-excluded(A2)=w1, far-excluded(400px⇒A2)=w1 (filtra away/quietos/perp + muertos + fuera-de-radio)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#141 REPLIEGUE (INVERSO exacto: velocidad-HACIA ⊥ velocidad-away) — REAL server-auth.
  const cruxFlee = await page.evaluate((args) => {
    const { Z, THREAT } = args;
    const POS = [[50, 0], [0, 40], [40, -40]];
    window.__dev.coAdvance({ enabled: true }); window.__dev.coFlee({ enabled: true });
    window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coFlee({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: POS.map(p => ({ dx: p[0], dy: p[1], vx: 6, vy: 0 })), wipe: true } });
    window.__dev.coFlee({ driveFlee: { players: POS.map(p => ({ dx: p[0], dy: p[1], flee: false })), wipe: true } });
    const adv = { a: window.__dev.coAdvance({ advanceProbeLive: true }).advanceProbeLive, f: window.__dev.coFlee({ fleeProbeLive: true }).fleeProbeLive };
    window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: POS.map(p => ({ dx: p[0], dy: p[1], vx: -6, vy: 0 })), wipe: true } });
    window.__dev.coFlee({ driveFlee: { players: POS.map(p => ({ dx: p[0], dy: p[1], flee: true })), wipe: true } });
    const ret = { a: window.__dev.coAdvance({ advanceProbeLive: true }).advanceProbeLive, f: window.__dev.coFlee({ fleeProbeLive: true }).fleeProbeLive };
    window.__dev.coAdvance({ clearAdvance: true }); window.__dev.coFlee({ clearFlee: true });
    window.__dev.coAdvance({ enabled: false }); window.__dev.coFlee({ enabled: false });
    return { adv, ret };
  }, { Z, THREAT });
  const cruxFleeOK =
    cruxFlee.adv.a.advance === 3 && cruxFlee.adv.a.score === 2 && cruxFlee.adv.f.flee === 0 && cruxFlee.adv.f.score === 0
    && cruxFlee.ret.a.advance === 0 && cruxFlee.ret.a.score === 0 && cruxFlee.ret.f.flee === 3 && cruxFlee.ret.f.score === 2;
  ok("6 ★ CRUX (LA CRÍTICA, PRIMARIO) ⊥#141 REPLIEGUE (INVERSO exacto, velocidad-HACIA ⊥ velocidad-away, REAL server-auth): MISMAS 3 posiciones con velocidad TOWARD ⇒ ENVITE A3/w2 pero REPLIEGUE D0/w0; con velocidad AWAY ⇒ ENVITE A0/w0 pero REPLIEGUE D3/w2 — HACIA ⊥ ALEJÁNDOSE, divergen en AMBOS sentidos",
     cruxFleeOK, JSON.stringify(cruxFlee));

  // 6b ★ CRUX ⊥#142 PIÑA (ACCIÓN-de-velocidad ⊥ ESTADO-de-tightness)
  const cruxCoh = await page.evaluate(() => {
    const adv = (pushing, P) => window.__dev.coAdvance({ advanceProbe: { pushing, players: P } }).advanceProbe;
    const coh = (clustered, P) => window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe;
    const A = { adv: adv(3, 3), coh: coh(0, 3) };
    const B = { adv: adv(0, 3), coh: coh(3, 3) };
    return { A, B };
  });
  const cruxCohOK =
    cruxCoh.A.adv.advance === 3 && cruxCoh.A.adv.weight === 2 && cruxCoh.A.coh.cohesion === 0 && cruxCoh.A.coh.weight === 0
    && cruxCoh.B.adv.advance === 0 && cruxCoh.B.adv.weight === 0 && cruxCoh.B.coh.cohesion === 3 && cruxCoh.B.coh.weight === 2;
  ok("6b ★ CRUX ⊥#142 PIÑA (ACCIÓN-de-velocidad ⊥ ESTADO-de-tightness): {3 avanzando/dispersos,0 apiñados} ⇒ ENVITE A3/w2 pero PIÑA C0/w0; {0 avanzando/quietos,3 apiñados} ⇒ ENVITE A0/w0 pero PIÑA C3/w2 ⇒ velocidad-toward ⊥ posición-tightness (pesos divergen en AMBOS sentidos)",
     cruxCohOK, JSON.stringify(cruxCoh));

  // 6c ★ CRUX ⊥#140 MURALLA
  const cruxTank = await page.evaluate(() => {
    const adv = (pushing, P) => window.__dev.coAdvance({ advanceProbe: { pushing, players: P } }).advanceProbe;
    const brunt = (taking, P) => window.__dev.coTank({ bruntProbe: { taking, players: P } }).bruntProbe;
    const A = { adv: adv(3, 3), brunt: brunt(0, 3) };
    const B = { adv: adv(0, 3), brunt: brunt(3, 3) };
    return { A, B };
  });
  const cruxTankOK =
    cruxTank.A.adv.advance === 3 && cruxTank.A.adv.weight === 2 && cruxTank.A.brunt.tank === 0 && cruxTank.A.brunt.weight === 0
    && cruxTank.B.adv.advance === 0 && cruxTank.B.adv.weight === 0 && cruxTank.B.brunt.tank === 3 && cruxTank.B.brunt.weight === 2;
  ok("6c ★ CRUX ⊥#140 MURALLA (AVANCE ⊥ ACCIÓN-de-absorber): {3 avanzando,0 absorbiendo} ⇒ ENVITE A3/w2 pero MURALLA T0/w0; {0 avanzando,3 absorbiendo} ⇒ ENVITE A0/w0 pero MURALLA T3/w2 ⇒ el movimiento-hacia ⊥ qué ACCIÓN ejecuta cada quién",
     cruxTankOK, JSON.stringify(cruxTank));

  // 6d ★ CRUX ⊥#132 PARTY_VITAL
  const cruxVital = await page.evaluate(() => {
    const adv = (pushing, P) => window.__dev.coAdvance({ advanceProbe: { pushing, players: P } }).advanceProbe;
    const vital = (fracs, mobs) => window.__dev.partyVital({ vitalProbe: { fracs, mobs, hpMax: 1000 } }).vitalProbe;
    const A = { adv: adv(0, 3), vital: vital([1, 1, 1], 3) };
    const B = { adv: adv(3, 3), vital: vital([0.2, 0.2, 0.2], 3) };
    return { A, B };
  });
  const cruxVitalOK =
    cruxVital.A.vital.weight === 2 && cruxVital.A.vital.vital >= 0.99 && cruxVital.A.adv.advance === 0 && cruxVital.A.adv.weight === 0
    && cruxVital.B.vital.weight === 0 && cruxVital.B.vital.vital <= 0.3 && cruxVital.B.adv.advance === 3 && cruxVital.B.adv.weight === 2;
  ok("6d ★ CRUX ⊥#132 PARTY_VITAL (AVANCE ⊥ ESTADO-de-HP): {party full-HP,0 avanzando} ⇒ TEMPLE W1.0/w2 pero ENVITE A0/w0; {party 20%HP,3 avanzando} ⇒ TEMPLE W0.2/w0 pero ENVITE A3/w2 ⇒ ESTADO-de-HP (float MEDIO) ⊥ movimiento-hacia (entero), diverge en AMBOS sentidos",
     cruxVitalOK, JSON.stringify(cruxVital));

  // 6e ★ CRUX ⊥#123 CONTEST
  const cruxContest = await page.evaluate(() => {
    const adv = (pushing, P) => window.__dev.coAdvance({ advanceProbe: { pushing, players: P } }).advanceProbe;
    const full = adv(2, 2);
    const half = adv(2, 4);
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.advance === 2 && cruxContest.half.advance === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6e ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO ENVITE A2/w1 (conteo CRUDO de pushers, INVARIANTE a la cobertura fraccional)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 7 ★ A-SENSITIVITY
  const aSens = await page.evaluate(() => {
    const t = (pushing, P) => { const m = window.__dev.coAdvance({ advanceProbe: { pushing, players: P } }).advanceProbe; return { A: m.advance, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const aSensOK = aSens.duo.A === 2 && aSens.trio.A === 3 && aSens.full.A === 4 && aSens.duo.w === 1 && aSens.trio.w === 2 && aSens.full.w === 2;
  ok("7 ★ A-SENSITIVITY (A sube con más pushers): 2⇒A2/w1, 3⇒A3/w2, 4⇒A4/w2 (ENVITE mide el tamaño CRUDO del empuje coordinado)",
     aSensOK, JSON.stringify(aSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR
  const degen = await page.evaluate((args) => {
    const { Z, THREAT } = args;
    window.__dev.coAdvance({ enabled: true });
    const drive = (rows) => { window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: rows.map(r => ({ dx: r[0], dy: r[1], vx: r[2], vy: r[3] })), wipe: true } }).driveAdvance;
      const live = window.__dev.coAdvance({ advanceProbeLive: true }).advanceProbeLive;
      return { idx: dv.idx, advance: dv.advance, score: dv.score, players: live.players }; };
    const sp = drive([[50, 0, 5, 0]]);
    const mp = drive([[50, 0, 5, 0], [0, 40, 4, 2], [40, -40, 6, 3]]);
    window.__dev.coAdvance({ clearAdvance: true });
    window.__dev.coAdvance({ enabled: false });
    return { sp, mp };
  }, { Z, THREAT });
  const degenOK = degen.sp.advance === 1 && degen.sp.score === 0 && degen.mp.advance === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 avanzando ⇒ A1/score0; 3 avanzando ⇒ A3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE co-empujar en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM
  const det = await page.evaluate(() => {
    const a = window.__dev.coAdvance({ advanceProbe: { pushing: 3, players: 4 } }).advanceProbe;
    const b = window.__dev.coAdvance({ advanceProbe: { pushing: 3, players: 4 } }).advanceProbe;
    return { a: { A: a.advance, w: a.weight }, b: { A: b.advance, w: b.weight } };
  });
  const detOK = det.a.A === det.b.A && det.a.w === det.b.w && det.a.A === 3;
  ok("9 ★ INTEGER-DETERMINISM: advanceProbe repetido ⇒ A/weight byte-idénticos (CONTEO ENTERO de pushers + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 10 CANAL coAdvanceFind
  const forage = await page.evaluate((args) => {
    const { Z, THREAT } = args;
    window.__dev.coAdvance({ enabled: true });
    window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: [{ dx: 50, dy: 0, vx: 5, vy: 0 }, { dx: 0, dy: 40, vx: 4, vy: 2 }, { dx: 40, dy: -40, vx: 6, vy: 3 }], wipe: true } });
    const actVm = window.__dev.coAdvance();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: [{ dx: 50, dy: 0, vx: 5, vy: 0 }], wipe: true } });
    const goVm = window.__dev.coAdvance();
    window.__dev.coAdvance({ clearAdvance: true });
    window.__dev.coAdvance({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, THREAT });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coAdvanceFind: forageChargePreview avance pleno (A≥3) ⇒ charge>0 (==coAdvanceBonus); con solitario (A1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 10; s++) vals.push(window.__dev.coAdvance({ advanceProbe: { pushing: s, players: s } }).advanceProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.coAdvance().cap };
  });
  ok("11 ★ SUB-CAP: ningún avance pleno produce charge>coAdvanceBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF
  const neutral = await page.evaluate((args) => {
    const { Z, THREAT } = args;
    window.__dev.coAdvance({ enabled: true });
    window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: [{ dx: 50, dy: 0, vx: 5, vy: 0 }, { dx: 0, dy: 40, vx: 4, vy: 2 }, { dx: 40, dy: -40, vx: 6, vy: 3 }], wipe: true } });
    window.__dev.coAdvance({ enabled: false });
    const off = window.__dev.coAdvance();
    window.__dev.coAdvance({ enabled: true }); window.__dev.coAdvance({ clearAdvance: true }); window.__dev.coAdvance({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, advance: off.advance };
  }, { Z, THREAT });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.advance === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coAdvanceBonus(avance pleno disponible)==0 + forageChargePreview==0 + idx==0 + advance==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY
  const orth = await page.evaluate((args) => {
    const { Z, THREAT } = args;
    window.__dev.coAdvance({ enabled: true });
    window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: [{ dx: 50, dy: 0, vx: 5, vy: 0 }, { dx: 0, dy: 40, vx: 4, vy: 2 }, { dx: 40, dy: -40, vx: 6, vy: 3 }], wipe: true } }).driveAdvance;
    const snap = () => JSON.stringify({ coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const ccPrev = window.__dev.coCohesion().enabled, ctPrev = window.__dev.coTank().enabled, csPrev = window.__dev.coSupport().enabled, ckPrev = window.__dev.coKill().enabled, cpPrev = window.__dev.coPresence().enabled, cfPrev = window.__dev.coFlee().enabled, pvPrev = window.__dev.partyVital().enabled;
    window.__dev.coCohesion({ enabled: !ccPrev }); window.__dev.coTank({ enabled: !ctPrev }); window.__dev.coSupport({ enabled: !csPrev }); window.__dev.coKill({ enabled: !ckPrev }); window.__dev.coPresence({ enabled: !cpPrev }); window.__dev.coFlee({ enabled: !cfPrev }); window.__dev.partyVital({ enabled: !pvPrev });
    const after = window.__dev.coAdvance({ advanceProbeLive: true }).advanceProbeLive;
    window.__dev.coCohesion({ enabled: ccPrev }); window.__dev.coTank({ enabled: ctPrev }); window.__dev.coSupport({ enabled: csPrev }); window.__dev.coKill({ enabled: ckPrev }); window.__dev.coPresence({ enabled: cpPrev }); window.__dev.coFlee({ enabled: cfPrev }); window.__dev.partyVital({ enabled: pvPrev });
    const peersRestored = snap();
    window.__dev.coAdvance({ clearAdvance: true });
    window.__dev.coAdvance({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.advance === after.advance;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeAdvance: before.advance, afterAdvance: after.advance };
  }, { Z, THREAT });
  ok("13 ★ ORTOGONALIDAD coAdvanceFind ⊥ peers: la señal de co-advance (score/advance) NO cambia al togglear CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS (INVERTED LIVE-ON): served config — 71 `_SURGE` totales, 71 enabled:true, off=[] (CO_ADVANCE #143 LIVE + los 84 priores).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coAdvanceLive = census.find(([n]) => n === "CO_ADVANCE_SURGE");
  const coCohesionLive = census.find(([n]) => n === "CO_COHESION_SURGE");
  const censusOK = total === 71 && trues === 71 && falses.length === 0 && coAdvanceLive && coAdvanceLive[1] === "true" && coCohesionLive && coCohesionLive[1] === "true";
  ok("14 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 71 `_SURGE` totales, 71 enabled:true, off=[] (CO_ADVANCE_SURGE #143 LIVE + CO_COHESION_SURGE #142 LIVE + los 83 priores)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coAdvance=${coAdvanceLive ? coAdvanceLive[1] : "?"} coCohesion=${coCohesionLive ? coCohesionLive[1] : "?"}`);

  // 15 render badge "Envite:" drawn ON+push / not OFF + fps. 🔑 label ÚNICO "Envite:" (⊥ #142 'Piña:'/#141 'Repliegue:'/#140 'Muralla:'/#139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:').
  const badge = await page.evaluate(async (args) => {
    const { Z, THREAT } = args;
    const drive = () => window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: [{ dx: 50, dy: 0, vx: 5, vy: 0 }, { dx: 0, dy: 40, vx: 4, vy: 2 }, { dx: 40, dy: -40, vx: 6, vy: 3 }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Envite:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coAdvance({ enabled: true });
    window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coAdvance({ clearAdvance: true });
    window.__dev.coAdvance({ enabled: false });
    const enAtOff = window.__dev.coAdvance().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, THREAT });
  ok("15 render badge \"Envite:\" se DIBUJA ON+push (A>0, re-driven cada frame) y NO OFF (A 0) + fps sano (label ÚNICO ⊥ #142 'Piña:'/#141 'Repliegue:'/#140 'Muralla:'/#139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, THREAT } = args; window.__dev.coAdvance({ enabled: true }); window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: [{ dx: 50, dy: 0, vx: 5, vy: 0 }, { dx: 0, dy: 40, vx: 4, vy: 2 }, { dx: 40, dy: -40, vx: 6, vy: 3 }], wipe: true } }); }, { Z, THREAT });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coAdvance({ clearAdvance: true }); window.__dev.coAdvance({ enabled: false }); });

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
    const { Z, FPARG, THREAT } = args;
    window.__dev.coAdvance({ enabled: true });
    window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: [{ dx: 50, dy: 0, vx: 5, vy: 0 }, { dx: 0, dy: 40, vx: 4, vy: 2 }, { dx: 40, dy: -40, vx: 6, vy: 3 }], wipe: true } }).driveAdvance;
    const vm = window.__dev.coAdvance();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([pushing, P]) => { const m = window.__dev.coAdvance({ advanceProbe: { pushing, players: P } }).advanceProbe; return { p: m.players, A: m.advance, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coAdvance({ advanceProbeLive: true }).advanceProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coAdvance({ clearAdvance: true });
    window.__dev.coAdvance({ enabled: false });
    return { score: dv.score, idx: dv.idx, advance: dv.advance, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveAdvance: live.advance, livePlayers: live.players, lut, fp };
  }, { Z, FPARG, THREAT });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.advance === B.advance && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveAdvance === B.liveAdvance && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO empuje A=3 ⇒ score/idx/advance/players/tier/charge + advanceProbeLive(field,advance,players,score) + advanceProbe LUT (A enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},advance:${A.advance},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveAdvance:${A.liveAdvance},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},advance:${B.advance},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveAdvance:${B.liveAdvance},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coAdvance({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coAdvance({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == 10f8be94fd1f/815 (NEW ≠ old 3a014051fb4f) + served sim/config.js CO_ADVANCE_SURGE enabled:true + census 71/71 off=[].
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
    const lCoAdvance = lcensus.find(([n]) => n === "CO_ADVANCE_SURGE");
    const lCoCohesion = lcensus.find(([n]) => n === "CO_COHESION_SURGE");
    const servedOK = rootRes.status === 200 && ver.build === "10f8be94fd1f" && ver.files === 815 && lTotal === 71 && lTrues === 71 && lFalses.length === 0 && lCoAdvance && lCoAdvance[1] === "true" && lCoCohesion && lCoCohesion[1] === "true";
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 10f8be94fd1f/815 (NEW ≠ old 3a014051fb4f) + served sim/config.js CO_ADVANCE_SURGE enabled:true + census 71/71 off=[]",
       servedOK, `rootStatus=${rootRes.status} build=${ver.build} files=${ver.files} census total=${lTotal} true=${lTrues} false=${JSON.stringify(lFalses)} coAdvance=${lCoAdvance ? lCoAdvance[1] : "?"} coCohesion=${lCoCohesion ? lCoCohesion[1] : "?"}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json 10f8be94fd1f/815 + config CO_ADVANCE_SURGE enabled:true", false, `FETCH ERROR ${String(e)}`);
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
