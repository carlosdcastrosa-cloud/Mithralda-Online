// CAS-2706 — self-verify for DISPERSIÓN DE OBJETIVOS (DARK, TARGET_SPREAD_SURGE.enabled:false). EVO mecánica #121 (serializa tras #120 STRIKE_COMMIT_SURGE LIVE&served 17b956823d40/815, base HEAD ff88293) — EJE FRESCO + CANAL FRESCO, ⊥ a las 62 LIVE #59-#120. AÑADE la dimensión de DISTRIBUCIÓN-DE-OBJETIVOS a la familia COMPOSICIÓN-DE-INTENCIÓN (#118 fracción-sobre-el-héroe / #120 sub-estado).
// (A) EJE FRESCO = ENTROPÍA de SHANNON NORMALIZADA = targetSpreadField(hero) = S = H(targets)/ln(nPlayers). Por cada jugador j de la party VIVA en radio se cuenta cⱼ=#mobs-ENGANCHADOS que targetean a j, N=Σcⱼ, pⱼ=cⱼ/N, H=−Σpⱼ·ln(pⱼ), S=H/ln(P). targetSpreadBand: ≥hiSpread(0.67) ⇒ scattered ⇒ 2; ≥midSpread(0.34) ⇒ divided ⇒ 1; <mid ⇒ 0. Requiere ≥minMobs(3) enganchados y ≥minPlayers(2) jugadores. INTENSIVO/ADIMENSIONAL. SNAPSHOT PURO (lee la aggro-table directo, como #118/#120). 🔑 INTRÍNSECAMENTE MULTIJUGADOR: single-player ⇒ P=1 ⇒ ln(1)=0 ⇒ degenerado ⇒ S=0 (colapso LIMPIO).
//     CRUX ⊥#118 AGGRO-FOCUS (DISTRIBUCIÓN vs NIVEL-sobre-el-héroe; 4-cuad índice0=héroe): TODO-sobre-héroe counts=[N,0,0,0] ⇒ focus1/spread0; UNIFORME-4 counts=[k,k,k,k] ⇒ focus0.25/spread1; TODO-sobre-uno-NO-héroe counts=[0,N,0,0] ⇒ focus0/spread0; idle ⇒ ambos0 ⇒ focus mapea a spread 0 Y 1 ⇒ DISOCIAN. CRUX ⊥#120 STRIKE-COMMIT (distribución ⊥ sub-estado: 0%-comprometido-uniforme-4 ⇒ strikeCommit0/spread-alto; 100%-comprometido-sobre-héroe ⇒ strikeCommit2/spread0). ⊥#87 (entropía normalizada invariante al conteo).
// (B) CANAL FRESCO = targetSpreadFind (fichas de dispersión por rematar con la manada ENGANCHADA repartiendo su aggro sobre TODA la party — NINGUNA de las 62 flags lo usa; ⊥ aggroFocusFind #118/strikeCommitFind #120). Moneda FRESCA (h.targetSpreadBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2706-targetspread-selfverify.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2706");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

const Z = { forest: [192, 723] };
const FPARG = 397;
// spreadProbe LUT esperada: counts→H→S→banda→{tier,charge}. UMBRALES hiSpread 0.67 / midSpread 0.34 + normalización por ln(P) + colapso single-player (P<2 ⇒ 0).
const EXPECT_SPREAD = [
  { counts: [1, 0], P: 2, s: 0.000, w: 0 },              // concentrado en 1 de 2 ⇒ S0 ⇒ 0
  { counts: [1, 1], P: 2, s: 1.000, w: 2 },              // uniforme 2 ⇒ S1 (max) ⇒ scattered ⇒ 2
  { counts: [1, 1, 1, 1], P: 4, s: 1.000, w: 2 },        // uniforme 4 ⇒ S1 ⇒ 2
  { counts: [3, 3, 3, 3], P: 4, s: 1.000, w: 2 },        // uniforme 4 (escalado) ⇒ S1 ⇒ 2 (invariante al conteo)
  { counts: [3, 1], P: 2, s: 0.811, w: 2 },              // 3:1 ⇒ S0.811 ≥hiSpread ⇒ 2
  { counts: [4, 1], P: 2, s: 0.722, w: 2 },              // 4:1 ⇒ S0.722 ≥hiSpread ⇒ 2
  { counts: [5, 1], P: 2, s: 0.650, w: 1 },              // 5:1 ⇒ S0.650 <hiSpread(0.67) ≥midSpread ⇒ divided ⇒ 1
  { counts: [9, 1], P: 2, s: 0.469, w: 1 },              // 9:1 ⇒ S0.469 ≥midSpread ⇒ 1
  { counts: [3, 3, 0, 0], P: 4, s: 0.500, w: 1 },        // repartido sobre 2 de 4 ⇒ S0.5 ≥midSpread ⇒ 1
  { counts: [5, 0, 0, 0], P: 4, s: 0.000, w: 0 },        // todo sobre 1 de 4 ⇒ S0 ⇒ 0
  { counts: [5], P: 1, s: 0.000, w: 0 },                 // 🔑 single-player degenerado ⇒ P=1 ⇒ S0 ⇒ 0 (colapso LIMPIO)
];
// driveSpread por distribución REAL: inyecta party sintética (P=hero+extra) + mobs (chase=enganchados) con target ⇒ S=H(targets)/ln(P). Requiere ≥minMobs(3) enganchados y ≥minPlayers(2).
const EXPECT_DRIVE = [
  { name: "4eng-even-4p", players: 3, tgts: [0, 1, 2, 3], s: 1.000, w: 2 },       // P4, 1 c/u ⇒ uniforme ⇒ 2
  { name: "6eng-even-3p", players: 2, tgts: [0, 0, 1, 1, 2, 2], s: 1.000, w: 2 }, // P3, 2 c/u ⇒ uniforme ⇒ 2
  { name: "all-on-hero-3p", players: 2, tgts: [0, 0, 0, 0], s: 0.000, w: 0 },     // P3 pero todo sobre héroe(0) ⇒ concentrado ⇒ 0
  { name: "all-on-nonhero-3p", players: 2, tgts: [1, 1, 1, 1], s: 0.000, w: 0 },  // todo sobre jugador1 ⇒ concentrado NO-héroe ⇒ 0
  { name: "3-1-split-2p", players: 1, tgts: [0, 0, 0, 1], s: 0.811, w: 2 },       // P2, 3:1 ⇒ S0.811 ⇒ 2
  { name: "split-2of4", players: 3, tgts: [0, 0, 1, 1], s: 0.500, w: 1 },         // P4, repartido sobre 2 ⇒ S0.5 ⇒ 1
  { name: "single-player", players: 0, tgts: [0, 0, 0, 0], s: 0.000, w: 0 },      // 🔑 P1 (sólo héroe) ⇒ degenerado ⇒ 0
  { name: "2eng-<minMobs", players: 1, tgts: [0, 1], s: 0.000, w: 0 },            // 2 enganchados <minMobs3 ⇒ 0
];
const POS = [[120, 0], [0, 120], [-120, 0], [90, 60], [-60, 90], [40, -110]];
const PLAYER_OFF = [[44, 0], [0, 44], [-44, 0], [30, 30], [-30, 30]];   // offsets de jugadores sintéticos (dentro de radio 300)

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
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await toPlay(page);
  const build = await page.evaluate(() => window.__BUILD || null);

  // 1 boot + hooks
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.targetSpread && window.__dev.strikeCommit && window.__dev.aggroFocus && window.__dev.encircle && window.__dev.packHarvest && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.targetSpread + peer hooks (strikeCommit/aggroFocus/encircle/packHarvest) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 byte-id OFF fresh boot
  const dark = await page.evaluate(() => window.__dev.targetSpread());
  ok("2 byte-id OFF (fresh boot): TARGET_SPREAD_SURGE.enabled false AND G.targetSpreadBounty NUNCA se crea (gExists false) AND G._spreadParty NUNCA se crea (partyExists false)",
     dark.enabled === false && dark.gExists === false && dark.partyExists === false && dark.tier === 0 && dark.score === 0 && dark.idx === 0 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "targetSpreadFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiSpread=${dark.hiSpread} midSpread=${dark.midSpread} minMobs=${dark.minMobs} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save OFF has no targetSpreadFind/targetSpreadBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(targetSpreadFind|targetSpreadBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"targetSpreadBounty"\s*:/.test(saveOff);
  ok("3 byte-id save OFF: sin clave 'targetSpreadFind'/'targetSpreadBounty' (fichas transitorias; estado 100% derivado)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.targetSpread({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.targetSpread({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ spreadProbe LUT: counts→ENTROPÍA→S→band→tier→charge (UMBRALES hiSpread/midSpread + normalización ln(P) + colapso single-player).
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.targetSpread({ spreadProbe: { counts: c.counts, P: c.P } }).spreadProbe), EXPECT_SPREAD);
  const tabOK = EXPECT_SPREAD.every((c, i) => tab[i] && tab[i].weight === c.w && Math.abs(tab[i].spread - c.s) < 0.005);
  ok("5 ★ spreadProbe LUT (ENTROPÍA de Shannon normalizada): [1,1]P2⇒1.0/2, [1,1,1,1]P4⇒1.0/2, [3,3,3,3]P4⇒1.0/2, [3,1]⇒0.811/2, [4,1]⇒0.722/2, [5,1]⇒0.650/1, [9,1]⇒0.469/1, [3,3,0,0]P4⇒0.5/1, [5,0,0,0]P4⇒0/0, [1,0]⇒0/0, [5]P1⇒0/0 (single-player LIMPIO). UMBRAL hiSpread 0.67/midSpread 0.34",
     tabOK, JSON.stringify(tab.map(x => ({ c: x.counts, P: x.players, s: x.spread, w: x.weight, t: x.tier, ch: x.charge }))));

  // 5b ★ REAL SERVER-AUTH DISTRIBUCIÓN: driveSpread inyecta party sintética (hero+extra) + mobs con target ⇒ S=H(targets)/ln(P) REAL.
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z, POS, PLAYER_OFF } = args;
    window.__dev.targetSpread({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, c.players).map(([dx, dy]) => ({ dx, dy }));
      const pts = c.tgts.map((tg, i) => ({ dx: POS[i % POS.length][0], dy: POS[i % POS.length][1], type: "rat", state: "chase", tgt: tg }));
      const dv = window.__dev.targetSpread({ driveSpread: { players, pts, wipe: true } }).driveSpread;
      const live = window.__dev.targetSpread({ spreadProbeLive: true }).spreadProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, engaged: live.engaged, livePlayers: live.players, counts: live.counts });
    }
    window.__dev.targetSpread({ clearSpread: true });
    window.__dev.targetSpread({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z, POS, PLAYER_OFF });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && Math.abs(comp[i].dvIdx - c.s) < 0.005 && Math.abs(comp[i].liveField - c.s) < 0.005);
  ok("5b ★ REAL SERVER-AUTH DISTRIBUCIÓN: driveSpread (party sintética + mobs con target) ⇒ S=H/ln(P) ⇒ even-4p=1.0/2, even-3p=1.0/2, all-on-hero=0/0, all-on-nonhero=0/0, 3-1=0.811/2, split-2of4=0.5/1, single-player(P1)=0/0, 2eng(<minMobs)=0/0",
     compOK, JSON.stringify(comp));

  // 6 ★ ⊥#118 AGGRO-FOCUS crux (4 cuadrantes, DISTRIBUCIÓN vs NIVEL-sobre-el-héroe): spread=entropía del reparto; focusMP=counts[0]/N (fracción sobre el HÉROE, la def MULTIJUGADOR). DISOCIAN.
  const crux118 = await page.evaluate((cases) => {
    const spreadOf = (counts, P) => window.__dev.targetSpread({ spreadProbe: { counts, P } }).spreadProbe;
    const focusMP = (counts) => { const N = counts.reduce((a, b) => a + b, 0); return N > 0 ? +(counts[0] / N).toFixed(3) : 0; };
    const qa = { p: spreadOf([6, 0, 0, 0], 4), f: focusMP([6, 0, 0, 0]) };   // TODO-sobre-héroe ⇒ spread0/focus1
    const qb = { p: spreadOf([3, 3, 3, 3], 4), f: focusMP([3, 3, 3, 3]) };   // UNIFORME-4 ⇒ spread2/focus0.25
    const qc = { p: spreadOf([0, 6, 0, 0], 4), f: focusMP([0, 6, 0, 0]) };   // TODO-sobre-uno-NO-héroe ⇒ spread0/focus0
    const qd = { p: spreadOf([0, 0, 0, 0], 4), f: focusMP([0, 0, 0, 0]) };   // idle (N=0) ⇒ spread0/focus0
    return { qa: { spread: qa.p.weight, s: qa.p.spread, focus: qa.f }, qb: { spread: qb.p.weight, s: qb.p.spread, focus: qb.f }, qc: { spread: qc.p.weight, s: qc.p.spread, focus: qc.f }, qd: { spread: qd.p.weight, s: qd.p.spread, focus: qd.f } };
  }, {});
  const crux118OK = crux118.qa.spread === 0 && crux118.qa.focus === 1
    && crux118.qb.spread === 2 && Math.abs(crux118.qb.focus - 0.25) < 0.005
    && crux118.qc.spread === 0 && crux118.qc.focus === 0
    && crux118.qd.spread === 0 && crux118.qd.focus === 0;
  ok("6 ★ ⊥#118 AGGRO-FOCUS crux (4-cuad, DISTRIBUCIÓN vs NIVEL-sobre-el-héroe, índice0=héroe): TODO-sobre-héroe ⇒ SPREAD 0/FOCUS 1.0; UNIFORME-4 ⇒ SPREAD 2/FOCUS 0.25; TODO-sobre-uno-NO-héroe ⇒ SPREAD 0/FOCUS 0; idle ⇒ SPREAD 0/FOCUS 0 ⇒ focus mapea a spread 0 (focus1) Y (focus0) Y spread MAX en focus0.25 ⇒ INDEPENDIENTES (el cuad c es la clave: AMBOS bajos por RAZONES DISTINTAS)",
     crux118OK, JSON.stringify(crux118));

  // 7 ★ ⊥#120 STRIKE-COMMIT crux (DISTRIBUCIÓN-de-objetivo vs SUB-ESTADO-de-combate): mismos mobs inyectados ⇒ spread lee el target, strikeCommit lee windup|strike.
  const crux120 = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.targetSpread({ enabled: true });   // strikeCommit ya es LIVE (#120 enabled:true)
    // Qa: 0%-comprometido (todo chase) repartido UNIFORME sobre 4 jugadores ⇒ strikeCommit0 / spread2
    window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const playersA = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const ptsA = [0, 1, 2, 3].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg }));
    const dvA = window.__dev.targetSpread({ driveSpread: { players: playersA, pts: ptsA, wipe: true } }).driveSpread;
    const scA = window.__dev.strikeCommit().score;
    // Qb: 100%-comprometido (todo strike) TODO-sobre-héroe ⇒ strikeCommit2 / spread0
    window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const playersB = PLAYER_OFF.slice(0, 2).map(([dx, dy]) => ({ dx, dy }));
    const ptsB = [0, 0, 0, 0].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "strike", tgt: tg }));
    const dvB = window.__dev.targetSpread({ driveSpread: { players: playersB, pts: ptsB, wipe: true } }).driveSpread;
    const scB = window.__dev.strikeCommit().score;
    window.__dev.targetSpread({ clearSpread: true });
    window.__dev.targetSpread({ enabled: false });
    return { qa: { spread: dvA.score, strikeCommit: scA }, qb: { spread: dvB.score, strikeCommit: scB } };
  }, { Z, POS, PLAYER_OFF });
  const crux120OK = crux120.qa.spread === 2 && crux120.qa.strikeCommit === 0 && crux120.qb.spread === 0 && crux120.qb.strikeCommit === 2;
  ok("7 ★ ⊥#120 STRIKE-COMMIT crux (distribución-de-objetivo ≠ sub-estado): 0%-comprometido-uniforme-4 ⇒ SPREAD 2/STRIKECOMMIT 0; 100%-comprometido-sobre-héroe ⇒ SPREAD 0/STRIKECOMMIT 2 ⇒ spread mapea a strikeCommit 0 Y 2 ⇒ INDEPENDIENTES (a QUIÉN apuntan ⊥ en qué sub-estado están)",
     crux120OK, JSON.stringify(crux120));

  // 8 ★ SINGLE-PLAYER DEGENERADO / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs uniformes, SIN party (P=1) ⇒ S=0; CON party (P≥2) ⇒ S>0.
  const degen = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.targetSpread({ enabled: true });
    const drive = (nPlayers, tgts) => { window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, nPlayers).map(([dx, dy]) => ({ dx, dy }));
      const pts = tgts.map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg }));
      const dv = window.__dev.targetSpread({ driveSpread: { players, pts, wipe: true } }).driveSpread;
      const live = window.__dev.targetSpread({ spreadProbeLive: true }).spreadProbeLive;
      return { idx: dv.idx, score: dv.score, players: live.players }; };
    const sp = drive(0, [0, 0, 0, 0]);        // single-player: P=1 (sólo héroe) ⇒ S=0 (colapso)
    const mp = drive(3, [0, 1, 2, 3]);        // multijugador: P=4 uniforme ⇒ S=1 (bien-definido)
    window.__dev.targetSpread({ clearSpread: true });
    window.__dev.targetSpread({ enabled: false });
    return { sp, mp };
  }, { Z, POS, PLAYER_OFF });
  const degenOK = degen.sp.players === 1 && degen.sp.idx === 0 && degen.sp.score === 0 && degen.mp.players === 4 && degen.mp.score === 2 && Math.abs(degen.mp.idx - 1) < 0.005;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: mismos mobs uniformes SIN party (P=1) ⇒ S=0/score0; CON party (P=4) ⇒ S=1.0/score2 ⇒ la métrica colapsa LIMPIO en single-player y se ilumina sólo con party genuina",
     degenOK, JSON.stringify(degen));

  // 9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 3-mobs-even-3p y 6-mobs-even-3p ⇒ MISMA S=1.0/score2 (entropía normalizada invariante al conteo) mientras packHarvest (conteo) difiere.
  const countInv = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.targetSpread({ enabled: true });
    const drive = (tgts) => { window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const players = PLAYER_OFF.slice(0, 2).map(([dx, dy]) => ({ dx, dy }));
      const pts = tgts.map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg }));
      const dv = window.__dev.targetSpread({ driveSpread: { players, pts, wipe: true } }).driveSpread;
      return { idx: dv.idx, score: dv.score, pack: window.__dev.packHarvest().score }; };
    const three = drive([0, 1, 2]);           // 3 mobs, P3, 1 c/u ⇒ S1
    const six = drive([0, 0, 1, 1, 2, 2]);    // 6 mobs, P3, 2 c/u ⇒ S1
    window.__dev.targetSpread({ clearSpread: true });
    window.__dev.targetSpread({ enabled: false });
    return { three, six };
  }, { Z, POS, PLAYER_OFF });
  const countInvOK = Math.abs(countInv.three.idx - countInv.six.idx) < 0.001 && countInv.three.score === 2 && countInv.six.score === 2;
  ok("9 ★ CONTEO-INVARIANCIA (INTENSIVO ⊥#87 PACKHARVEST): 3-mobs-even-3p y 6-mobs-even-3p ⇒ MISMA S=1.0 y score 2 (entropía normalizada invariante al conteo) mientras packHarvest (EXTENSIVO/conteo) cambia",
     countInvOK, JSON.stringify(countInv));

  // 10 CANAL targetSpreadFind: forageChargePreview con reparto amplio >0 ; concentrado → 0
  const forage = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.targetSpread({ enabled: true });
    window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.targetSpread({ driveSpread: { players, pts: [0, 1, 2, 3].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg })), wipe: true } });   // S1.0 ⇒ score2 ⇒ T2
    const actVm = window.__dev.targetSpread();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.targetSpread({ driveSpread: { players, pts: [0, 0, 0, 0].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg })), wipe: true } });   // concentrado ⇒ S0 ⇒ score0
    const goVm = window.__dev.targetSpread();
    window.__dev.targetSpread({ clearSpread: true });
    window.__dev.targetSpread({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z, POS, PLAYER_OFF });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL targetSpreadFind: forageChargePreview con manada scattered (S1.0) ⇒ charge>0 (==targetSpreadBonus); con manada concentrada (S0) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP: charge never exceeds targetSpreadBountyCap=2
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let d = 1; d <= 8; d++) vals.push(window.__dev.targetSpread({ spreadProbe: { counts: Array.from({ length: d }, () => 1), P: d } }).spreadProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.targetSpread().cap };
  });
  ok("11 ★ SUB-CAP: ningún reparto produce charge>targetSpreadBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF: OFF ⇒ charge 0 + forageChargePreview 0 even with a scattered pack available
  const neutral = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.targetSpread({ enabled: true });
    window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    window.__dev.targetSpread({ driveSpread: { players, pts: [0, 1, 2, 3].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg })), wipe: true } });   // manada scattered disponible
    window.__dev.targetSpread({ enabled: false });                          // now OFF
    const off = window.__dev.targetSpread();
    window.__dev.targetSpread({ enabled: true }); window.__dev.targetSpread({ clearSpread: true }); window.__dev.targetSpread({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx };
  }, { Z, POS, PLAYER_OFF });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0;
  ok("12 ★ BYTE-NEUTRAL OFF: con OFF, targetSpreadBonus(pack scattered disponible)==0 + forageChargePreview==0 + idx==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY: toggling strikeCommit/aggroFocus/encircle no cambia la señal de targetSpread.
  const orth = await page.evaluate((args) => {
    const { Z, POS, PLAYER_OFF } = args;
    window.__dev.targetSpread({ enabled: true });
    window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const before = window.__dev.targetSpread({ driveSpread: { players, pts: [0, 1, 2, 0].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg })), wipe: true } }).driveSpread;
    const snap = () => JSON.stringify({ strikeCommit: window.__dev.strikeCommit(), aggroFocus: window.__dev.aggroFocus(), encircle: window.__dev.encircle() });
    const peersOn = snap();
    const scPrev = window.__dev.strikeCommit().enabled, afPrev = window.__dev.aggroFocus().enabled, enPrev = window.__dev.encircle().enabled;
    window.__dev.strikeCommit({ enabled: !scPrev }); window.__dev.aggroFocus({ enabled: !afPrev }); window.__dev.encircle({ enabled: !enPrev });
    const after = window.__dev.targetSpread({ spreadProbeLive: true }).spreadProbeLive;
    window.__dev.strikeCommit({ enabled: scPrev }); window.__dev.aggroFocus({ enabled: afPrev }); window.__dev.encircle({ enabled: enPrev });
    const peersRestored = snap();
    window.__dev.targetSpread({ clearSpread: true });
    window.__dev.targetSpread({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && Math.abs(before.idx - after.field) < 0.001;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeIdx: before.idx, afterField: after.field };
  }, { Z, POS, PLAYER_OFF });
  ok("13 ★ ORTOGONALIDAD targetSpreadFind ⊥ peers: la señal de dispersión (score/S) NO cambia al togglear STRIKE-COMMIT #120/AGGRO-FOCUS #118/ENCIRCLE #113; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION: 62 arc flags served true; TARGET_SPREAD_SURGE served false
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const flag = (name) => { const m = cfgSrc.match(new RegExp("export const " + name + "\\s*=\\s*\\{[\\s\\S]*?enabled:\\s*(true|false)")); return m ? m[1] : "?"; };
  const arc = ["WARDING_RING", "KINSHIP_BOND", "WAYFARER_ROAM", "FOCUS_FIRE", "TRAILCRAFT", "DELVE", "ERUDITION", "NOCTURNE_HUNT", "CADENCE_RUSH", "TEMPEST_SURGE", "LAST_STAND", "FIRM_FOOTING", "SHADOW_STALK", "SCARCITY_EDGE", "APEX_PROXIMITY", "MOB_AFFIX_DANGER", "ZONE_EVENT_SURGE", "ENCOUNTER_VARIANT_SURGE", "ARENA_HAZARD_SURGE", "BOSS_ENRAGE_SURGE", "SPOILS_FIELD_SURGE", "CARNAGE_FIELD_SURGE", "CROSSFIRE_FRAY_SURGE", "MAELSTROM_FIELD_SURGE", "BLIGHT_HARVEST_SURGE", "SKIRMISH_LINE_SURGE", "CONTROL_HARVEST_SURGE", "BLOODHARVEST_SURGE", "PACKHARVEST_SURGE", "LONGSHOT_SURGE", "INTERRUPT_SURGE", "HEADING_SURGE", "ZONETIER_SURGE", "BULK_SURGE", "ROLE_SURGE", "SWIFT_SURGE", "MENACE_SURGE", "TOUGH_SURGE", "SENTINEL_SURGE", "RAM_SURGE", "WINDUP_SURGE", "RECOVER_SURGE", "LUNGE_SURGE", "GEARCHANCE_SURGE", "GOLD_SURGE", "SPLASH_SURGE", "BANE_SURGE", "MOTLEY_SURGE", "DISPERSE_SURGE", "FLANK_SURGE", "COLUMN_SURGE", "ORIENT_SURGE", "SPEED_SURGE", "CONVERGE_SURGE", "ENCIRCLE_SURGE", "DEPTH_SURGE", "SIZECLASS_SURGE", "ORBIT_SURGE", "ACCEL_SURGE", "AGGRO_FOCUS_SURGE", "JERK_DIR_SURGE", "STRIKE_COMMIT_SURGE"];
  const arcLive = arc.map(f => [f, flag(f)]);
  const arcAllOn = arcLive.every(([, v]) => v === "true");
  const tsDark = flag("TARGET_SPREAD_SURGE") === "false";
  ok("14 ★ 0-REGRESIÓN: 62 mecanismos del arco #59-#120 served enabled:true; TARGET_SPREAD_SURGE served false (DARK #121)",
     arcAllOn && tsDark && arc.length === 62, `targetSpread=${flag("TARGET_SPREAD_SURGE")} arcAllOn=${arcAllOn} n=${arc.length} off=${JSON.stringify(arcLive.filter(([, v]) => v !== "true"))}`);

  // 15 render badge "Dispersión:" drawn ON+scattered / not OFF + fps.
  const badge = await page.evaluate(async (args) => {
    const { Z, POS, PLAYER_OFF } = args;
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const drive = () => window.__dev.targetSpread({ driveSpread: { players, pts: [0, 1, 2, 3].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg })), wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Reparto:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.targetSpread({ enabled: true });
    window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    // NOTA: el badge lee targetSpreadVM en vivo; el loop rAF re-tickea la IA (los mobs chase inyectados pueden moverse/cambiar) ⇒ re-inyecta cada frame para probar el DIBUJO en estado scattered.
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.targetSpread({ clearSpread: true });
    window.__dev.targetSpread({ enabled: false });
    const enAtOff = window.__dev.targetSpread().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z, POS, PLAYER_OFF });
  ok("15 render badge \"Reparto:\" se DIBUJA ON+scattered (S>0, re-driven cada frame) y NO OFF (S 0) + fps sano",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z, POS, PLAYER_OFF } = args; const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy })); window.__dev.targetSpread({ enabled: true }); window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.targetSpread({ driveSpread: { players, pts: [0, 1, 2, 3].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg })), wipe: true } }); }, { Z, POS, PLAYER_OFF });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.targetSpread({ clearSpread: true }); window.__dev.targetSpread({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence.
  await sleep(500);
  const pageB = await browser.newPage();
  await pageB.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const errB = []; pageB.on("pageerror", (e) => errB.push(String(e)));
  pageB.on("console", (m) => { if (m.type() === "error") errB.push(m.text()); });
  await pageB.evaluateOnNewDocument(() => { try { for (const k of Object.keys(localStorage)) if (/mithralda/i.test(k)) localStorage.removeItem(k); } catch (e) {} });
  await pageB.goto(base + "/index.html?dev=1", { waitUntil: "domcontentloaded" });
  await pageB.bringToFront();
  await toPlay(pageB);
  const readVM = async (pg) => await pg.evaluate((args) => {
    const { Z, FPARG, POS, PLAYER_OFF } = args;
    const players = PLAYER_OFF.slice(0, 3).map(([dx, dy]) => ({ dx, dy }));
    const pts = [0, 1, 2, 0].map((tg, i) => ({ dx: POS[i][0], dy: POS[i][1], type: "rat", state: "chase", tgt: tg }));   // P4, counts=[2,1,1,0] ⇒ S≈0.750 ⇒ scattered ⇒ 2
    window.__dev.targetSpread({ enabled: true });
    window.__dev.targetSpread({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.targetSpread({ driveSpread: { players, pts, wipe: true } }).driveSpread;
    const vm = window.__dev.targetSpread();
    const lut = [[1, 0], [1, 1], [3, 1], [1, 1, 1, 1]].map(counts => { const p = window.__dev.targetSpread({ spreadProbe: { counts, P: counts.length } }).spreadProbe; return { c: counts, s: p.spread, tier: p.tier, charge: p.charge }; });
    const live = window.__dev.targetSpread({ spreadProbeLive: true }).spreadProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.targetSpread({ clearSpread: true });
    window.__dev.targetSpread({ enabled: false });
    return { score: dv.score, idx: dv.idx, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, engaged: live.engaged, players: live.players, counts: live.counts, lut, fp };
  }, { Z, FPARG, POS, PLAYER_OFF });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.engaged === B.engaged && A.players === B.players && JSON.stringify(A.counts) === JSON.stringify(B.counts) && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  ok("16 ★ NORTH STAR 2-CLIENTE: MISMA party+formación (P4, counts=[2,1,1,0], S≈0.750)+héroe ⇒ score/idx/tier/charge + spreadProbeLive(field,engaged,players,counts,score) + spreadProbe LUT + worldFingerprint IDÉNTICOS byte-a-byte (0 desync)",
     conv, `A={score:${A.score},idx:${A.idx},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},engaged:${A.engaged},players:${A.players},counts:${JSON.stringify(A.counts)},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},engaged:${B.engaged},players:${B.players},counts:${JSON.stringify(B.counts)},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp}`);
  await page.evaluate(() => window.__dev.targetSpread({ enabled: false }));
  await pageB.evaluate(() => window.__dev.targetSpread({ enabled: false }));

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
