// CAS-2843 — POST-FLIP LIVE QA for CONJURO (CO_CAST_SURGE.enabled:TRUE LIVE, EVO#146, 88º flag). Base master 696036a (a8d82ff DARK → 92c9e90 flip false→true → 696036a version stamp b8c147402d1f/815), served LIVE carlosdcastrosa-cloud.github.io/Mithralda-Online.
// Derivado del DARK self-verify cas2840 con: ck2 INVERTIDO LIVE-ON (enabled TRUE, solo boot ⇒ U≤1 ⇒ score/tier/charge colapsan LIMPIO), ck14 CENSUS INVERTIDO (74/74 enabled:true off=[]), + ck18 SERVED-LIVE-BUILD (root200 + version.json b8c147402d1f/815 + served config CO_CAST_SURGE enabled:true + census 74/74). Gameplay/determinismo corre contra checkout local NO-DRIFT (HEAD==origin==696036a, byte-idéntico a lo servido); ck18 verifica los BYTES SERVIDOS. ck16 North Star asserta charge>0 (co-cast bounty grants en el build ON).
// (A) EJE = CONJURO/CO-CAST = U = nº de jugadores VIVOS DISTINTOS con un flag de activación-de-habilidad (`cast`) ACTIVO este frame (co-cast/ability-sync). Tally BOOLEANO ENTERO (CERO float; conteo CONMUTATIVO ⇒ orden-independiente) vs umbrales ENTEROS {midCast2,hiCast3}. U≥3 ⇒ sync-pleno ⇒ 2; U≥2 ⇒ sync-parcial ⇒ 1; <2 ⇒ 0. ⊥ #139 SOCORRO (ANY-ABILITY ⊥ SUPPORT-ONLY), ⊥ #138 CUADRILLA (casting ⊥ killing), ⊥ #144 DIANA (activar ⊥ compartir-objetivo), ⊥ #145 TENAZA (evento ⊥ geometría). 🔑 MULTIJUGADOR-NATIVO: single-player ⇒ ≤1 caster ⇒ U colapsa ⇒ 0.
// (B) CANAL = coCastFind (fichas de conjuro por rematar con la sincronía ACREDITADA). Moneda FRESCA (h.coCastBounty, TRANSITORIA, fuera del save allowlist + worldFingerprint).
//
// Run: node tools/cas2843-cocast-live-qa.mjs
import puppeteer from "puppeteer-core";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { startServer, findChromium, LAUNCH_ARGS, ROOT } from "./harness.mjs";

const LIVE_BASE = "https://carlosdcastrosa-cloud.github.io/Mithralda-Online";

const exe = findChromium();
if (!exe) { console.error("no chromium"); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = join(ROOT, "shots", "cas2843");
try { mkdirSync(OUT, { recursive: true }); } catch (e) {}

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra = "") => { (cond ? PASS++ : FAIL++);
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };
const isEnvErr = (t) => /ERR_INSUFFICIENT_RESOURCES|Failed to load resource|ERR_NETWORK|ERR_CONNECTION|ERR_ABORTED|net::ERR_/i.test(String(t));

const Z = { forest: [192, 723] };
const FPARG = 397;
// castProbe LUT esperada: (casters,players)→U=clamp(casters,0,players)→banda(U vs {midCast2,hiCast3,minPlayers2} ENTEROS)→{weight,rankTier}.
const EXPECT_CAST = [
  { name: "solo-P1",       casters: 1, players: 1, U: 1, w: 0 },
  { name: "duo-P2",        casters: 2, players: 2, U: 2, w: 1 },
  { name: "duo-of-4",      casters: 2, players: 4, U: 2, w: 1 },
  { name: "trio-P3",       casters: 3, players: 3, U: 3, w: 2 },
  { name: "quad-4",        casters: 4, players: 4, U: 4, w: 2 },
  { name: "none",          casters: 0, players: 3, U: 0, w: 0 },
  { name: "one-of-4",      casters: 1, players: 4, U: 1, w: 0 },
  { name: "clamp-players", casters: 9, players: 3, U: 3, w: 2 },
];
// driveCast REAL: roster sintético (P jugadores con {cast,dead}) ⇒ U server-auth = # jugadores VIVOS con el flag `cast`. filas: [cast, dead].
const EXPECT_DRIVE = [
  { name: "duo-cast",          players: [[true, false], [true, false]],                         U: 2, w: 1 },
  { name: "one-cast",          players: [[true, false], [false, false]],                        U: 1, w: 0 },
  { name: "solo",              players: [[true, false]],                                        U: 1, w: 0 },
  { name: "trio-cast",         players: [[true, false], [true, false], [true, false]],          U: 3, w: 2 },
  { name: "noncast-excluded",  players: [[true, false], [true, false], [false, false]],         U: 2, w: 1 },
  { name: "dead-excluded",     players: [[true, false], [true, false], [true, true]],           U: 2, w: 1 },
  { name: "quad-cast",         players: [[true, false], [true, false], [true, false], [true, false]], U: 4, w: 2 },
  { name: "all-idle",          players: [[false, false], [false, false], [false, false]],       U: 0, w: 0 },
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
  const hooks = await page.evaluate(() => !!(window.__dev && window.__dev.coCast && window.__dev.coFlank && window.__dev.coFocus && window.__dev.coAdvance && window.__dev.coCohesion && window.__dev.coFlee && window.__dev.coTank && window.__dev.coSupport && window.__dev.coKill && window.__dev.coPresence && window.__dev.coStrike && window.__dev.partyVital && window.__dev.saveBlob && window.__dev.worldFingerprint));
  ok("1 boots to play, __dev.coCast + peer hooks (coFlank/coFocus/coAdvance/coCohesion/coFlee/coTank/coSupport/coKill/coPresence/coStrike/partyVital) + __BUILD present, 0 err", hooks && errors.length === 0 && !!build, `build=${build} err=${errors.length}`);

  // 2 LIVE-ON fresh boot (INVERTED from DARK): CO_CAST_SURGE.enabled TRUE; solo hero fresh boot, SIN party sintética ⇒ U≤1 < midCast2 ⇒ SCORE/DECISIÓN colapsan LIMPIO. Multijugador-nativo: IMPOSIBLE co-castear en solitario. 🔑 NO asertamos gExists/partyExists false (con enabled:true PUEDEN materializarse) — aserta el COLAPSO DE DECISIÓN.
  const dark = await page.evaluate(() => window.__dev.coCast());
  ok("2 LIVE-ON (fresh solo boot): CO_CAST_SURGE.enabled TRUE AND sin sincronía (U≤1) ⇒ score/tier/charge/preview colapsan LIMPIO a 0 AND channel coCastFind AND tag vacío",
     dark.enabled === true && dark.tier === 0 && dark.score === 0 && dark.cast <= 1 && dark.charge === 0 && dark.forageChargePreview === 0 && dark.channel === "coCastFind" && dark.tag === "",
     `enabled=${dark.enabled} gExists=${dark.gExists} partyExists=${dark.partyExists} tier=${dark.tier} score=${dark.score} idx=${dark.idx} players=${dark.players} cast=${dark.cast} charge=${dark.charge} preview=${dark.forageChargePreview} channel=${dark.channel} tag="${dark.tag}" hiCast=${dark.hiCast} midCast=${dark.midCast} minPlayers=${dark.minPlayers} weights=${JSON.stringify(dark.weights)}`);

  // 3 save has no coCastFind/coCastBounty key
  const saveOff = await page.evaluate(() => JSON.stringify(window.__dev.saveBlob()));
  const noFeatKey = !/"(coCastFind|coCastBounty)[A-Za-z]*"\s*:/.test(saveOff);
  const noChargeKey = !/"coCastBounty"\s*:/.test(saveOff);
  ok("3 byte-id save: sin clave 'coCastFind'/'coCastBounty' (fichas transitorias, fuera del save allowlist)", noFeatKey && noChargeKey, `noFeatKey=${noFeatKey} noChargeKey=${noChargeKey} len=${saveOff.length}`);

  // 4 worldFingerprint stable across enable toggle
  const fpBefore = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coCast({ enabled: true }));
  const fpAfter = await page.evaluate((a) => JSON.stringify(window.__dev.worldFingerprint(a)), FPARG);
  await page.evaluate(() => window.__dev.coCast({ enabled: false }));
  ok("4 worldFingerprint byte-estable a través del toggle enabled (0 RNG drift; las fichas no entran al fingerprint)", fpBefore === fpAfter, `match=${fpBefore === fpAfter}`);

  // 5 ★ castProbe LUT
  const tab = await page.evaluate((cases) => cases.map(c => window.__dev.coCast({ castProbe: { casters: c.casters, players: c.players } }).castProbe), EXPECT_CAST);
  const tabOK = EXPECT_CAST.every((c, i) => tab[i] && tab[i].weight === c.w && tab[i].cast === c.U);
  ok("5 ★ castProbe LUT (CONJURO U=# casters distintos): solo-P1(U1)⇒0, duo(U2)⇒1, duo-of-4(U2)⇒1, trio(U3)⇒2, quad(U4)⇒2, none(U0)⇒0, one-of-4(U1)⇒0, clamp-players⇒U3. UMBRAL hiCast 3/midCast 2",
     tabOK, JSON.stringify(tab.map((x, i) => ({ nm: EXPECT_CAST[i].name, p: x.players, U: x.cast, w: x.weight, rt: x.rankTier, ch: x.charge }))));

  // 5c ★ REAL SERVER-AUTH CONJURO
  const comp = await page.evaluate((args) => {
    const { EXPECT_DRIVE, Z } = args;
    const mkParty = (rows) => rows.map((r) => ({ cast: !!r[0], dead: !!r[1] }));
    window.__dev.coCast({ enabled: true });
    const out = [];
    for (const c of EXPECT_DRIVE) {
      window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coCast({ driveCast: { players: mkParty(c.players), wipe: true } }).driveCast;
      const live = window.__dev.coCast({ castProbeLive: true }).castProbeLive;
      out.push({ name: c.name, dvIdx: dv.idx, dvCast: dv.cast, dvScore: dv.score, dvPlayers: dv.players, liveField: live.field, liveScore: live.score, liveCast: live.cast, livePlayers: live.players });
    }
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    return out;
  }, { EXPECT_DRIVE, Z });
  const compOK = EXPECT_DRIVE.every((c, i) => comp[i] && comp[i].dvScore === c.w && comp[i].liveScore === c.w && comp[i].dvCast === c.U && comp[i].liveCast === c.U);
  ok("5c ★ REAL SERVER-AUTH CONJURO (tally de banderas cast entre VIVOS): duo-cast(U2)=w1, one-cast(U1)=w0, solo(U1)=w0, trio-cast(U3)=w2, noncast-excl(U2)=w1, dead-excl(U2)=w1, quad-cast(U4)=w2, all-idle(U0)=w0 (filtra muertos + no-casters)",
     compOK, JSON.stringify(comp));

  // 6 ★ CRUX (PRIMARIO) ⊥#139 SOCORRO (ANY-ABILITY ⊥ SUPPORT-ONLY)
  const cruxSup = await page.evaluate(() => {
    const cst = (casters, P) => window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe;
    const aid = (supporting, P) => window.__dev.coSupport({ aidProbe: { supporting, players: P } }).aidProbe;
    const dps = { cst: cst(3, 3), aid: aid(0, 3) };
    const heal = { cst: cst(0, 3), aid: aid(3, 3) };
    return { dps, heal };
  });
  const cruxSupOK =
    cruxSup.dps.cst.cast === 3 && cruxSup.dps.cst.weight === 2 && cruxSup.dps.aid.aid === 0 && cruxSup.dps.aid.weight === 0
    && cruxSup.heal.cst.cast === 0 && cruxSup.heal.cst.weight === 0 && cruxSup.heal.aid.aid === 3 && cruxSup.heal.aid.weight === 2;
  ok("6 ★ CRUX (PRIMARIO) ⊥#139 SOCORRO (ANY-ABILITY ⊥ SUPPORT-ONLY): {3 DPS casteando, 0 heal} ⇒ CONJURO U3/w2 pero SOCORRO S0/w0; {0 cast-genérico, 3 socorredores} ⇒ CONJURO U0/w0 pero SOCORRO S3/w2 ⇒ activar-cualquier-habilidad ⊥ aplicar-soporte (conteos divergen en AMBOS sentidos)",
     cruxSupOK, JSON.stringify(cruxSup));

  // 6b ★ CRUX ⊥#138 CUADRILLA (casting ⊥ killing)
  const cruxKill = await page.evaluate(() => {
    const cst = (casters, P) => window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe;
    const kill = (credited, P) => window.__dev.coKill({ hitProbe: { credited, players: P } }).hitProbe;
    const A = { cst: cst(3, 3), kill: kill(0, 3) };
    const B = { cst: cst(0, 3), kill: kill(3, 3) };
    return { A, B };
  });
  const ckA = cruxKill.A, ckB = cruxKill.B;
  const cruxKillOK = ckA.cst.cast === 3 && ckA.cst.weight === 2 && ckA.kill && ckA.kill.weight === 0
    && ckB.cst.cast === 0 && ckB.cst.weight === 0 && ckB.kill && ckB.kill.weight === 2;
  ok("6b ★ CRUX ⊥#138 CUADRILLA (casting ⊥ killing): {3 casteando, 0 remates} ⇒ CONJURO U3/w2 pero CUADRILLA K0/w0; {0 cast, 3 remates} ⇒ CONJURO U0/w0 pero CUADRILLA w2 ⇒ activar-habilidad ⊥ rematar",
     cruxKillOK, JSON.stringify(cruxKill));

  // 6f ★ CRUX CANAL DISTINTO: coCastFind ⊥ coSupportFind/coKillFind/coFlankFind/coFocusFind.
  const cfgSrc = await page.evaluate(async () => { const r = await fetch("sim/config.js"); return await r.text(); });
  const grab = (n) => (cfgSrc.match(new RegExp("export const " + n + "\\s*=\\s*\\{[\\s\\S]*?channel:\\s*\"([^\"]+)\"")) || [])[1];
  const coCastCh = grab("CO_CAST_SURGE"), coSupCh = grab("CO_SUPPORT_SURGE"), coKillCh = grab("CO_KILL_SURGE"), coFlankCh = grab("CO_FLANK_SURGE"), coFocusCh = grab("CO_FOCUS_SURGE");
  const vmCh = await page.evaluate(() => window.__dev.coCast().channel);
  const chOK = coCastCh === "coCastFind" && vmCh === "coCastFind" && coSupCh === "coSupportFind" && coKillCh === "coKillFind" && coFlankCh === "coFlankFind" && coFocusCh === "coFocusFind"
    && [coSupCh, coKillCh, coFlankCh, coFocusCh].every(c => c !== coCastCh);
  ok("6f ★ CRUX CANAL coCastFind ⊥ coSupportFind #139 / coKillFind #138 / coFlankFind #145 / coFocusFind #144 (canal DISTINTO por construcción; VM idem)",
     chOK, `coCast=${coCastCh} vm=${vmCh} coSup=${coSupCh} coKill=${coKillCh} coFlank=${coFlankCh} coFocus=${coFocusCh}`);

  // 7 ★ U-SENSITIVITY
  const uSens = await page.evaluate(() => {
    const t = (casters, P) => { const m = window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe; return { U: m.cast, w: m.weight }; };
    return { duo: t(2, 4), trio: t(3, 4), quad: t(4, 4) };
  });
  const uSensOK = uSens.duo.U === 2 && uSens.trio.U === 3 && uSens.quad.U === 4 && uSens.duo.w === 1 && uSens.trio.w === 2 && uSens.quad.w === 2;
  ok("7 ★ U-SENSITIVITY (U sube con más casters): 2⇒U2/w1, 3⇒U3/w2, 4⇒U4/w2 (CONJURO mide CUÁNTOS activan simultáneamente)",
     uSensOK, JSON.stringify(uSens));

  // 8 ★ SINGLE-PLAYER DEGENERADO collapse / BIEN-DEFINIDO MULTIJUGADOR
  const degen = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    const drive = (rows) => { window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      const dv = window.__dev.coCast({ driveCast: { players: rows.map(r => ({ cast: !!r[0], dead: !!r[1] })), wipe: true } }).driveCast;
      const live = window.__dev.coCast({ castProbeLive: true }).castProbeLive;
      return { idx: dv.idx, cast: dv.cast, score: dv.score, players: live.players }; };
    const sp = drive([[true, false]]);
    const mp = drive([[true, false], [true, false], [true, false]]);
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    return { sp, mp };
  }, { Z });
  const degenOK = degen.sp.cast === 1 && degen.sp.score === 0 && degen.mp.cast === 3 && degen.mp.score === 2;
  ok("8 ★ SINGLE-PLAYER DEGENERADO ⇒ 0 (LIMPIO) / BIEN-DEFINIDO MULTIJUGADOR: 1 caster ⇒ U1/score0; 3 casteando ⇒ U3/score2 ⇒ colapsa LIMPIO, IMPOSIBLE co-castear en solitario",
     degenOK, JSON.stringify(degen));

  // 9 ★ INTEGER-DETERMINISM
  const det = await page.evaluate(() => {
    const a = window.__dev.coCast({ castProbe: { casters: 3, players: 4 } }).castProbe;
    const b = window.__dev.coCast({ castProbe: { casters: 3, players: 4 } }).castProbe;
    return { a: { U: a.cast, w: a.weight }, b: { U: b.cast, w: b.weight } };
  });
  const detOK = det.a.U === det.b.U && det.a.w === det.b.w && det.a.U === 3;
  ok("9 ★ INTEGER-DETERMINISM: castProbe repetido ⇒ U/weight byte-idénticos (conteo ENTERO de banderas + umbrales {2,3} ENTEROS ⇒ 0-float en el score/decisión)",
     detOK, JSON.stringify(det));

  // 9b ★ ORDER-INDEPENDENCE del conteo
  const orderInv = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    const g = (rows) => { window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
      return window.__dev.coCast({ driveCast: { players: rows.map(r => ({ cast: !!r[0], dead: !!r[1] })), wipe: true } }).driveCast.cast; };
    const a = g([[true, false], [false, false], [true, false]]);
    const b = g([[false, false], [true, false], [true, false]]);
    window.__dev.coCast({ clearCast: true }); window.__dev.coCast({ enabled: false });
    return { a, b };
  }, { Z });
  ok("9b ★ ORDER-INDEPENDENCE del conteo: MISMO roster (2 casters) en 2 órdenes distintos ⇒ MISMO U2 (el conteo es CONMUTATIVO ⇒ orden-independiente ⇒ 2-cliente byte-idéntico sin importar el orden de replicación)",
     orderInv.a === 2 && orderInv.b === 2 && orderInv.a === orderInv.b, JSON.stringify(orderInv));

  // 10 CANAL coCastFind
  const forage = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } });
    const actVm = window.__dev.coCast();
    const actPrev = actVm.forageChargePreview, actCharge = actVm.charge;
    window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: false }], wipe: true } });
    const goVm = window.__dev.coCast();
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    return { actPrev, actCharge, goPrev: goVm.forageChargePreview, goTier: goVm.tier, goScore: goVm.score };
  }, { Z });
  const forageOK = forage.actPrev > 0 && forage.actPrev === forage.actCharge && forage.goPrev === 0 && forage.goTier === 0 && forage.goScore === 0;
  ok("10 CANAL coCastFind: forageChargePreview sync pleno (U≥3) ⇒ charge>0 (==coCastBonus); con solitario (U1) ⇒ 0",
     forageOK, JSON.stringify(forage));

  // 11 ★ SUB-CAP
  const capChk = await page.evaluate(() => {
    const vals = [];
    for (let s = 3; s <= 8; s++) vals.push(window.__dev.coCast({ castProbe: { casters: s, players: s } }).castProbe.charge);
    return { max: Math.max(...vals), cap: window.__dev.coCast().cap };
  });
  ok("11 ★ SUB-CAP: ningún sync pleno produce charge>coCastBountyCap=2 (min(cap,raw))", capChk.max <= 2 && capChk.cap === 2, JSON.stringify(capChk));

  // 12 ★ BYTE-NEUTRAL OFF (aún con enabled TRUE en config, el dev-toggle OFF colapsa a byte-id)
  const neutral = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } });
    window.__dev.coCast({ enabled: false });
    const off = window.__dev.coCast();
    window.__dev.coCast({ enabled: true }); window.__dev.coCast({ clearCast: true }); window.__dev.coCast({ enabled: false });
    return { preview: off.forageChargePreview, charge: off.charge, tier: off.tier, score: off.score, idx: off.idx, cast: off.cast };
  }, { Z });
  const neutOK = neutral.preview === 0 && neutral.charge === 0 && neutral.tier === 0 && neutral.score === 0 && neutral.idx === 0 && neutral.cast === 0;
  ok("12 ★ BYTE-NEUTRAL OFF (dev-toggle): con OFF, coCastBonus(sync pleno disponible)==0 + forageChargePreview==0 + idx==0 + cast==0 ⇒ 0 fichas al seam (byte-id)",
     neutOK, JSON.stringify(neutral));

  // 13 ★ ORTHOGONALITY
  const orth = await page.evaluate((args) => {
    const { Z } = args;
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const before = window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } }).driveCast;
    const snap = () => JSON.stringify({ coFlank: window.__dev.coFlank(), coFocus: window.__dev.coFocus(), coAdvance: window.__dev.coAdvance(), coCohesion: window.__dev.coCohesion(), coTank: window.__dev.coTank(), coSupport: window.__dev.coSupport(), coKill: window.__dev.coKill(), coPresence: window.__dev.coPresence(), coFlee: window.__dev.coFlee(), partyVital: window.__dev.partyVital() });
    const peersOn = snap();
    const prev = { fl: window.__dev.coFlank().enabled, fo: window.__dev.coFocus().enabled, ca: window.__dev.coAdvance().enabled, co: window.__dev.coCohesion().enabled, ct: window.__dev.coTank().enabled, cs: window.__dev.coSupport().enabled, ck: window.__dev.coKill().enabled, cp: window.__dev.coPresence().enabled, cf: window.__dev.coFlee().enabled, pv: window.__dev.partyVital().enabled };
    window.__dev.coFlank({ enabled: !prev.fl }); window.__dev.coFocus({ enabled: !prev.fo }); window.__dev.coAdvance({ enabled: !prev.ca }); window.__dev.coCohesion({ enabled: !prev.co }); window.__dev.coTank({ enabled: !prev.ct }); window.__dev.coSupport({ enabled: !prev.cs }); window.__dev.coKill({ enabled: !prev.ck }); window.__dev.coPresence({ enabled: !prev.cp }); window.__dev.coFlee({ enabled: !prev.cf }); window.__dev.partyVital({ enabled: !prev.pv });
    const after = window.__dev.coCast({ castProbeLive: true }).castProbeLive;
    window.__dev.coFlank({ enabled: prev.fl }); window.__dev.coFocus({ enabled: prev.fo }); window.__dev.coAdvance({ enabled: prev.ca }); window.__dev.coCohesion({ enabled: prev.co }); window.__dev.coTank({ enabled: prev.ct }); window.__dev.coSupport({ enabled: prev.cs }); window.__dev.coKill({ enabled: prev.ck }); window.__dev.coPresence({ enabled: prev.cp }); window.__dev.coFlee({ enabled: prev.cf }); window.__dev.partyVital({ enabled: prev.pv });
    const peersRestored = snap();
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    const peersUnchanged = peersOn === peersRestored;
    const sigUnchanged = before.score === after.score && before.cast === after.cast;
    return { peersUnchanged, sigUnchanged, beforeScore: before.score, afterScore: after.score, beforeCast: before.cast, afterCast: after.cast };
  }, { Z });
  ok("13 ★ ORTOGONALIDAD coCastFind ⊥ peers: la señal de co-cast (score/cast) NO cambia al togglear CO-FLANK #145/CO-FOCUS #144/CO-ADVANCE #143/CO-COHESION #142/CO-TANK #140/CO-SUPPORT #139/CO-KILL #138/CO-PRESENCE #137/CO-FLEE #141/PARTY-VITAL #132; peers restaurados == estado previo (0 leak cruzado)",
     orth.peersUnchanged && orth.sigUnchanged, JSON.stringify(orth));

  // 14 ★ 0-REGRESSION CENSUS (INVERTED LIVE-ON): served config — 74 `_SURGE` totales, 74 enabled:true, off=[] (CO_CAST #146 LIVE + los 73 priores).
  const census = [...cfgSrc.matchAll(/export const ([A-Z_]+_SURGE)\s*=\s*\{[\s\S]*?enabled:\s*(true|false)/g)].map(m => [m[1], m[2]]);
  const total = census.length;
  const falses = census.filter(([, v]) => v !== "true").map(([n]) => n);
  const trues = census.filter(([, v]) => v === "true").length;
  const coCastLive = census.find(([n]) => n === "CO_CAST_SURGE");
  const coFlankLive = census.find(([n]) => n === "CO_FLANK_SURGE");
  const censusOK = total === 74 && trues === 74 && falses.length === 0 && coCastLive && coCastLive[1] === "true" && coFlankLive && coFlankLive[1] === "true";
  ok("14 ★ LIVE-ON 0-REGRESIÓN CENSUS (INVERTED): served config 74 `_SURGE` totales, 74 enabled:true, off=[] (CO_CAST_SURGE #146 LIVE + CO_FLANK_SURGE #145 LIVE + los 72 priores)",
     censusOK, `total=${total} true=${trues} false=${JSON.stringify(falses)} coCast=${coCastLive ? coCastLive[1] : "?"} coFlank=${coFlankLive ? coFlankLive[1] : "?"}`);

  // 15 render badge "Conjuro:" drawn ON+salvo / not OFF + fps
  const badge = await page.evaluate(async (args) => {
    const { Z } = args;
    const drive = () => window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } });
    const cv = document.querySelector("canvas"); const cx = cv.getContext("2d");
    let cnt = 0; const orig = cx.fillText.bind(cx);
    cx.fillText = function (t, x, y) { if (typeof t === "string" && t.indexOf("Conjuro:") >= 0) cnt++; return orig(t, x, y); };
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    cnt = 0; const t0 = performance.now(); let frames = 0;
    await new Promise((res) => { const loop = () => { frames++; drive(); if (performance.now() - t0 > 700) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const onCnt = cnt; const fps = Math.round(frames / ((performance.now() - t0) / 1000));
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    const enAtOff = window.__dev.coCast().enabled;
    cnt = 0; const t1 = performance.now();
    await new Promise((res) => { const loop = () => { if (performance.now() - t1 > 400) return res(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    const offCnt = cnt;
    cx.fillText = orig;
    return { onCnt, offCnt, fps, enAtOff };
  }, { Z });
  ok("15 render badge \"Conjuro:\" se DIBUJA ON+salvo (U>0, re-driven cada frame) y NO OFF (U 0) + fps sano (label ÚNICO ⊥ #145 'Tenaza:'/#144 'Diana:'/#139 'Socorro:'/#138 'Cuadrilla:')",
     badge.onCnt > 0 && badge.offCnt === 0 && badge.fps >= 30, `on=${badge.onCnt} off=${badge.offCnt} fps=${badge.fps} enAtOff=${badge.enAtOff}`);

  // screenshot evidence
  await page.evaluate((args) => { const { Z } = args; window.__dev.coCast({ enabled: true }); window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } }); window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } }); }, { Z });
  await sleep(120);
  await page.screenshot({ path: join(OUT, "selfverify.png") });
  await page.evaluate(() => { window.__dev.coCast({ clearCast: true }); window.__dev.coCast({ enabled: false }); });

  // 16 ★ NORTH STAR — 2-client convergence (MANDATORY sev-1). LIVE-ON: U=3 ⇒ score2/cast3/players3/tier2/charge>0 (co-cast bounty grants).
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
    window.__dev.coCast({ enabled: true });
    window.__dev.coCast({ tp: { tx: Z.forest[0], ty: Z.forest[1] } });
    const dv = window.__dev.coCast({ driveCast: { players: [{ cast: true }, { cast: true }, { cast: true }], wipe: true } }).driveCast;
    const vm = window.__dev.coCast();
    const lut = [[2, 2], [3, 3], [1, 1], [4, 4]].map(([casters, P]) => { const m = window.__dev.coCast({ castProbe: { casters, players: P } }).castProbe; return { p: m.players, U: m.cast, rankTier: m.rankTier, charge: m.charge }; });
    const live = window.__dev.coCast({ castProbeLive: true }).castProbeLive;
    const fp = JSON.stringify(window.__dev.worldFingerprint(FPARG));
    window.__dev.coCast({ clearCast: true });
    window.__dev.coCast({ enabled: false });
    return { score: dv.score, idx: dv.idx, cast: dv.cast, players: dv.players, tier: vm.tier, charge: vm.charge, liveField: live.field, liveScore: live.score, liveCast: live.cast, livePlayers: live.players, lut, fp };
  }, { Z, FPARG });
  const A = await readVM(page);
  const B = await readVM(pageB);
  const conv = A.score === B.score && A.idx === B.idx && A.cast === B.cast && A.players === B.players && A.tier === B.tier && A.charge === B.charge && A.liveField === B.liveField && A.liveScore === B.liveScore && A.liveCast === B.liveCast && A.livePlayers === B.livePlayers && JSON.stringify(A.lut) === JSON.stringify(B.lut) && A.fp === B.fp;
  const onPathOK = A.score === 2 && A.cast === 3 && A.players === 3 && A.tier === 2 && A.charge > 0;
  ok("16 ★ NORTH STAR 2-CLIENTE (MANDATORY sev-1): LIVE-ON salva U=3 ⇒ score2/cast3/players3/tier2/charge>0 (CONJURO activo, co-cast bounty grants) AND score/idx/cast/players/tier/charge + castProbeLive(field,cast,players,score) + castProbe LUT (U enteros) + worldFingerprint IDÉNTICOS byte-a-byte A==B (0 desync)",
     conv && onPathOK, `A={score:${A.score},idx:${A.idx},cast:${A.cast},players:${A.players},tier:${A.tier},charge:${A.charge},liveField:${A.liveField},liveCast:${A.liveCast},fpLen:${A.fp.length}} B={score:${B.score},idx:${B.idx},cast:${B.cast},players:${B.players},tier:${B.tier},charge:${B.charge},liveField:${B.liveField},liveCast:${B.liveCast},fpLen:${B.fp.length}} fpMatch=${A.fp === B.fp} onPathOK=${onPathOK}`);
  await page.evaluate(() => window.__dev.coCast({ enabled: false }));
  await pageB.evaluate(() => window.__dev.coCast({ enabled: false }));

  // 18 ★ SERVED LIVE BUILD (gh-pages, no publish lag): root 200 + version.json == b8c147402d1f/815 (NEW ≠ old 251653b6d194) + served sim/config.js CO_CAST_SURGE enabled:true + census 74/74 off=[].
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
    const lCoCast = lcensus.find(([n]) => n === "CO_CAST_SURGE");
    const lCoFlank = lcensus.find(([n]) => n === "CO_FLANK_SURGE");
    const servedOK = rootRes.status === 200 && ver.build === "b8c147402d1f" && ver.files === 815 && lTotal === 74 && lTrues === 74 && lFalses.length === 0 && lCoCast && lCoCast[1] === "true" && lCoFlank && lCoFlank[1] === "true";
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json b8c147402d1f/815 (NEW ≠ old 251653b6d194) + served sim/config.js CO_CAST_SURGE enabled:true + census 74/74 off=[]",
       servedOK, `rootStatus=${rootRes.status} build=${ver.build} files=${ver.files} census total=${lTotal} true=${lTrues} false=${JSON.stringify(lFalses)} coCast=${lCoCast ? lCoCast[1] : "?"} coFlank=${lCoFlank ? lCoFlank[1] : "?"}`);
  } catch (e) {
    ok("18 ★ SERVED LIVE BUILD (gh-pages): root 200 + version.json b8c147402d1f/815 + config CO_CAST_SURGE enabled:true", false, `FETCH ERROR ${String(e)}`);
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
