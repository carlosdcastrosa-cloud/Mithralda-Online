// CAS-2833 — POST-FLIP LIVE QA for DIANA (CO_FOCUS_SURGE.enabled:TRUE LIVE, EVO#144, 86º flag). Base master 8f7961c (b2d246e DARK → 7ddf3e6 flip false→true → 8f7961c version stamp a210d646fa96/815), served LIVE carlosdcastrosa-cloud.github.io/Mithralda-Online.
// Derivado del DARK self-verify cas2829 con: ck2 INVERTIDO LIVE-ON (enabled TRUE, solo boot ⇒ G≤1 ⇒ score/tier/charge colapsan LIMPIO), ck14 CENSUS INVERTIDO (72/72 enabled:true off=[]), + ck18 SERVED-LIVE-BUILD (root200 + version.json a210d646fa96/815 + served config CO_FOCUS_SURGE enabled:true + census 72/72). Gameplay/determinismo corre contra checkout local NO-DRIFT (HEAD==origin==8f7961c, byte-idéntico a lo servido); ck18 verifica los BYTES SERVIDOS.
// (A) EJE = DIANA/CO-FOCUS = G = MÁX sobre los mobs de (nº de JUGADORES DISTINTOS VIVOS dentro del radio compartido (300px) cuyo `targetId` ACTUAL == ese mob) = el mayor grupo convergido sobre UN objetivo (shared-target/focus-fire), ⊥ #143 ENVITE (velocidad-toward — target-identity ⊥ movement-direction), ⊥ #62 FOCUS_FIRE (passive goldFind sostenido — canal/forma/temporalidad distintos), ⊥ #142 PIÑA (position-tightness), ⊥ #140/#139/#138/#141/#137/#136/#132. CONTEO CRUDO del mayor grupo, NO fracción (#123 cov/P). SNAPSHOT PURO (lee `targetId` ya replicado). 🔑 DETERMINISMO (sev-1): G=MÁX de un tally por igualdad-de-id ENTERA (bucket por `targetId|0`; el MÁX es CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midFocus2,hiFocus3} ⇒ 0-float en el score/decisión. 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 sobre cualquier objetivo ⇒ G colapsa ⇒ 0.
// (B) CANAL = coFocusFind (fichas de diana por rematar con la convergencia ACREDITADA). Moneda FRESCA (h.coFocusBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2833-cofocus-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2833");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// focusProbe LUT esperada: (converged=nº en el mayor bucket sobre un objetivo, players=P gate)→G=clamp(converged,0,P)→banda(G vs {midFocus2,hiFocus3,minPlayers2} ENTEROS)→{weight,rankTier}. UMBRALES hiFocus 3 / midFocus 2 + colapso single-player (G<minPlayers2 ⇒ 0).
const EXPECT_FOC = [
  { name: "solo-P1",            converged: 1, players: 1, G: 1, w: 0 },
  { name: "duo-P2",             converged: 2, players: 2, G: 2, w: 1 },
  { name: "duo-of-4",           converged: 2, players: 4, G: 2, w: 1 },
  { name: "trio-P3",            converged: 3, players: 3, G: 3, w: 2 },
  { name: "trio-of-4",          converged: 3, players: 4, G: 3, w: 2 },
  { name: "full-P4",            converged: 4, players: 4, G: 4, w: 2 },
  { name: "none-P3",            converged: 0, players: 3, G: 0, w: 0 },
  { name: "split-max1-P4",      converged: 1, players: 4, G: 1, w: 0 },
  { name: "clamp-overflow",     converged: 9, players: 3, G: 3, w: 2 },
];
// driveFocus REAL: inyecta roster sintético (P jugadores con offset {dx,dy}+targetId, opcional dead) ⇒ G server-auth = MÁX bucket por targetId entre jugadores VIVOS DENTRO del radio (300px) con objetivo activo.
// filas: [dx, dy, targetId, dead]
const EXPECT_DRIVE = [
  { name: "trio-same-target",   players: [[50, 0, 7, false], [0, 40, 7, false], [40, -40, 7, false]],  G: 3, w: 2 },
  { name: "solo-target",        players: [[50, 0, 7, false]],                                          G: 1, w: 0 },
  { name: "duo-same-target",    players: [[50, 0, 7, false], [0, 40, 7, false]],                       G: 2, w: 1 },
  { name: "duo-same-plus-solo", players: [[50, 0, 7, false], [0, 40, 7, false], [40, -40, 9, false]],  G: 2, w: 1 },
  { name: "all-different",      players: [[50, 0, 7, false], [0, 40, 8, false], [40, -40, 9, false]],  G: 1, w: 0 },
  { name: "notarget-excluded",  players: [[50, 0, 7, false], [0, 40, 7, false], [40, -40, 0, false]],  G: 2, w: 1 },
  { name: "dead-excluded",      players: [[50, 0, 7, false], [0, 40, 7, false], [40, -40, 7, true]],   G: 2, w: 1 },
  { name: "far-excluded",       players: [[50, 0, 7, false], [0, 40, 7, false], [400, 0, 7, false]],   G: 2, w: 1 },
  { name: "quad-same-target",   players: [[50, 0, 7, false], [0, 40, 7, false], [40, -40, 7, false], [-40, 20, 7, false]], G: 4, w: 2 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coFocus && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coFocus + peer hooks (coAdvance/coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_FOCUS_SURGE.enabled TRUE; solo hero fresh boot, SIN party sintética ⇒ G≤1 < midFocus2 ⇒ SCORE/DECISIÓN colapsan LIMPIO (tier/score/charge/preview=0). Multijugador-nativo: IMPOSIBLE converger fuego en solitario. channel fresco coFocusFind + tag vacío. 🔑 NO asertamos gExists/partyExists false (con enabled:true las estructuras transitorias PUEDEN materializarse) — aserta el COLAPSO DE DECISIÓN.
  const dark = await page.evaluate(() => window.__dev.coFocus());
  ok("2 LIVE-ON (fresh solo boot): CO_FOCUS_SURGE.enabled TRUE AND sin convergencia (G≤1) ⇒ score/tier/charge/preview colapsan LIMPIO a 0 AND channel coFocusFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.focus <= 1 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coFocusFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} focus=${dark.focus} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiFocus=${dark.hiFocus} midFocus=${dark.midFocus} minPlayers=${dark.minPlayers} radius=${dark.radius} weights=${JSON.stringify(dark.weights)}`);

  // 3 save has no coFocusFind/coFocusBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coFocusFind|coFocusBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coFocusBounty"\s*:/.test(saveOff);
  ok("3 byte-id save: sin clave 'coFocusFind'/'coFocusBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coFocus({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coFocus({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ focusProbe LUT
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coFocus({ focusProbe: { converged: c.converged, players: c.players } }).focusProbe), EXPECT_FOC);
  const tabOK = EXPECT_FOC.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].focus === c.G);
  ok("5 ★ focusProbe LUT (DIANA G=mayor grupo convergido): solo-P1(G1)⇒0, duo(G2)⇒1, duo-of-4(G2)⇒1, trio(G3)⇒2, trio-of-4(G3)⇒2, full(G4)⇒2, none-P3(G0)⇒0, split-max1-P4(G1)⇒0, clamp-overflow⇒G3. UMBRAL hiFocus 3/midFocus 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_FOC[i].name, p: x.players, G: x.focus, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH DIANA
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ dx: r[0], dy: r[1], targetId: r[2], dead: !!r[3] }));
    window.__dev.coFocus({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coFocus({ driveFocus: { players: mkParty(c.players), wipe: true } }).driveFocus;
      const live = window.__dev.coFocus({ focusProbeLive: true }).focusProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvFocus: dv.focus, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveFocus: live.focus, livePlayers: live.players });
    }
    window.__dev.coFocus({ clearFocus: true });
    window.__dev.coFocus({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvFocus === c.G && comp[i].liveFocus === c.G);
  ok("5c ★ REAL SERVER-AUTH DIANA (max-bucket por targetId, radio 300px): trio-same(G3)=w2, solo(G1)=w0, duo-same(G2)=w1, duo-same-plus-solo({7:2,9:1}⇒G2)=w1, all-different(7/8/9⇒G1)=w0, notarget-excluded(G2)=w1, dead-excluded(G2)=w1, far-excluded(400px⇒G2)=w1, quad-same(G4)=w2 (filtra sin-objetivo + muertos + fuera-de-radio; convergencia = MAYOR grupo sobre UN objetivo)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (PRIMARIO) ⊥#143 ENVITE (velocidad-toward ⊥ target-identity) — REAL server-auth
  const cruxAdv = await page.evaluate((args) => {
    const { Z } = args;
    const POS = [[50, 0], [0, 40], [40, -40]];
    const THREAT = { tx: 200, ty: 0 };
    window.__dev.coFocus({ enabled: true }); window.__dev.coAdvance({ enabled: true });
    window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coAdvance({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coFocus({ driveFocus: { players: POS.map(p => ({ dx: p[0], dy: p[1], targetId: 7 })), wipe: true } });
    window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: POS.map(p => ({ dx: p[0], dy: p[1], vx: 0, vy: 0 })), wipe: true } });
    const conv = { f: window.__dev.coFocus({ focusProbeLive: true }).focusProbeLive, a: window.__dev.coAdvance({ advanceProbeLive: true }).advanceProbeLive };
    window.__dev.coFocus({ driveFocus: { players: POS.map((p, i) => ({ dx: p[0], dy: p[1], targetId: 7 + i })), wipe: true } });
    window.__dev.coAdvance({ driveAdvance: { threat: THREAT, players: POS.map(p => ({ dx: p[0], dy: p[1], vx: 6, vy: 0 })), wipe: true } });
    const push = { f: window.__dev.coFocus({ focusProbeLive: true }).focusProbeLive, a: window.__dev.coAdvance({ advanceProbeLive: true }).advanceProbeLive };
    window.__dev.coFocus({ clearFocus: true }); window.__dev.coAdvance({ clearAdvance: true });
    window.__dev.coFocus({ enabled: false }); window.__dev.coAdvance({ enabled: false });
    return { conv, push };
  }, { Z });
  const cruxAdvOK =
    cruxAdv.conv.f.focus === 3 && cruxAdv.conv.f.score === 2 && cruxAdv.conv.a.advance === 0 && cruxAdv.conv.a.score === 0
    && cruxAdv.push.f.focus === 1 && cruxAdv.push.f.score === 0 && cruxAdv.push.a.advance === 3 && cruxAdv.push.a.score === 2;
  ok("6 ★ CRUX (PRIMARIO) ⊥#143 ENVITE (velocidad-toward ⊥ target-identity, REAL server-auth): MISMAS 3 posiciones apuntando-al-MISMO-mob QUIETOS ⇒ DIANA G3/w2 pero ENVITE A0/w0; apuntando cada quien a un mob DISTINTO mientras avanzan ⇒ ENVITE A3/w2 pero DIANA G1/w0 — target-identity ⊥ velocity, divergen en AMBOS sentidos",
     cruxAdvOK, JSON.stringify(cruxAdv));

  // 6b ★ CRUX ⊥#142 PIÑA (target-identity ⊥ position-tightness)
  const cruxCoh = await page.evaluate(() => {
    const foc = (converged, P) => window.__dev.coFocus({ focusProbe: { converged, players: P } }).focusProbe;
    const coh = (clustered, P) => window.__dev.coCohesion({ cohesionProbe: { clustered, players: P } }).cohesionProbe;
    const A = { foc: foc(3, 3), coh: coh(0, 3) };
    const B = { foc: foc(1, 3), coh: coh(3, 3) };
    return { A, B };
  });
  const cruxCohOK =
    cruxCoh.A.foc.focus === 3 && cruxCoh.A.foc.weight === 2 && cruxCoh.A.coh.cohesion === 0 && cruxCoh.A.coh.weight === 0
    && cruxCoh.B.foc.focus === 1 && cruxCoh.B.foc.weight === 0 && cruxCoh.B.coh.cohesion === 3 && cruxCoh.B.coh.weight === 2;
  ok("6b ★ CRUX ⊥#142 PIÑA (target-identity ⊥ position-tightness): {3 convergidos/dispersos,0 apiñados} ⇒ DIANA G3/w2 pero PIÑA C0/w0; {aim-disperso G1,3 apiñados} ⇒ DIANA G1/w0 pero PIÑA C3/w2 ⇒ apuntar-al-mismo ⊥ estar-apiñado (pesos divergen en AMBOS sentidos)",
     cruxCohOK, JSON.stringify(cruxCoh));

  // 6f ★ CRUX ⊥#62 FOCUS_FIRE (MISMO tema, mecánica DISTINTA): canal coFocusFind ⊥ goldFind
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const coFocusCh = (cfgSrc.match(/export const CO_FOCUS_SURGE\s*=\s*\{[\s\S]*?channel:\s*"([^"]+)"/) || [])[1];
  const focusFireCh = (cfgSrc.match(/export const FOCUS_FIRE\s*=\s*\{[\s\S]*?channel:\s*"([^"]+)"/) || [])[1];
  const vmCh = await page.evaluate(() => window.__dev.coFocus().channel);
  const chOK = coFocusCh === "coFocusFind" && vmCh === "coFocusFind" && focusFireCh === "goldFind" && coFocusCh !== focusFireCh;
  ok("6f ★ CRUX ⊥#62 FOCUS_FIRE (canal/forma/temporalidad DISTINTOS): CO_FOCUS_SURGE.channel='coFocusFind' (VM idem) ⊥ FOCUS_FIRE.channel='goldFind' — DIANA = CONTEO ENTERO single-frame por canal FIND FRESCO ⊥ FOCUS_FIRE = multiplicador PASSIVE de oro sostenido con decay",
     chOK, `coFocusCh=${coFocusCh} vmCh=${vmCh} focusFireCh=${focusFireCh}`);

  // 6e ★ CRUX ⊥#123 CONTEST (CONTEO CRUDO ⊥ FRACCIÓN cov/P)
  const cruxContest = await page.evaluate(() => {
    const foc = (converged, P) => window.__dev.coFocus({ focusProbe: { converged, players: P } }).focusProbe;
    const full = foc(2, 2);
    const half = foc(2, 4);
    return { full, half };
  });
  const cruxContestOK = cruxContest.full.focus === 2 && cruxContest.half.focus === 2 && cruxContest.full.weight === 1 && cruxContest.half.weight === 1;
  ok("6e ★ CRUX ⊥#123 CONTEST (CONTEO ⊥ FRACCIÓN): {2 de 2}(cov 1.0) vs {2 de 4}(cov 0.5) ⇒ MISMO DIANA G2/w1 (conteo CRUDO del mayor grupo convergido, INVARIANTE a la cobertura fraccional)",
     cruxContestOK, JSON.stringify(cruxContest));

  // 7 ★ G-SENSITIVITY
  const gSens = await page.evaluate(() => {
    const t = (converged, P) => { const m = window.__dev.coFocus({ focusProbe: { converged, players: P } }).focusProbe; return { G: m.focus, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), full: t(4, 4) };
  });
  const gSensOK = gSens.duo.G === 2 && gSens.trio.G === 3 && gSens.full.G === 4 && gSens.duo.w === 1 && gSens.trio.w === 2 && gSens.full.w === 2;
  ok("7 ★ G-SENSITIVITY (G sube con más convergidos): 2⇒G2/w1, 3⇒G3/w2, 4⇒G4/w2 (DIANA mide el tamaño CRUDO del mayor grupo convergido)",
     gSensOK, JSON.stringify(gSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFocus({ enabled: true });
    const drive = (rows) => { window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coFocus({ driveFocus: { players: rows.map(r => ({ dx: r[0], dy: r[1], targetId: r[2] })), wipe: true } }).driveFocus;
      const live = window.__dev.coFocus({ focusProbeLive: true }).focusProbeLive;
      return { idx: dv.idx, focus: dv.focus, score: dv.score, players: live.players }; };
    const sp = drive([[50, 0, 7]]);
    const mp = drive([[50, 0, 7], [0, 40, 7], [40, -40, 7]]);
    window.__dev.coFocus({ clearFocus: true });
    window.__dev.coFocus({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.focus === 1 && degen.sp.score === 0 && degen.mp.focus === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 sobre un objetivo ⇒ G1/score0; 3 convergidos ⇒ G3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE converger fuego en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM
  const det = await page.evaluate(() => {
    const a = window.__dev.coFocus({ focusProbe: { converged: 3, players: 4 } }).focusProbe;
    const b = window.__dev.coFocus({ focusProbe: { converged: 3, players: 4 } }).focusProbe;
    return { a: { G: a.focus, w: a.weight }, b: { G: b.focus, w: b.weight } };
  });
  const detOK = det.a.G === det.b.G && det.a.w === det.b.w && det.a.G === 3;
  ok("9 ★ INTEGER-DETERMINISM: focusProbe repetido ⇒ G/weight byte-idénticos (max-bucket ENTERO por igualdad-de-id + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del MÁX (determinismo del tally)
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFocus({ enabled: true });
    const g = (rows) => { window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coFocus({ driveFocus: { players: rows.map(r => ({ dx: r[0], dy: r[1], targetId: r[2] })), wipe: true } }).driveFocus.focus; };
    const a = g([[50, 0, 7], [0, 40, 7], [40, -40, 9], [-40, 20, 9]]);
    const b = g([[40, -40, 9], [50, 0, 7], [-40, 20, 9], [0, 40, 7]]);
    window.__dev.coFocus({ clearFocus: true }); window.__dev.coFocus({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del tally MÁX: MISMO roster {7:2,9:2} en 2 órdenes distintos ⇒ MISMO G2 (el MÁX del bucket es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 2 && orderInv.b === 2 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coFocusFind
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFocus({ enabled: true });
    window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coFocus({ driveFocus: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: 0, dy: 40, targetId: 7 }, { dx: 40, dy: -40, targetId: 7 }], wipe: true } });
    const actVm = window.__dev.coFocus();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coFocus({ driveFocus: { players: [{ dx: 50, dy: 0, targetId: 7 }], wipe: true } });
    const goVm = window.__dev.coFocus();
    window.__dev.coFocus({ clearFocus: true });
    window.__dev.coFocus({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coFocusFind: forageChargePreview convergencia plena (G≥3) ⇒ charge>0 (==coFocusBonus); con solitario (G1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 10; s++) vals.push(window.__dev.coFocus({ focusProbe: { converged: s, players: s } }).focusProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.coFocus().cap };
  });
  ok("11 ★ SUB-CAP: ninguna convergencia plena produce charge>coFocusBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFocus({ enabled: true });
    window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coFocus({ driveFocus: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: 0, dy: 40, targetId: 7 }, { dx: 40, dy: -40, targetId: 7 }], wipe: true } });
    window.__dev.coFocus({ enabled: false });
    const off = window.__dev.coFocus();
    window.__dev.coFocus({ enabled: true }); window.__dev.coFocus({ clearFocus: true }); window.__dev.coFocus({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, focus: off.focus };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.focus === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, coFocusBonus(convergencia plena disponible)==0 + forageChargePreview==0 + idx==0 + focus==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coFocus({ enabled: true });
    window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coFocus({ driveFocus: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: 0, dy: 40, targetId: 7 }, { dx: 40, dy: -40, targetId: 7 }], wipe: true } }).driveFocus;
    const snap = () => JSON.stringify({ coAdvance: window.__dev.coAdvance(), coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const caPrev = window.__dev.coAdvance().enabled, ccPrev = window.__dev.coCohesion().enabled, ctPrev = window.__dev.coTank().enabled, csPrev = window.__dev.coSupport().enabled, ckPrev = window.__dev.coKill().enabled, cpPrev = window.__dev.coPresence().enabled, cfPrev = window.__dev.coFlee().enabled, pvPrev = window.__dev.partyVital().enabled;
    window.__dev.coAdvance({ enabled: !caPrev }); window.__dev.coCohesion({ enabled: !ccPrev }); window.__dev.coTank({ enabled: !ctPrev }); window.__dev.coSupport({ enabled: !csPrev }); window.__dev.coKill({ enabled: !ckPrev }); window.__dev.coPresence({ enabled: !cpPrev }); window.__dev.coFlee({ enabled: !cfPrev }); window.__dev.partyVital({ enabled: !pvPrev });
    const after = window.__dev.coFocus({ focusProbeLive: true }).focusProbeLive;
    window.__dev.coAdvance({ enabled: caPrev }); window.__dev.coCohesion({ enabled: ccPrev }); window.__dev.coTank({ enabled: ctPrev }); window.__dev.coSupport({ enabled: csPrev }); window.__dev.coKill({ enabled: ckPrev }); window.__dev.coPresence({ enabled: cpPrev }); window.__dev.coFlee({ enabled: cfPrev }); window.__dev.partyVital({ enabled: pvPrev });
    const peersRestored = snap();
    window.__dev.coFocus({ clearFocus: true });
    window.__dev.coFocus({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.focus === after.focus;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeFocus: before.focus, afterFocus: after.focus };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coFocusFind ⊥ peers: la señal de co-focus (score/focus) NO cambia al togglear CO-ADVANCE #143/CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS (INVERTED LIVE-ON): served config — 72 `_SURGE` totales, 72 enabled:true, off=[] (CO_FOCUS #144 LIVE + los 85 priores).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coFocusLive = census.find(([n]) => n === "CO_FOCUS_SURGE");
  const coAdvanceLive = census.find(([n]) => n === "CO_ADVANCE_SURGE");
  const censusOK = total === 72 && trues === 72 && falses.length === 0 && coFocusLive && coFocusLive[1] === "true" && coAdvanceLive && coAdvanceLive[1] === "true";
  ok("14 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 72 `_SURGE` totales, 72 enabled:true, off=[] (CO_FOCUS_SURGE #144 LIVE + CO_ADVANCE_SURGE #143 LIVE + los 84 priores)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coFocus=${coFocusLive ? coFocusLive[1] : "?"} coAdvance=${coAdvanceLive ? coAdvanceLive[1] : "?"}`);

  // 15 render badge "Diana:" drawn ON+converge / not OFF + fps
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coFocus({ driveFocus: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: 0, dy: 40, targetId: 7 }, { dx: 40, dy: -40, targetId: 7 }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Diana:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coFocus({ enabled: true });
    window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coFocus({ clearFocus: true });
    window.__dev.coFocus({ enabled: false });
    const enAtOff = window.__dev.coFocus().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Diana:\" se DIBUJA ON+converge (G>0, re-driven cada frame) y NO OFF (G 0) + fps sano (label ÚNICO ⊥ #143 'Envite:'/#142 'Piña:'/#141 'Repliegue:'/#140 'Muralla:'/#139 'Socorro:'/#138 'Cuadrilla:'/#137 'Cohorte:'/#136 'Cónclave:'/#62 'Fuego Conc.:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coFocus({ enabled: true }); window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coFocus({ driveFocus: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: 0, dy: 40, targetId: 7 }, { dx: 40, dy: -40, targetId: 7 }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coFocus({ clearFocus: true }); window.__dev.coFocus({ enabled: false }); });

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
    window.__dev.coFocus({ enabled: true });
    window.__dev.coFocus({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coFocus({ driveFocus: { players: [{ dx: 50, dy: 0, targetId: 7 }, { dx: 0, dy: 40, targetId: 7 }, { dx: 40, dy: -40, targetId: 7 }], wipe: true } }).driveFocus;
    const vm = window.__dev.coFocus();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([converged, P]) => { const m = window.__dev.coFocus({ focusProbe: { converged, players: P } }).focusProbe; return { p: m.players, G: m.focus, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coFocus({ focusProbeLive: true }).focusProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coFocus({ clearFocus: true });
    window.__dev.coFocus({ enabled: false });
    return { score: dv.score, idx: dv.idx, focus: dv.focus, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveFocus: live.focus, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.focus === B.focus && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveFocus === B.liveFocus && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): MISMA convergencia G=3 ⇒ score/idx/focus/players/tier/charge + focusProbeLive(field,focus,players,score) + focusProbe LUT (G enteros) + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},focus:${A.focus},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveFocus:${A.liveFocus},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},focus:${B.focus},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveFocus:${B.liveFocus},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.coFocus({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coFocus({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == a210d646fa96/815 (NEW ≠ old 10f8be94fd1f) + served sim/config.js CO_FOCUS_SURGE enabled:true + census 72/72 off=[].
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
    const lCoFocus = lcensus.find(([n]) => n === "CO_FOCUS_SURGE");
    const lCoAdvance = lcensus.find(([n]) => n === "CO_ADVANCE_SURGE");
    const servedOK = rootRes.status === 200 && ver.build === "a210d646fa96" && ver.files === 815 && lTotal === 72 && lTrues === 72 && lFalses.length === 0 && lCoFocus && lCoFocus[1] === "true" && lCoAdvance && lCoAdvance[1] === "true";
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json a210d646fa96/815 (NEW ≠ old 10f8be94fd1f) + served sim/config.js CO_FOCUS_SURGE enabled:true + census 72/72 off=[]",
       servedOK, `rootStatus=${rootRes.status} build=${ver.build} files=${ver.files} census total=${lTotal} true=${lTrues} false=${JSON.stringify(lFalses)} coFocus=${lCoFocus ? lCoFocus[1] : "?"} coAdvance=${lCoAdvance ? lCoAdvance[1] : "?"}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json a210d646fa96/815 + config CO_FOCUS_SURGE enabled:true", false, `FETCH ERROR ${String(e)}`);
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
