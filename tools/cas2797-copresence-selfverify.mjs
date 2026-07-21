// CAS-2797 — self-verify for COHORTE (DARK, CO_PRESENCE_SURGE.enabled:false). EVO mecánica #137 (base master d9e60e8 tras #136 CÓNCLAVE CO_STRIKE LIVE&served 75fda9c79c56/815) — EJE FRESCO + CANAL FRESCO, ⊥ a los 78 LIVE #59-#136. El 19º eje de COMPOSICIÓN-DE-INTENCIÓN y la SEGUNDA faceta de la sub-familia PLAYER-COORDINATION que abrió #136 CÓNCLAVE.
// (A) EJE FRESCO = COHORTE/CO-PRESENCIA = R = nº de JUGADORES DISTINTOS VIVOS DENTRO DEL RADIO del héroe, PRESENTES (rally), INDEPENDIENTE de si un mob los engancha (⊥ #136 CÓNCLAVE que cuenta ENGANCHADOS en combate). Lee el MISMO roster de jugadores server-auth que #136 usa como gate, pero como CONTEO CRUDO de PRESENTES, NO muster de combate, NO fracción (#123 cov/P). SNAPSHOT PURO (lee el roster replicado directo, SIN buffer temporal). 🔑 DETERMINISMO (sev-1): R=cuenta ENTERA de jugadores presentes vs umbrales ENTEROS {midRally2,hiRally3} ⇒ 0-float en el score/decisión. Bandas sobre R: ≥hiRally(3) ⇒ rally-pleno ⇒ 2; ≥midRally(2) ⇒ rally-parcial ⇒ 1; <2 (solitario) ⇒ 0. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ R=1 ⇒ 0 (colapso LIMPIO, IMPOSIBLE en solitario).
// (B) CANAL FRESCO = coPresenceFind (fichas de cohorte por rematar con la party PRESENTE/rallevada — NINGUNO de los 78 flags lo usa). Moneda FRESCA (h.coPresenceBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//     CRUX (LA CRÍTICA) — COHORTE = CO-PRESENCIA (roster presente) ⊥ TODOS los priores: ⊥#136 CÓNCLAVE (muster ENGANCHADA en combate): {3 presentes,1 enganchado} ⇒ COHORTE R3/w2 pero CÓNCLAVE F1/0; {2 presentes,2 enganchados} ⇒ COHORTE R2/w1 y CÓNCLAVE F2/1 — PRESENTE ⊥ ENGANCHADO. ⊥#123 CONTEST (cov/P FRACCIÓN — COHORTE = conteo CRUDO). ⊥#126 DENSITY (conteo de MOBS, no de JUGADORES). ⊥ CONGREGATION (headcount ZONAL → restedMult vs COHORTE RADIO-LOCAL → canal find).
//
// Run: node tools/cas2797-copresence-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2797");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// rosterProbe LUT esperada: (present=nº presentes en radio, players=P gate)→R=clamp(present,0,P)→banda(R vs {midRally2,hiRally3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiRally 3 / midRally 2 + colapso single-player (R<minPlayers2 ⇒ 0).
const EXPECT_ROSTER = [
  { name: "solo-P1",           present: 1, players: 1, R: 1, w: 0 },   // single-player: R1<midRally ⇒ 0 (colapso LIMPIO)
  { name: "duo-P2",            present: 2, players: 2, R: 2, w: 1 },   // 2 presentes ⇒ R2 ⇒ 1
  { name: "duo-of-4",          present: 2, players: 4, R: 2, w: 1 },   // 🔑 2 presentes DE un roster de 4 ⇒ R2 (conteo CRUDO, ⊥ CONTEST fracción 2/4)
  { name: "trio-P3",           present: 3, players: 3, R: 3, w: 2 },   // 3 presentes ⇒ R3 ⇒ 2
  { name: "trio-of-4",         present: 3, players: 4, R: 3, w: 2 },   // R3 de P4 ⇒ 2
  { name: "full-P4",           present: 4, players: 4, R: 4, w: 2 },   // 4 presentes ⇒ R4 ⇒ 2
  { name: "one-present-P3",    present: 1, players: 3, R: 1, w: 0 },   // 🔑 sólo 1 presente de un roster de 3 (el resto fuera de radio) ⇒ R1 ⇒ 0
  { name: "clamp-overflow",    present: 9, players: 3, R: 3, w: 2 },   // present>P se clampa a P=3 ⇒ R3 ⇒ 2
];
// driveRoster REAL: inyecta roster sintético (P jugadores con offset {dx,dy}, opcional dead) ⇒ R server-auth = # vivos DENTRO del radio. Requiere ≥minPlayers(2) presentes para banda.
const EXPECT_DRIVE = [
  { name: "duo-in-radius",     players: [[0, 0], [44, 0]],                        R: 2, w: 1 },   // 2 en radio ⇒ R2
  { name: "solo-in-radius",    players: [[0, 0]],                                 R: 1, w: 0 },   // 1 ⇒ R1 ⇒ 0
  { name: "trio-in-radius",    players: [[0, 0], [44, 0], [0, 44]],               R: 3, w: 2 },   // 3 ⇒ R3 ⇒ 2
  { name: "far-excluded",      players: [[0, 0], [44, 0], [9999, 0]],             R: 2, w: 1 },   // 🔑 3º jugador fuera de radio (dx 9999) ⇒ EXCLUIDO ⇒ R2 (RADIO-LOCAL)
  { name: "dead-excluded",     players: [[0, 0], [44, 0], [30, 30, true]],        R: 2, w: 1 },   // 🔑 3º jugador MUERTO ⇒ EXCLUIDO ⇒ R2 (ANTI-conteo-de-cadáveres)
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coPresence && window.__dev.coStrike && window.__dev.rankSpread && window.__dev.aggroContest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coPresence + peer hooks (coStrike/rankSpread/aggroContest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.coPresence());
  ok("2 byte-id OFF (fresh boot): CO_PRESENCE_SURGE.enabled false AND G.coPresenceBounty NUNCA se crea (gExists false) AND G._coPresenceParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.rally === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coPresenceFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} rally=${dark.rally} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiRally=${dark.hiRally} midRally=${dark.midRally} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no coPresenceFind/coPresenceBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coPresenceFind|coPresenceBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coPresenceBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'coPresenceFind'/'coPresenceBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coPresence({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coPresence({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ rosterProbe LUT: (present,players)→R=clamp→banda(R vs {2,3} ENTEROS)→tier→charge (UMBRALES hiRally/midRally + colapso single-player + clamp).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coPresence({ rosterProbe: { present: c.present, players: c.players } }).rosterProbe), EXPECT_ROSTER);
  const tabOK = EXPECT_ROSTER.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].rally === c.R);
  ok("5 ★ rosterProbe LUT (COHORTE R=#jugadores presentes): solo-P1(R1)⇒0, duo(R2)⇒1, duo-of-4(R2)⇒1, trio(R3)⇒2, trio-of-4(R3)⇒2, full(R4)⇒2, one-present-P3(R1)⇒0, clamp-overflow⇒R3. UMBRAL hiRally 3/midRally 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_ROSTER[i].name, p: x.players, R: x.rally, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH COHORTE: driveRoster inyecta roster sintético (posiciones + vivo/muerto) ⇒ R REAL server-auth (filtra fuera-de-radio + muertos).
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], dead: !!r[2] }));
    window.__dev.coPresence({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coPresence({ driveRoster: { players: mkParty(c.players), wipe: true } }).driveRoster;
      const live = window.__dev.coPresence({ rosterProbeLive: true }).rosterProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvRally: dv.rally, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveRally: live.rally, livePlayers: live.players });
    }
    window.__dev.coPresence({ clearRoster: true });
    window.__dev.coPresence({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvRally === c.R && comp[i].liveRally === c.R);
  ok("5c ★ REAL SERVER-AUTH COHORTE (roster snapshot): duo-in-radius(R2)=w1, solo(R1)=w0, trio(R3)=w2, far-excluded(dx9999⇒R2)=w1, dead-excluded(R2)=w1 (filtra RADIO + muertos)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (LA CRÍTICA) ⊥#136 CÓNCLAVE (CO-PRESENCIA ⊥ MUSTER-ENGANCHADA): COHORTE cuenta PRESENTES, CÓNCLAVE cuenta ENGANCHADOS en combate.
  const crux = await page.evaluate(() => {
    const rally = (present, P) => window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe;
    const muster = (tgts, P) => window.__dev.coStrike({ musterProbe: { tgts, players: P } }).musterProbe;
    // {3 presentes, 1 enganchado}: COHORTE R3/w2 vs CÓNCLAVE F1/w0 (una party rallevada que aún NO pelea puntúa R pero no F)
    const A = { rally: rally(3, 3), muster: muster([0, 0, 0], 3) };
    // {2 presentes, 2 enganchados}: COHORTE R2/w1 y CÓNCLAVE F2/w1
    const B = { rally: rally(2, 2), muster: muster([0, 1], 2) };
    return { A, B };
  });
  const cruxOK =
    crux.A.rally.rally === 3 && crux.A.rally.weight === 2 && crux.A.muster.muster === 1 && crux.A.muster.weight === 0   // A: PRESENTE 3 ≠ ENGANCHADO 1, pesos divergen 2 vs 0
    && crux.B.rally.rally === 2 && crux.B.rally.weight === 1 && crux.B.muster.muster === 2 && crux.B.muster.weight === 1;
  ok("6 ★ CRUX (LA CRÍTICA) ⊥#136 CÓNCLAVE (CO-PRESENCIA ⊥ ENGANCHADOS): {3 presentes,1 enganchado} ⇒ COHORTE R3/w2 pero CÓNCLAVE F1/w0 (party rallevada NO-peleando); {2 presentes,2 enganchados} ⇒ COHORTE R2/w1 y CÓNCLAVE F2/w1 ⇒ PRESENTE ⊥ ENGANCHADO (COHORTE es el eje de CO-PRESENCIA, CÓNCLAVE el de CO-ATAQUE)",
     cruxOK, JSON.stringify(crux));

  // 6b ★ CRUX ⊥#123 CONTEST (CONTEO CRUDO ⊥ FRACCIÓN cov/P): mismo R con distinta cobertura.
  const cruxContest = await page.evaluate(() => {
    const rally = (present, P) => window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe;
    const full = rally(2, 2);   // 2 de 2: R2, cobertura 1.0
    const half = rally(2, 4);   // 2 de 4: MISMO R2, pero cobertura 0.5
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.rally === 2 && cruxContest.half.rally === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6b ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO COHORTE R2/w1 (conteo CRUDO de presentes, INVARIANTE a la cobertura fraccional — precedente #126 DENSITY conteo ⊥ fracción)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 6c ★ CRUX ⊥ CONGREGATION (RADIO-LOCAL ⊥ ZONAL): COHORTE excluye jugadores fuera del radio (que CONGREGATION SÍ contaría en la zona).
  const cruxLocal = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coPresence({ enabled: true });
    window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // 4 jugadores en la ZONA pero sólo 1 (el héroe-slot) DENTRO del radio, 3 dispersos lejos ⇒ COHORTE R1 (nadie cerca) aunque zonalmente serían 4
    const scattered = window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }, { dx: 9999, dy: 0 }, { dx: 0, dy: 9999 }, { dx: -9999, dy: 0 }], wipe: true } }).driveRoster;
    // MISMOS 3 aliados pero AHORA pegados al héroe ⇒ COHORTE R4 (local)
    const clustered = window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }, { dx: 30, dy: 0 }, { dx: 0, dy: 30 }, { dx: -30, dy: 0 }], wipe: true } }).driveRoster;
    window.__dev.coPresence({ clearRoster: true });
    window.__dev.coPresence({ enabled: false });
    return { scattered, clustered };
  }, { Z });
  const cruxLocalOK = cruxLocal.scattered.rally === 1 && cruxLocal.scattered.score === 0 && cruxLocal.clustered.rally === 4 && cruxLocal.clustered.score === 2;
  ok("6c ★ CRUX ⊥ CONGREGATION (RADIO-LOCAL ⊥ ZONAL): 4 jugadores en la zona pero DISPERSOS ⇒ COHORTE R1/0 (sólo el héroe cerca); los MISMOS 4 PEGADOS al héroe ⇒ COHORTE R4/2 ⇒ COHORTE mide co-presencia LOCAL (300px), no headcount zonal (CONGREGATION)",
     cruxLocalOK, JSON.stringify(cruxLocal));

  // 7 ★ R-SENSITIVITY / RADIO-FILTER: más jugadores DENTRO del radio ⇒ R sube; los de fuera no cuentan.
  const rSens = await page.evaluate(() => {
    const t = (present, P) => { const m = window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe; return { R: m.rally, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const rSensOK = rSens.duo.R === 2 && rSens.trio.R === 3 && rSens.full.R === 4 && rSens.duo.w === 1 && rSens.trio.w === 2 && rSens.full.w === 2;
  ok("7 ★ R-SENSITIVITY (R sube con más jugadores PRESENTES): 2⇒R2/w1, 3⇒R3/w2, 4⇒R4/w2 (COHORTE mide el tamaño CRUDO del rally presente)",
     rSensOK, JSON.stringify(rSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR: mismo escenario, SIN party (R=1) ⇒ 0; CON party (R≥2) ⇒ >0.
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coPresence({ enabled: true });
    const drive = (rows) => { window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coPresence({ driveRoster: { players: rows.map(r => ({ dx: r[0], dy: r[1] })), wipe: true } }).driveRoster;
      const live = window.__dev.coPresence({ rosterProbeLive: true }).rosterProbeLive;
      return { idx: dv.idx, rally: dv.rally, score: dv.score, players: live.players }; };
    const sp = drive([[0, 0]]);                        // single-player: R=1 ⇒ 0 (colapso)
    const mp = drive([[0, 0], [44, 0], [0, 44]]);      // multijugador R3 ⇒ score2 (bien-definido)
    window.__dev.coPresence({ clearRoster: true });
    window.__dev.coPresence({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.rally === 1 && degen.sp.score === 0 && degen.mp.rally === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 jugador ⇒ R1/score0; 3 jugadores ⇒ R3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM: dos rosterProbe idénticos ⇒ R/w byte-idénticos (conteo ENTERO + banda de umbrales enteros {2,3}, 0-float en la decisión).
  const det = await page.evaluate(() => {
    const a = window.__dev.coPresence({ rosterProbe: { present: 3, players: 4 } }).rosterProbe;
    const b = window.__dev.coPresence({ rosterProbe: { present: 3, players: 4 } }).rosterProbe;
    return { a: { R: a.rally, w: a.weight }, b: { R: b.rally, w: b.weight } };
  });
  const detOK = det.a.R === det.b.R && det.a.w === det.b.w && det.a.R === 3;
  ok("9 ★ INTEGER-DETERMINISM: rosterProbe repetido ⇒ R/weight byte-idénticos (CONTEO ENTERO de presentes + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 10 CANAL coPresenceFind: forageChargePreview con party rallevada >0 ; solitario → 0
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coPresence({ enabled: true });
    window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } });   // rally-pleno ⇒ score2
    const actVm = window.__dev.coPresence();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }], wipe: true } });   // solitario (R1) ⇒ score0
    const goVm = window.__dev.coPresence();
    window.__dev.coPresence({ clearRoster: true });
    window.__dev.coPresence({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coPresenceFind: forageChargePreview party plena (R≥3) ⇒ charge>0 (==coPresenceBonus); con solitario (R1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds coPresenceBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let k = 3; k <= 10; k++) vals.push(window.__dev.coPresence({ rosterProbe: { present: k, players: k } }).rosterProbe.charge);  // R=k ⇒ w2
    return { max: Math.max(...vals), cap: window.__dev.coPresence().cap };
  });
  ok("11 ★ SUB-CAP: ninguna party plena produce charge>coPresenceBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 + idx 0 even with a full rally available
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coPresence({ enabled: true });
    window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } });   // rally-pleno disponible
    window.__dev.coPresence({ enabled: false });                          // now OFF
    const off = window.__dev.coPresence();
    window.__dev.coPresence({ enabled: true }); window.__dev.coPresence({ clearRoster: true }); window.__dev.coPresence({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, rally: off.rally };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.rally === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coPresenceBonus(rally pleno disponible)==0 + forageChargePreview==0 + idx==0 + rally==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling coStrike/rankSpread/aggroContest no cambia la señal de coPresence.
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coPresence({ enabled: true });
    window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } }).driveRoster;
    const snap = () => JSON.stringify({ coStrike: window.__dev.coStrike(), aggroContest: window.__dev.aggroContest(), rankSpread: window.__dev.rankSpread() });
    const peersOn = snap();
    const csPrev = window.__dev.coStrike().enabled, acPrev = window.__dev.aggroContest().enabled, rsPrev = window.__dev.rankSpread().enabled;
    window.__dev.coStrike({ enabled: !csPrev }); window.__dev.aggroContest({ enabled: !acPrev }); window.__dev.rankSpread({ enabled: !rsPrev });
    const after = window.__dev.coPresence({ rosterProbeLive: true }).rosterProbeLive;
    window.__dev.coStrike({ enabled: csPrev }); window.__dev.aggroContest({ enabled: acPrev }); window.__dev.rankSpread({ enabled: rsPrev });
    const peersRestored = snap();
    window.__dev.coPresence({ clearRoster: true });
    window.__dev.coPresence({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.rally === after.rally;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeRally: before.rally, afterRally: after.rally };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coPresenceFind ⊥ peers: la señal de cohorte (score/rally) NO cambia al togglear CO-STRIKE #136/AGGRO-CONTEST #123/RANK-SPREAD #135; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS: served config — 65 `_SURGE` totales, sole-false = CO_PRESENCE (64 true, incl. CO_STRIKE #136 LIVE).
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coStrikeLive = census.find(([n]) => n === "CO_STRIKE_SURGE");
  const censusOK = total === 65 && trues === 64 && falses.length === 1 && falses[0] === "CO_PRESENCE_SURGE" && coStrikeLive && coStrikeLive[1] === "true";
  ok("14 ★ 0-REGRESIÓN CENSUS: served config 65 `_SURGE` totales, 64 enabled:true (incl. CO_STRIKE_SURGE #136 LIVE), sole-false = CO_PRESENCE_SURGE (DARK #137)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coStrike=${coStrikeLive ? coStrikeLive[1] : "?"}`);

  // 15 render badge "Cohorte:" drawn ON+rally / not OFF + fps. 🔑 label ÚNICO "Cohorte:" (⊥ #136 'Cónclave:'/#135 'Brecha:'/#134 'Casta:').
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Cohorte:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coPresence({ enabled: true });
    window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coPresence({ clearRoster: true });
    window.__dev.coPresence({ enabled: false });
    const enAtOff = window.__dev.coPresence().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Cohorte:\" se DIBUJA ON+rally (R>0, re-driven cada frame) y NO OFF (R 0) + fps sano (label ÚNICO ⊥ #136 'Cónclave:'/#135 'Brecha:'/#134 'Casta:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coPresence({ enabled: true }); window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coPresence({ clearRoster: true }); window.__dev.coPresence({ enabled: false }); });

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
    window.__dev.coPresence({ enabled: true });
    window.__dev.coPresence({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coPresence({ driveRoster: { players: [{ dx: 0, dy: 0 }, { dx: 44, dy: 0 }, { dx: 0, dy: 44 }], wipe: true } }).driveRoster;   // R=3 ⇒ score2
    const vm = window.__dev.coPresence();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([present, P]) => { const m = window.__dev.coPresence({ rosterProbe: { present, players: P } }).rosterProbe; return { p: m.players, R: m.rally, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coPresence({ rosterProbeLive: true }).rosterProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coPresence({ clearRoster: true });
    window.__dev.coPresence({ enabled: false });
    return { score: dv.score, idx: dv.idx, rally: dv.rally, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveRally: live.rally, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.rally === B.rally && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveRally === B.liveRally && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMO roster R=3 ⇒ score/idx/rally/players/tier/charge + rosterProbeLive(field,rally,players,score) + rosterProbe LUT (R enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},rally:${A.rally},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveRally:${A.liveRally},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},rally:${B.rally},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveRally:${B.liveRally},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coPresence({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coPresence({ enabled: false }));

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
